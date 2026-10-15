"use client";

import { Spinner } from "@/components/ui/spinner";
import { $api } from "@/lib/api/openapi-clients";
import { pendingUploadsAtom } from "@/lib/atoms";
import { cn } from "@/lib/utils";
import { useAtomValue } from "jotai";
import {
  CheckCircle2Icon,
  CheckIcon,
  ChevronDownIcon,
  HourglassIcon,
} from "lucide-react";
import { useState } from "react";

export function UploadTray() {
  const { data: sinks, isLoading: sinksLoading } = $api.useQuery(
    "get",
    "/api/sinks",
  );
  const pendingUploads = useAtomValue(pendingUploadsAtom);
  const [open, setOpen] = useState(false);

  const uploadingCount = pendingUploads.filter(
    (x) => x.state == "queued" || x.state == "uploading",
  ).length;
  const processingCount = pendingUploads.filter(
    (x) => x.state == "processing",
  ).length;

  const overallProgress =
    pendingUploads.reduce(
      (a, b) => a + b.uploadedBytes / (b.totalBytes || 0),
      0,
    ) / Math.max(1, uploadingCount);
  const allDone = pendingUploads.every((x) => x.state == "done");

  // if (sinksLoading)
  //   return (
  //     <Skeleton className="m-2 rounded-md h-10 bg-well ring-1 ring-hairline ring-inset overflow-hidden" />
  //   );

  return (
    <div className="m-2 rounded-md bg-well ring-1 ring-hairline ring-inset overflow-y-auto overflow-x-hidden max-h-1/3">
      {pendingUploads.length > 0 && (
        <button
          onClick={() => setOpen((prev) => !prev)}
          className="w-full flex items-center gap-2.5 px-3 h-10 text-xs sticky top-0 bg-well border-b border-hairline py-1"
        >
          {allDone ? (
            <>
              <CheckCircle2Icon className="size-5 text-emerald-500" />
            </>
          ) : (
            <>
              <span className="relative size-5">
                <svg viewBox="0 0 20 20" className="size-5 -rotate-90">
                  <circle
                    cx="10"
                    cy="10"
                    r="8"
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity=".12"
                    strokeWidth="2.5"
                  />
                  <circle
                    cx="10"
                    cy="10"
                    r="8"
                    fill="none"
                    stroke="var(--playhead)"
                    strokeWidth="2.5"
                    strokeDasharray={`${overallProgress * 50.3} 50.3`}
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </>
          )}
          {allDone ? (
            <span className="font-medium flex-1 text-left">
              Upload completed
            </span>
          ) : (
            <span className="font-medium flex-1 text-left">
              Uploading {uploadingCount} files
              {processingCount > 0 && (
                <span className="text-muted-foreground font-normal">
                  {" "}
                  · {processingCount} processing
                </span>
              )}
            </span>
          )}
          <ChevronDownIcon
            className={cn(
              "size-3.5 text-muted-foreground transition-transform",
              !open && "rotate-180",
            )}
          />
        </button>
      )}
      {open && pendingUploads.length > 0 && (
        <div className="">
          {pendingUploads
            .filter((x) => x.state == "done")
            .map((upload) => {
              const sink = sinks?.find((x) => x.id === upload.sinkId)!;
              const progress = 100;

              return (
                <div
                  key={upload.internalId}
                  className="px-3 py-1.5 flex items-center gap-2.5"
                >
                  <span className="tc text-[0.6rem] text-muted-foreground">
                    <CheckIcon className="size-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-[0.7rem]">
                      <span className="tc truncate font-medium">
                        {upload.file.name}
                      </span>
                      <span className="text-muted-foreground truncate">
                        {sink.name}
                      </span>
                    </div>
                    <div className="mt-1 h-0.75 rounded-full bg-white/8 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-playhead"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                  <div
                    className={cn("text-[0.65rem]", "text-muted-foreground")}
                  >
                    <span className="tc text-[0.6rem] text-muted-foreground">
                      Done
                    </span>
                  </div>
                </div>
              );
            })}

          {pendingUploads
            .filter((x) => x.state == "uploading")
            .map((upload) => {
              const sink = sinks?.find((x) => x.id === upload.sinkId)!;
              const progress = Math.round(
                (upload.uploadedBytes / (upload.totalBytes || 1)) * 100,
              );

              return (
                <div
                  key={upload.internalId}
                  className="px-3 py-1.5 flex items-center gap-2.5"
                >
                  <span className="tc text-[0.6rem] text-muted-foreground">
                    <Spinner className="size-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-[0.7rem]">
                      <span className="tc truncate font-medium">
                        {upload.file.name}
                      </span>
                      <span className="text-muted-foreground truncate">
                        {sink.name}
                      </span>
                    </div>
                    <div className="mt-1 h-0.75 rounded-full bg-white/8 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-playhead"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                  <div
                    className={cn("text-[0.65rem]", "text-muted-foreground")}
                  >
                    <span className="tc text-[0.6rem] text-muted-foreground">
                      {progress}%
                    </span>
                  </div>
                </div>
              );
            })}

          {pendingUploads
            .filter((x) => x.state == "queued")
            .map((upload) => {
              const sink = sinks?.find((x) => x.id === upload.sinkId)!;

              return (
                <div
                  key={upload.internalId}
                  className="px-3 py-1.5 flex items-center gap-2.5"
                >
                  <span className="tc text-[0.6rem] text-muted-foreground">
                    <HourglassIcon className="size-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-[0.7rem]">
                      <span className="tc truncate font-medium">
                        {upload.file.name}
                      </span>
                      <span className="text-muted-foreground truncate">
                        {sink.name}
                      </span>
                    </div>
                    <div
                      className={cn("text-[0.65rem]", "text-muted-foreground")}
                    >
                      Queued for upload...
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
