// Presigns URLs for the Cloudflare B2 proxy worker.
//
// The worker accepts https://<worker><PRESIGNED_PATH_PREFIX>/<object key>?exp=<unix seconds>&sig=<signature>,
// where signature = base64url(HMAC-SHA256(URL_SIGNING_SECRET, "<exp>\n/<object key>")). Note that the
// prefix is not part of the signed path.
//
// Registration (Program.cs):
//
//   builder.Services.Configure<MediaUrlOptions>(builder.Configuration.GetSection("MediaUrls"));
//   builder.Services.AddSingleton<MediaUrlSigner>();
//
// Configuration (appsettings.json / user secrets / env vars):
//
//   "MediaUrls": {
//     "BaseUrl": "https://media.example.com/presigned",
//     "SigningSecret": "<same value as the worker's URL_SIGNING_SECRET>",
//     "Lifetime": "00:15:00"
//   }
//
// Endpoint:
//
//   app.MapGet("/api/media/{**key}", (string key, MediaUrlSigner signer) =>
//   {
//       // Check here that the current user may access `key`!
//       return Results.Redirect(signer.Sign(key));
//   }).RequireAuthorization();

using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Options;

public sealed class MediaUrlOptions
{
    public required string BaseUrl { get; set; }
    public required string SigningSecret { get; set; }
    public TimeSpan Lifetime { get; set; } = TimeSpan.FromMinutes(15);
}

public sealed class MediaUrlSigner(IOptions<MediaUrlOptions> options)
{
    private readonly string _baseUrl = options.Value.BaseUrl.TrimEnd('/');
    private readonly byte[] _secret = Encoding.UTF8.GetBytes(options.Value.SigningSecret);
    private readonly long _lifetimeSeconds = (long)options.Value.Lifetime.TotalSeconds;

    public string Sign(string objectKey)
    {
        // Round the expiry up to a window boundary, so repeated requests for the same object
        // within a window get an identical URL, and so hit the browser cache. URLs are valid
        // for between one and two lifetimes.
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var expires = (now / _lifetimeSeconds + 2) * _lifetimeSeconds;

        var path = "/" + objectKey.TrimStart('/');
        var signature = HMACSHA256.HashData(_secret, Encoding.UTF8.GetBytes($"{expires}\n{path}"));

        // Escape each segment, keeping the slashes between them
        var encodedPath = string.Join('/', path.Split('/').Select(Uri.EscapeDataString));

        return $"{_baseUrl}{encodedPath}?exp={expires}&sig={WebEncoders.Base64UrlEncode(signature)}";
    }
}
