export interface PendingUpload {
  internalId: string;
  file: File;
  assetId?: string;
  sinkId: string;
  abortController: AbortController;
  uploadedBytes: number;
  totalBytes: number;
  state: "queued" | "uploading" | "done" | "processing";
}
