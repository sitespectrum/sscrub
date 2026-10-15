import { StartUploadResponse } from "./api/sscrub-api-schema";
import { API_URL } from "./constants";
import { HttpError, withRetry } from "./utils";

const PART_CONCURRENCY = 4;
const MAX_RETRIES = 5;

interface Part {
  partNumber: number;
  eTag: string;
}

export type UploadOptions = {
  sinkId: string;
  signal?: AbortSignal;
  onProgress?: (uploaded: number, total: number) => void;
  onSuccess?: (id: string, url: string) => void;
};

export async function uploadFile(file: File, options: UploadOptions) {
  const startRes = await fetch(`${API_URL}/api/uploads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fileName: file.name,
      size: file.size,
      contentType: file.type || "application/octet-stream",
      sinkId: options.sinkId,
    }),
  });

  const startData: StartUploadResponse = await startRes.json();

  const loaded = new Array<number>(startData.urls.length).fill(0);
  const reportProgress = () =>
    options.onProgress?.(
      loaded.reduce((a, b) => a + b, 0),
      file.size,
    );

  const parts: Part[] = new Array(startData.urls.length);
  let next = 0;

  const worker = async () => {
    while (next < startData.urls.length) {
      const i = next++;
      const partBlob = file.slice(
        startData.partSize * i,
        Math.min(startData.partSize * (i + 1), file.size),
      );

      const eTag = await withRetry(
        () =>
          uploadPart(
            startData.urls[i],
            partBlob,
            (n) => {
              loaded[i] = n;
              reportProgress();
            },
            options.signal,
          ),
        options.signal,
        MAX_RETRIES,
      );

      parts[i] = {
        partNumber: i + 1,
        eTag,
      };
    }
  };

  try {
    await Promise.all(
      Array.from(
        { length: Math.min(PART_CONCURRENCY, startData.urls.length) },
        worker,
      ),
    );
  } catch (err) {
    fetch(`${API_URL}/uploads/${startData.id}`, {
      method: "DELETE",
    }).catch(() => {});

    throw err;
  }

  const completeRes = await fetch(
    `${API_URL}/api/uploads/${startData.id}/complete`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parts,
      }),
    },
  );
  if (!completeRes.ok) {
    throw new HttpError(completeRes.status, "Error completing upload");
  }

  options.onSuccess?.(
    startData.id,
    `${API_URL}/api/assets/${startData.id}/presignedUrl`,
  );
}

function uploadPart(
  url: string,
  blob: Blob,
  onLoaded: (n: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open("PUT", url);
    xhr.onprogress = (e) => onLoaded(e.loaded);

    xhr.onload = () => {
      const eTag = xhr.getResponseHeader("ETag");
      if (xhr.status >= 200 && xhr.status < 300 && eTag) {
        onLoaded(blob.size);
        resolve(eTag);
      } else {
        reject(
          new HttpError(
            xhr.status,
            eTag ? `PUT ${xhr.status}` : "Missing ETag",
          ),
        );
      }
    };

    xhr.onerror = () => reject(new HttpError(0, "Network error"));
    signal?.addEventListener(
      "abort",
      () => {
        xhr.abort();
        reject(signal.reason);
      },
      { once: true },
    );

    xhr.send(blob);
  });
}
