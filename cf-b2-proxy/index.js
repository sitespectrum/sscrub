//
// Proxy Backblaze S3 compatible API requests, sending notifications to a webhook
//
// Adapted from https://github.com/obezuk/worker-signed-s3-template
//
import { AwsClient } from 'aws4fetch'

const UNSIGNABLE_HEADERS = [
    // These headers appear in the request, but are never passed upstream
    'x-forwarded-proto',
    'x-real-ip',
    // We can't include accept-encoding in the signature because Cloudflare
    // sets the incoming accept-encoding header to "gzip, br", then modifies
    // the outgoing request to set accept-encoding to "gzip".
    // Not cool, Cloudflare!
    'accept-encoding',
    // Conditional headers are not consistently passed upstream
    'if-match',
    'if-modified-since',
    'if-none-match',
    'if-range',
    'if-unmodified-since',
    // Never pass the client's cookies, such as the Cloudflare Access CF_Authorization cookie, upstream
    'cookie',
];

// URL needs colon suffix on protocol, and port as a string
const HTTPS_PROTOCOL = "https:";
const HTTPS_PORT = "443";

// How many times to retry a range request where the response is missing content-range
const RANGE_RETRY_ATTEMPTS = 3;

// Query parameters carrying the presigned URL expiry (Unix seconds) and signature
const EXPIRES_PARAM = "exp";
const SIGNATURE_PARAM = "sig";

const textEncoder = new TextEncoder();

// Return the request path with PRESIGNED_PATH_PREFIX removed, or null if the path does not
// start with the prefix, or no prefix is configured
function stripPresignedPrefix(pathname, env) {
    const prefix = String(env['PRESIGNED_PATH_PREFIX'] ?? '').replace(/\/+$/, '');
    if (!prefix) {
        return null;
    }
    if (pathname === prefix) {
        return '/';
    }
    return pathname.startsWith(prefix + '/') ? pathname.slice(prefix.length) : null;
}

// Decode unpadded base64url, returning null if the input is malformed
function base64UrlDecode(input) {
    try {
        const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
        const binary = atob(base64 + '='.repeat((4 - base64.length % 4) % 4));
        return Uint8Array.from(binary, c => c.charCodeAt(0));
    } catch {
        return null;
    }
}

// Check that the incoming URL was presigned by a holder of URL_SIGNING_SECRET.
//
// The signature is base64url(HMAC-SHA256(URL_SIGNING_SECRET, "<exp>\n<path>")), where
// <exp> is the expiry time in Unix seconds and <path> is the percent-decoded URL path,
// after removing PRESIGNED_PATH_PREFIX, including the leading slash, e.g. "/videos/my clip.mp4".
//
// Returns null if the URL is valid, otherwise a Response to send to the client.
async function verifyPresignedUrl(url, env) {
    const secret = env['URL_SIGNING_SECRET'];
    if (!secret) {
        console.error("PRESIGNED_PATH_PREFIX is set, but URL_SIGNING_SECRET is not set");
        return new Response(null, {
            status: 500,
            statusText: "Internal Server Error"
        });
    }

    const forbidden = new Response(null, {
        status: 403,
        statusText: "Forbidden"
    });

    const expires = url.searchParams.get(EXPIRES_PARAM);
    const signature = base64UrlDecode(url.searchParams.get(SIGNATURE_PARAM) ?? '');
    if (!expires || !/^\d{1,12}$/.test(expires) || !signature || signature.length === 0) {
        return forbidden;
    }

    if (Number(expires) < Math.floor(Date.now() / 1000)) {
        return forbidden;
    }

    let path;
    try {
        path = decodeURIComponent(url.pathname);
    } catch {
        return forbidden;
    }

    const key = await crypto.subtle.importKey(
        "raw",
        textEncoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"]
    );

    // crypto.subtle.verify compares in constant time
    const valid = await crypto.subtle.verify(
        "HMAC",
        key,
        signature,
        textEncoder.encode(`${expires}\n${path}`)
    );

    return valid ? null : forbidden;
}

// Filter out cf-* and any other headers we don't want to include in the signature
function filterHeaders(headers, env) {
    // Suppress irrelevant IntelliJ warning
    // noinspection JSCheckFunctionSignatures
    return new Headers(Array.from(headers.entries())
        .filter(pair => !(
            UNSIGNABLE_HEADERS.includes(pair[0])
            || pair[0].startsWith('cf-')
            || ('ALLOWED_HEADERS' in env && !env['ALLOWED_HEADERS'].includes(pair[0]))
        ))
    );
}

function createHeadResponse(response) {
    return new Response(null, {
        headers: response.headers,
        status: response.status,
        statusText: response.statusText
    });
}

function isListBucketRequest(env, path) {
    const pathSegments = path.split('/');

    return (env['BUCKET_NAME'] === "$path" && pathSegments.length < 2) // https://endpoint/bucket-name/
        || (env['BUCKET_NAME'] !== "$path" && path.length === 0); // https://bucket-name.endpoint/ or https://endpoint/
}

