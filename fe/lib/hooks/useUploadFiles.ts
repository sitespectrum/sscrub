import { useAtom } from "jotai";
import { useEffect, useRef } from "react";
import { pendingUploadsAtom } from "../atoms";
import { PendingUpload } from "../types";
import { uploadFile } from "../upload";
import { useQueryClient } from "@tanstack/react-query";

const CONCURRENCY = 3;

export function useUploadFiles(sinkId: string) {
  const [pendingUploads, setPendingUploads] = useAtom(pendingUploadsAtom);
  const queryClient = useQueryClient();

  const lockRef = useRef<string[]>([]);

  useEffect(() => {
    const uploadingCount = pendingUploads.filter(
      (x) => x.state == "uploading",
    ).length;

    const remainingCount = pendingUploads.filter(
      (x) => x.state == "queued" && !lockRef.current.includes(x.internalId),
    ).length;

    if (uploadingCount < CONCURRENCY && remainingCount > 0) {
      const pending = pendingUploads.find(
        (x) => x.state == "queued" && !lockRef.current.includes(x.internalId),
      );
      if (!pending) return;
      lockRef.current.push(pending.internalId);

      uploadFile(pending.file, {
        sinkId,
        signal: pending.abortController.signal,
        onProgress: (uploaded, _) =>
          setPendingUploads((prev) =>
            prev.map((x) =>
              x.internalId == pending?.internalId
                ? {
                    ...x,
                    uploadedBytes: uploaded,
                  }
                : x,
            ),
          ),
        onSuccess: () => {
          setPendingUploads((prev) =>
            prev.map((x) =>
              x.internalId == pending?.internalId
                ? {
                    ...x,
                    uploadedBytes: x.totalBytes,
                    state: "done",
                  }
                : x,
            ),
          );
          queryClient.invalidateQueries({
            queryKey: ["get", "/api/assets"],
          });
        },
      });

      setPendingUploads((prev) =>
        prev.map((x) =>
          x.internalId == pending?.internalId
            ? {
                ...x,
                state: "uploading",
              }
            : x,
        ),
      );

      lockRef.current = lockRef.current.filter((x) => x != pending.internalId);
    }
  }, [pendingUploads]);

  const uploadFiles = async (files: FileList) => {
    const pendings: PendingUpload[] = [];

    for (const file of files) {
      pendings.push({
        internalId: crypto.randomUUID(),
        abortController: new AbortController(),
        file,
        state: "queued",
        totalBytes: file.size,
        uploadedBytes: 0,
        sinkId,
      });
    }

    setPendingUploads((prev) => [...prev, ...pendings]);
  };

  return { uploadFiles };
}
