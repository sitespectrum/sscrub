"use client";

import { uploadFile } from "@/lib/upload";
import { useRef, useState } from "react";

export function Uploader() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [videoUrl, setVideoUrl] = useState("");

  const upload = async () => {
    const file = fileInputRef.current?.files?.item(0);
    if (!file) {
      console.log("No file selected");
      return;
    }

    uploadFile(file, {
      sinkId: "01a12f29-bc04-715b-a11c-ea74720b1109",
      onProgress: (uploaded, total) =>
        console.log(`Uploaded: ${uploaded} / ${total} bytes`),
      onSuccess: (_, url) => setVideoUrl(url),
    });
  };

  return (
    <div>
      <input ref={fileInputRef} type="file" name="" id="" />

      <button onClick={upload}>Upload</button>

      {videoUrl && (
        <video className="w-auto h-full" controls src={videoUrl}></video>
      )}
    </div>
  );
}
