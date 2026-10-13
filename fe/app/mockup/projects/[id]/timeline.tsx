"use client";

import { cn } from "@/lib/utils";
import {
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  MaximizeIcon,
  XIcon,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Frame } from "../../_components/frame";
import { TrackToggle } from "../../_components/ui";
import { type Clip, type Sink, fmtClock, fmtTC, hash } from "../../_lib/data";
import type { Flag, Track } from "./monitor";

export interface Marker {
  id: string;
  t: number;
  label: string;
  color: string;
}

export type ClipFilter = "all" | "unreviewed" | "pick" | "reject";

const HEADER_W = 216;
const RULER_H = 30;
const rowHeight = (s: Sink) => (s.kind === "audio" ? 48 : 68);

const TICKS = [1, 5, 10, 30, 60, 300, 600, 900, 1800, 3600].map(
  (s) => s * 1000,
);

export function Timeline({
  tracks,
  from,
  to,
  t,
  playing,
  zoom,
  solo,
  hidden,
  flags,
  filter,
  markers,
  selectedClip,
  onSeek,
  onScrubStart,
  onSelectClip,
  onSolo,
  onToggleHidden,
}: {
  tracks: Track[];
  from: number;
  to: number;
  t: number;
  playing: boolean;
  zoom: number;
  solo: string | null;
  hidden: Set<string>;
  flags: Record<string, Flag>;
  filter: ClipFilter;
  markers: Marker[];
  selectedClip: string | null;
  onSeek: (t: number) => void;
  onScrubStart: () => void;
  onSelectClip: (id: string | null) => void;
  onSolo: (id: string | null) => void;
  onToggleHidden: (id: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const origin = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState(1000);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const laneW = Math.max(100, (viewW - HEADER_W - 16) * zoom);
  const span = to - from;
  const x = ((t - from) / span) * laneW;

  // Virtualization: only clips within ±1 viewport of the visible area are
  // rendered. The window moves in viewport-sized steps so lanes re-render only
  // when a step boundary is crossed, not on every scroll pixel.
  const [step, setStep] = useState(0);
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const next = Math.floor(el.scrollLeft / Math.max(1, viewW));
    if (next !== step) setStep(next);
  };
  const winFrom = (step - 1) * viewW;
  const winTo = (step + 2) * viewW;

  // keep the playhead in view while playing
  useEffect(() => {
    const el = scroller.current;
    if (!el || !playing) return;
    const visible = el.clientWidth - HEADER_W;
    if (x < el.scrollLeft || x > el.scrollLeft + visible - 20)
      el.scrollLeft = x - 40;
  }, [x, playing]);

  const scrub = (e: React.PointerEvent, clip?: Clip) => {
    if (e.button !== 0 || !origin.current) return;
    e.preventDefault();
    onScrubStart();
    onSelectClip(clip?.id ?? null);
    const seekTo = (clientX: number) => {
      const rect = origin.current!.getBoundingClientRect();
      const tt = from + ((clientX - rect.left) / laneW) * span;
      onSeek(Math.min(to, Math.max(from, tt)));
    };
    seekTo(e.clientX);
    const move = (ev: PointerEvent) => seekTo(ev.clientX);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // stable handler so memoized lanes don't re-render on every playback frame
  const scrubRef = useRef(scrub);
  useLayoutEffect(() => {
    scrubRef.current = scrub;
  });
  const stableScrub = useCallback(
    (e: React.PointerEvent, clip?: Clip) => scrubRef.current(e, clip),
    [],
  );

  return (
    <div
      ref={scroller}
      onScroll={onScroll}
      className="flex-1 min-h-0 overflow-auto relative select-none bg-(--nle-well)"
    >
      <div
        className="relative min-h-full"
        style={{ width: HEADER_W + laneW + 16 }}
      >
        {/* Ruler */}
        <div
          className="sticky top-0 z-30 flex bg-(--nle-panel) border-b border-(--nle-hairline)"
          style={{ height: RULER_H }}
        >
          <div
            className="sticky left-0 z-10 shrink-0 bg-(--nle-panel) border-r border-(--nle-hairline) flex items-center px-3"
            style={{ width: HEADER_W }}
          >
            <span className="tc text-[0.8rem] font-medium text-(--nle-playhead)">
              {fmtTC(t)}
            </span>
          </div>
          <div
            ref={origin}
            className="relative cursor-col-resize"
            style={{ width: laneW }}
            onPointerDown={(e) => scrub(e)}
          >
            <Ruler
              from={from}
              to={to}
              laneW={laneW}
              winFrom={winFrom}
              winTo={winTo}
            />
            {markers.map((m) => (
              <button
                key={m.id}
                title={`${m.label} · ${fmtClock(m.t)}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSeek(m.t);
                }}
                className="group/m absolute bottom-0 -translate-x-1/2 flex flex-col items-center"
                style={{ left: ((m.t - from) / span) * laneW }}
              >
                <span
                  className="w-2.5 h-3"
                  style={{
                    background: m.color,
                    clipPath: "polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%)",
                  }}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Tracks */}
        {tracks.map((tr) => (
          <div
            key={tr.sink.id}
            className="flex border-b border-(--nle-hairline)"
          >
            <TrackHeader
              track={tr}
              soloed={solo === tr.sink.id}
              hidden={hidden.has(tr.sink.id)}
              onSolo={() => onSolo(solo === tr.sink.id ? null : tr.sink.id)}
              onToggleHidden={() => onToggleHidden(tr.sink.id)}
            />
            <Lane
              track={tr}
              from={from}
              span={span}
              laneW={laneW}
              winFrom={winFrom}
              winTo={winTo}
              flags={flags}
              filter={filter}
              selectedClip={selectedClip}
              soloed={solo === tr.sink.id}
              onPointerDown={stableScrub}
            />
          </div>
        ))}
        <div className="flex" style={{ minHeight: 48 }}>
          <div
            className="sticky left-0 shrink-0 bg-(--nle-panel) border-r border-(--nle-hairline)"
            style={{ width: HEADER_W }}
          />
        </div>

        {/* Marker guide lines */}
        {markers.map((m) => (
          <div
            key={m.id}
            className="absolute bottom-0 w-px pointer-events-none opacity-25"
            style={{
              top: RULER_H,
              left: HEADER_W + ((m.t - from) / span) * laneW,
              background: m.color,
            }}
          />
        ))}

        {/* Playhead */}
        {/* Playhead: moved with a transform on its own layer, so playback never repaints the lanes */}
        <div
          className="absolute top-0 bottom-0 z-20 pointer-events-none will-change-transform"
          style={{ left: HEADER_W, transform: `translate3d(${x}px, 0, 0)` }}
        >
          <div
            className="absolute top-0 -translate-x-1/2 w-[11px] h-[18px] bg-(--nle-playhead)"
            style={{
              clipPath: "polygon(0 0, 100% 0, 100% 62%, 50% 100%, 0 62%)",
            }}
          />
          <div className="absolute top-0 bottom-0 w-px -translate-x-1/2 bg-(--nle-playhead) shadow-[0_0_6px_oklch(0.8_0.13_210/0.6)]" />
        </div>
      </div>
    </div>
  );
}

const Ruler = memo(function Ruler({
  from,
  to,
  laneW,
  winFrom,
  winTo,
}: {
  from: number;
  to: number;
  laneW: number;
  winFrom: number;
  winTo: number;
}) {
  const span = to - from;
  const pxPerMs = laneW / span;
  const major = TICKS.find((i) => i * pxPerMs >= 96) ?? TICKS.at(-1)!;
  const minorPx = (major / 10) * pxPerMs;
  const first = Math.ceil(from / major) * major;
  const ticks: number[] = [];
  for (let tt = first; tt <= to; tt += major) {
    const px = (tt - from) * pxPerMs;
    if (px >= winFrom && px <= winTo) ticks.push(tt);
  }
  const offset = ((first - from) * pxPerMs) % minorPx;

  return (
    <div className="absolute inset-0 text-[0.6rem] text-muted-foreground">
      <div
        className="absolute inset-x-0 bottom-0 h-1"
        style={{
          backgroundImage:
            "linear-gradient(to right, oklch(1 0 0 / 0.14) 1px, transparent 1px)",
          backgroundSize: `${minorPx}px 100%`,
          backgroundPosition: `${offset}px 0`,
        }}
      />
      {ticks.map((tt) => (
        <div
          key={tt}
          className="absolute bottom-0 h-full flex items-start"
          style={{ left: (tt - from) * pxPerMs }}
        >
          <span className="absolute bottom-0 h-2.5 w-px bg-white/30" />
          <span className="tc pl-1.5 pt-1.5">
            {fmtClock(tt, major < 60_000)}
          </span>
        </div>
      ))}
    </div>
  );
});

function TrackHeader({
  track,
  soloed,
  hidden,
  onSolo,
  onToggleHidden,
}: {
  track: Track;
  soloed: boolean;
  hidden: boolean;
  onSolo: () => void;
  onToggleHidden: () => void;
}) {
  const { sink } = track;
  return (
    <div
      className={cn(
        "sticky left-0 z-10 shrink-0 flex items-center gap-2.5 pr-2 bg-(--nle-panel) border-r border-(--nle-hairline)",
        soloed &&
          "bg-[color-mix(in_oklch,var(--nle-panel),var(--primary)_10%)]",
      )}
      style={{ width: HEADER_W, height: rowHeight(sink) }}
    >
      <div
        className="w-[3px] self-stretch"
        style={{ background: sink.color }}
      />
      <span
        className={cn(
          "tc w-7 h-5 rounded-[4px] inline-flex items-center justify-center text-[0.6rem] font-semibold ring-1 ring-inset",
          soloed
            ? "bg-primary text-primary-foreground ring-primary"
            : "bg-white/[0.04] text-muted-foreground ring-(--nle-hairline)",
        )}
      >
        {sink.kind === "audio" ? "A" : "V"}
        {track.index + 1}
      </span>
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            "text-xs font-medium truncate",
            hidden && "text-muted-foreground",
          )}
        >
          {sink.name}
        </div>
        <div className="text-[0.6rem] text-muted-foreground truncate">
          {sink.model}
        </div>
      </div>
      <div className="flex items-center">
        <TrackToggle title="View solo" on={soloed} onClick={onSolo}>
          <MaximizeIcon />
        </TrackToggle>
        <TrackToggle
          title="Show in multiview"
          on={hidden}
          activeClass="text-amber-400"
          onClick={onToggleHidden}
        >
          {hidden ? <EyeOffIcon /> : <EyeIcon />}
        </TrackToggle>
        <TrackToggle title="Lock track">
          <LockIcon />
        </TrackToggle>
      </div>
    </div>
  );
}

const matches = (filter: ClipFilter, flag?: Flag) =>
  filter === "all" || (filter === "unreviewed" ? !flag : flag === filter);

const Lane = memo(function Lane({
  track,
  from,
  span,
  laneW,
  winFrom,
  winTo,
  flags,
  filter,
  selectedClip,
  soloed,
  onPointerDown,
}: {
  track: Track;
  from: number;
  span: number;
  laneW: number;
  winFrom: number;
  winTo: number;
  flags: Record<string, Flag>;
  filter: ClipFilter;
  selectedClip: string | null;
  soloed: boolean;
  onPointerDown: (e: React.PointerEvent, clip?: Clip) => void;
}) {
  const { sink } = track;
  const h = rowHeight(sink);
  const px = (ms: number) => (ms / span) * laneW;
  return (
    <div
      className={cn("relative hatch", soloed && "bg-primary/[0.04]")}
      style={{ width: laneW, height: h }}
      onPointerDown={(e) => onPointerDown(e)}
    >
      {track.clips.map((c) => {
        const left = px(c.start - from);
        const width = Math.max(2, px(c.duration));
        if (left > winTo || left + width < winFrom) return null;
        const flag = flags[c.id];
        const ready = c.status === "Ready";
        const selected = selectedClip === c.id;
        return (
          <div
            key={c.id}
            onPointerDown={(e) => {
              e.stopPropagation();
              onPointerDown(e, c);
            }}
            className={cn(
              "absolute top-[3px] bottom-[3px] rounded-[3px] overflow-hidden cursor-pointer flex flex-col transition-opacity",
              !matches(filter, flag) && "opacity-20",
              flag === "reject" &&
                matches(filter, flag) &&
                filter !== "reject" &&
                "opacity-45",
              selected
                ? "z-[1] outline-2 outline-white -outline-offset-1"
                : "hover:brightness-[1.15]",
            )}
            style={{
              left,
              width,
              background: ready
                ? `color-mix(in oklch, ${sink.color} 42%, oklch(0.16 0 0))`
                : `repeating-linear-gradient(135deg, color-mix(in oklch, ${sink.color} 30%, black) 0 4px, oklch(0.16 0 0) 4px 8px)`,
              boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${sink.color} 55%, transparent)`,
            }}
          >
            {/* title bar */}
            <div
              className="h-[15px] shrink-0 flex items-center gap-1 px-1.5 text-[0.6rem] font-medium text-white/90"
              style={{
                background: `color-mix(in oklch, ${sink.color} 70%, oklch(0.2 0 0))`,
              }}
            >
              {width > 36 && (
                <>
                  {flag === "pick" && (
                    <CheckIcon className="size-2.5 shrink-0" strokeWidth={3} />
                  )}
                  {flag === "reject" && (
                    <XIcon className="size-2.5 shrink-0" strokeWidth={3} />
                  )}
                  <span className="truncate">{c.fileName}</span>
                  {!ready && (
                    <span className="text-white/60 truncate">· {c.status}</span>
                  )}
                </>
              )}
            </div>
            {/* body */}
            <div className="relative flex-1 min-h-0">
              {sink.kind === "audio" ? (
                <Waveform seed={hash(c.id)} color={sink.color} />
              ) : (
                ready &&
                width > 24 && (
                  <Thumbs
                    sink={sink}
                    clip={c}
                    width={width}
                    height={h - 6 - 15}
                  />
                )
              )}
            </div>
            {flag === "pick" && (
              <div className="absolute bottom-0 inset-x-0 h-[2px] bg-(--nle-pick)" />
            )}
            {flag === "reject" && (
              <div className="absolute bottom-0 inset-x-0 h-[2px] bg-(--nle-reject)" />
            )}
          </div>
        );
      })}
    </div>
  );
});