// Supress IntelliJ's "unused default export" warning
// noinspection JSUnusedGlobalSymbols
export default {
    async fetch(request, env) {
        // Only allow GET and HEAD methods
        if (!['GET', 'HEAD'].includes(request.method)){
            return new Response(null, {
                status: 405,
                statusText: "Method Not Allowed"
            });
        }

        const url = new URL(request.url);

        // Paths under PRESIGNED_PATH_PREFIX must be presigned with URL_SIGNING_SECRET. All
        // other paths are served as-is: Cloudflare Access must protect them, with a Bypass
        // policy for the prefix. Note that the URL parser has already resolved any "." and ".."
        // segments.
        const presignedPath = stripPresignedPrefix(url.pathname, env);
        if (presignedPath !== null) {
            url.pathname = presignedPath;
            const errorResponse = await verifyPresignedUrl(url, env);
            if (errorResponse) {
                return errorResponse;
            }
            // The signature only covers the path, so don't pass any query
            // parameters (versionId, response-content-type, etc.) upstream
            url.search = '';
        }

        // Incoming protocol and port is taken from the worker's environment.
        // Local dev mode uses plain http on 8787, and it's possible to deploy
        // a worker on plain http. B2 only supports https on 443
        url.protocol = HTTPS_PROTOCOL;
        url.port = HTTPS_PORT;

        // Remove leading slashes from path
        let path = url.pathname.replace(/^\//, '');
        // Remove trailing slashes
        path = path.replace(/\/$/, '');

        // Reject list bucket requests unless configuration allows it
        if (isListBucketRequest(env, path) && String(env['ALLOW_LIST_BUCKET']) !== "true") {
            return new Response(null, {
                status: 404,
                statusText: "Not Found"
            });
        }

        // Set RCLONE_DOWNLOAD to "true" to use rclone with --b2-download-url
        // See https://rclone.org/b2/#b2-download-url
        const rcloneDownload = String(env["RCLONE_DOWNLOAD"]) === 'true';

        // Set upstream target hostname.
        switch (env['BUCKET_NAME']) {
            case "$path":
                // Bucket name is initial segment of URL path
                url.hostname = env['B2_ENDPOINT'];
                break;
            case "$host":
                // Bucket name is initial subdomain of the incoming hostname
                url.hostname = url.hostname.split('.')[0] + '.' + env['B2_ENDPOINT'];
                break;
            default:
                // Bucket name is specified in the BUCKET_NAME variable
                url.hostname = env['BUCKET_NAME'] + "." + env['B2_ENDPOINT'];
                break;
        }

        // Certain headers, such as x-real-ip, appear in the incoming request but
        // are removed from the outgoing request. If they are in the outgoing
        // signed headers, B2 can't validate the signature.
        const headers = filterHeaders(request.headers, env);

        // Create an S3 API client that can sign the outgoing request
        const client = new AwsClient({
            "accessKeyId": env['B2_APPLICATION_KEY_ID'],
            "secretAccessKey": env['B2_APPLICATION_KEY'],
            "service": "s3",
        });

        // Save the request method, so we can process responses for HEAD requests appropriately
        const requestMethod = request.method;

        if (rcloneDownload) {
            if (env['BUCKET_NAME'] === "$path") {
                // Remove leading file/ prefix from the path
                url.pathname = path.replace(/^file\//, "");
            } else {
                // Remove leading file/{bucket_name}/ prefix from the path 
                url.pathname = path.replace(/^file\/[^/]+\//, "");
            }            
        }

        // Sign the outgoing request
        //
        // For HEAD requests Cloudflare appears to change the method on the outgoing request to GET (#18), which
        // breaks the signature, resulting in a 403. So, change all HEADs to GETs. This is not too inefficient,
        // since we won't read the body of the response if the original request was a HEAD.
        const signedRequest = await client.sign(url.toString(), {
            method: 'GET',
            headers: headers
        });

        // For large files, Cloudflare will return the entire file, rather than the requested range
        // So, if there is a range header in the request, check that the response contains the
        // content-range header. If not, abort the request and try again.
        // See https://community.cloudflare.com/t/cloudflare-worker-fetch-ignores-byte-request-range-on-initial-request/395047/4
        if (signedRequest.headers.has("range")) {
            let attempts = RANGE_RETRY_ATTEMPTS;
            let response;
            do {
                let controller = new AbortController();
                response = await fetch(signedRequest.url, {
                    method: signedRequest.method,
                    headers: signedRequest.headers,
                    signal: controller.signal,
                });
                if (response.headers.has("content-range")) {
                    // Only log if it didn't work first time
                    if (attempts < RANGE_RETRY_ATTEMPTS) {
                        console.log(`Retry for ${signedRequest.url} succeeded - response has content-range header`);
                    }
                    // Break out of loop and return the response
                    break;
                } else if (response.ok) {
                    attempts -= 1;
                    console.error(`Range header in request for ${signedRequest.url} but no content-range header in response. Will retry ${attempts} more times`);
                    // Do not abort on the last attempt, as we want to return the response
                    if (attempts > 0) {
                        controller.abort();
                    }
                } else {
                    // Response is not ok, so don't retry
                    break;
                }
            } while (attempts > 0);

            if (attempts <= 0) {
                console.error(`Tried range request for ${signedRequest.url} ${RANGE_RETRY_ATTEMPTS} times, but no content-range in response.`);
            }

            if (requestMethod === 'HEAD') {
                // Original request was HEAD, so return a new Response without a body
                return createHeadResponse(response);
            }

            // Return whatever response we have rather than an error response
            // This response cannot be aborted, otherwise it will raise an exception
            return response;
        }

        // Send the signed request to B2
        const fetchPromise = fetch(signedRequest);

        if (requestMethod === 'HEAD') {
            const response = await fetchPromise;
            // Original request was HEAD, so return a new Response without a body
            return createHeadResponse(response);
        }

        // Return the upstream response unchanged
        return fetchPromise;
    },
};
