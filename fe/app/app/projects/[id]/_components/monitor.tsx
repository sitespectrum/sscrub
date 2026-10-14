"use client";

import { cn } from "@/lib/utils";
import { ArrowRightIcon, CheckIcon, LayoutGridIcon, XIcon } from "lucide-react";
import { Frame } from "@/app/app/_components/frame";
import { fmtDur, fmtTC } from "@/lib/format";
import { type Clip, type SinkView, clipAt, nextClip } from "@/lib/media";

export interface Track {
  sink: SinkView;
  clips: Clip[];
  index: number;
}

export type Flag = "pick" | "reject";

export function Monitor({
  tracks,
  hidden,
  solo,
  t,
  flags,
  onSolo,
  onSeek,
}: {
  tracks: Track[];
  hidden: Set<string>;
  solo: string | null;
  t: number;
  flags: Record<string, Flag>;
  onSolo: (id: string | null) => void;
  onSeek: (t: number) => void;
}) {
  const visible = tracks.filter((tr) => !hidden.has(tr.sink.id));
  const soloTrack = tracks.find((tr) => tr.sink.id === solo);

  if (soloTrack) {
    return (
      <div className="flex-1 min-h-0 flex flex-col bg-black">
        <div className="flex-1 min-h-0 flex p-3">
          <Tile
            track={soloTrack}
            t={t}
            flags={flags}
            onSeek={onSeek}
            size="lg"
          />
        </div>
        <div className="h-21 shrink-0 flex gap-1.5 justify-center px-3 pb-3">
          <button
            onClick={() => onSolo(null)}
            className="h-full aspect-video rounded-[3px] ring-1 ring-white/10 bg-white/3 flex flex-col items-center justify-center gap-1.5 text-[0.6rem] text-white/60 transition-colors hover:text-white hover:bg-white/6"
          >
            <LayoutGridIcon className="size-4" />
            <span>
              All sinks <span className="tc opacity-60 ml-0.5">0</span>
            </span>
          </button>
          {tracks.map((tr) => (
            <div key={tr.sink.id} className="h-full aspect-video">
              <Tile
                track={tr}
                t={t}
                flags={flags}
                onSeek={onSeek}
                size="sm"
                active={tr.sink.id === solo}
                onClick={() => onSolo(tr.sink.id)}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const n = visible.length;
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3;
  const rows = Math.max(1, Math.ceil(n / cols));
  return (
    <div
      className="flex-1 min-h-0 grid gap-1.5 p-3 bg-black"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      }}
    >
      {visible.map((tr) => (
        <Tile
          key={tr.sink.id}
          track={tr}
          t={t}
          flags={flags}
          onSeek={onSeek}
          size="md"
          onClick={() => onSolo(tr.sink.id)}
        />
      ))}
    </div>
  );
}

function Tile({
  track,
  t,
  flags,
  onSeek,
  onClick,
  active,
  size,
}: {
  track: Track;
  t: number;
  flags: Record<string, Flag>;
  onSeek: (t: number) => void;
  onClick?: () => void;
  active?: boolean;
  size: "sm" | "md" | "lg";
}) {
  const { sink } = track;
  const clip = clipAt(track.clips, t);
  const next = clip ? undefined : nextClip(track.clips, t);
  const flag = clip && flags[clip.id];
  const sm = size === "sm";

  return (
    // container query units let the 16:9 frame "contain" inside any cell
    <div
      className="flex-1 min-h-0 min-w-0 h-full flex items-center justify-center"
      style={{ containerType: "size" }}
    >
      <div
        role={onClick ? "button" : undefined}
        onClick={onClick}
        className={cn(
          "group relative aspect-video overflow-hidden bg-neutral-950",
          sm ? "rounded-[3px]" : "rounded-xs",
          onClick && "cursor-pointer",
          "after:absolute after:inset-0 after:pointer-events-none after:rounded-[inherit] after:ring-1 after:ring-inset after:ring-white/8",
          onClick && "hover:after:ring-white/30",
          active && "after:ring-2 after:ring-primary hover:after:ring-primary",
        )}
        style={{ width: "min(100cqw, calc(100cqh * 16 / 9))" }}
      >
        {clip ? (
          // <Frame
          //   sink={sink}
          //   clip={clip}
          //   t={t}
          //   grain={!sm}
          //   thumb={sm}
          //   live={!sm}
          //   className="absolute inset-0"
          // />
          <></>
        ) : (
          <div className="absolute inset-0 hatch flex flex-col items-center justify-center gap-2">
            {!sm && (
              <>
                <span className="text-[0.7rem] text-white/40">
                  No footage at this time
                </span>
                {next && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSeek(next.start);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/6 px-2.5 h-6 text-[0.65rem] text-white/80 ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/10"
                  >
                    Next clip in{" "}
                    <span className="tc">{fmtDur(next.start - t)}</span>
                    <ArrowRightIcon className="size-3" />
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* label */}
        <div
          className={cn(
            "absolute flex items-center gap-1.5",
            sm ? "top-1 left-1" : "top-2 left-2",
          )}
        >
          <span
            className={cn(
              "tc inline-flex items-center justify-center rounded-[3px] font-semibold text-black/80",
              sm ? "size-3.5 text-[0.5rem]" : "size-4 text-[0.6rem]",
            )}
            style={{ background: sink.color }}
          >
            {track.index + 1}
          </span>
          {!sm && (
            <span className="rounded-[3px] bg-black/55 px-1.5 py-px text-[0.65rem] font-medium text-white/90">
              {sink.name}
            </span>
          )}
        </div>
        {flag && (
          <span
            className={cn(
              "absolute inline-flex items-center justify-center rounded-full",
              sm ? "top-1 right-1 size-3.5" : "top-2 right-2 size-5",
              flag === "pick"
                ? "bg-pick text-black/80"
                : "bg-reject text-white",
            )}
          >
            {flag === "pick" ? (
              <CheckIcon
                className={sm ? "size-2.5" : "size-3"}
                strokeWidth={3}
              />
            ) : (
              <XIcon className={sm ? "size-2.5" : "size-3"} strokeWidth={3} />
            )}
          </span>
        )}
        {clip && !sm && (
          <div
            className={cn(
              "absolute bottom-0 inset-x-0 flex items-end gap-2 bg-linear-to-t from-black/70 via-black/20 to-transparent text-white/85",
              size === "lg"
                ? "px-3 pb-2 pt-8 text-xs"
                : "px-2 pb-1.5 pt-6 text-[0.6rem]",
            )}
          >
            <span className="tc truncate opacity-80">{clip.fileName}</span>
            <span className="flex-1" />
            <span className="tc">{fmtTC(t - clip.start)}</span>
          </div>
        )}
        {flag === "reject" && (
          <div className="absolute inset-0 bg-black/45 pointer-events-none" />
        )}
      </div>
    </div>
  );
}