/** Premiere-style thumbnails: continuous filmstrip when it fits, else head & tail. */
const Thumbs = memo(function Thumbs({
  sink,
  clip,
  width,
  height,
}: {
  sink: Sink;
  clip: Clip;
  width: number;
  height: number;
}) {
  const tw = Math.max(1, (height * 16) / 9);
  const n = Math.ceil(width / tw);
  const frames = n <= 14 ? Array.from({ length: n }, (_, i) => i) : [0, -1];
  return (
    <div className="absolute inset-0 flex overflow-hidden">
      {frames.map((i) => (
        <div
          key={i}
          className={cn(
            "h-full shrink-0 opacity-85",
            i === -1
              ? "ml-auto border-l border-black/50"
              : "border-r border-black/50",
          )}
          style={{ width: tw }}
        >
          <Frame
            sink={sink}
            clip={clip}
            t={
              clip.start +
              clip.duration *
                (i === -1 ? 0.98 : Math.min(0.98, (i * tw) / width))
            }
            grain={false}
            thumb
            className="size-full"
          />
        </div>
      ))}
    </div>
  );
});

function Waveform({ seed, color }: { seed: number; color: string }) {
  const d = useMemo(() => {
    const n = 160;
    let top = "M0 50 ";
    let bottom = "";
    for (let i = 0; i <= n; i++) {
      const env = 0.35 + 0.65 * Math.abs(Math.sin(i * 0.05 + seed));
      const v =
        (Math.abs(Math.sin(i * 0.9 + seed) * Math.sin(i * 0.27 + seed * 0.3)) *
          0.85 +
          0.08) *
        44 *
        env;
      top += `L${(i / n) * 100} ${(50 - v).toFixed(1)} `;
      bottom = `L${(i / n) * 100} ${(50 + v).toFixed(1)} ` + bottom;
    }
    return top + bottom + "Z";
  }, [seed]);
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 size-full"
    >
      <line
        x1="0"
        x2="100"
        y1="50"
        y2="50"
        stroke="white"
        strokeOpacity=".15"
        strokeWidth=".5"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={d}
        fill={`color-mix(in oklch, ${color} 35%, white)`}
        fillOpacity=".75"
      />
    </svg>
  );
}
