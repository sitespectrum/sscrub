"use client";

import { Button } from "@/components/ui/button";
import { useClips, useSinks } from "@/lib/placeholder/hooks";
import { cn } from "@/lib/utils";
import { ChevronDownIcon, RotateCwIcon, SparklesIcon } from "lucide-react";
import { useMemo, useState } from "react";

export function UploadTray() {
  const { data: sinks } = useSinks();
  const { data: all } = useClips();
  const clips =
    useMemo(() => all?.filter((clip) => clip.status !== "Ready"), [all]) ?? [];
  const [open, setOpen] = useState(false);
  if (!clips.length) return null;
  const uploading = clips.filter((c) => c.status === "Uploading");
  const overall =
    uploading.reduce((a, b) => a + (b.progress ?? 0), 0) /
    Math.max(1, uploading.length);

  return (
    <div className="m-2 rounded-md bg-well ring-1 ring-hairline ring-inset shadow-2xl shadow-black/60 overflow-hidden">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center gap-2.5 px-3 h-10 text-xs"
      >
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
              strokeDasharray={`${overall * 50.3} 50.3`}
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span className="font-medium flex-1 text-left">
          Uploading {uploading.length} files
          <span className="text-muted-foreground font-normal">
            {" "}
            · {clips.length - uploading.length} more in pipeline
          </span>
        </span>
        <ChevronDownIcon
          className={cn(
            "size-3.5 text-muted-foreground transition-transform",
            !open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="border-t border-hairline py-1">
          {clips.map((clip) => {
            const sink = sinks?.find((x) => x.id === clip.sinkId)!;
            return (
              <div
                key={clip.id}
                className="px-3 py-1.5 flex items-center gap-2.5"
              >
                {/* <Frame
                  sink={s}
                  clip={{ ...c, status: "Ready" }}
                  t={c.start}
                  grain={false}
                  thumb
                  className="h-6 aspect-video rounded-[3px]"
                /> */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-[0.7rem]">
                    <span className="tc truncate font-medium">
                      {clip.fileName}
                    </span>
                    <span className="text-muted-foreground truncate">
                      {sink.name}
                    </span>
                  </div>
                  {clip.status === "Uploading" ? (
                    <div className="mt-1 h-0.75 rounded-full bg-white/8 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-playhead"
                        style={{ width: `${(clip.progress ?? 0) * 100}%` }}
                      />
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "text-[0.65rem]",
                        clip.status === "Failed"
                          ? "text-reject"
                          : "text-muted-foreground",
                      )}
                    >
                      {clip.status === "Processing"
                        ? "Generating proxies…"
                        : "No capture time in metadata"}
                    </div>
                  )}
                </div>
                {clip.status === "Failed" ? (
                  <Button size="icon-xs" variant="ghost" title="Retry">
                    <RotateCwIcon />
                  </Button>
                ) : (
                  <span className="tc text-[0.6rem] text-muted-foreground">
                    {clip.status === "Uploading" ? (
                      `${Math.round((clip.progress ?? 0) * 100)}%`
                    ) : (
                      <SparklesIcon className="size-3" />
                    )}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
