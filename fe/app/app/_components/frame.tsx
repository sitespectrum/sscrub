"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Asset, FilmstripInfo, Sink } from "@/lib/api/sscrub-api-schema";
import { DERIVED_URL } from "@/lib/constants";
import { hash } from "@/lib/format";
import { type SinkType } from "@/lib/media";
import { cn } from "@/lib/utils";
import {
  AudioLinesIcon,
  BadgeQuestionMarkIcon,
  CameraIcon,
  LoaderCircleIcon,
  PlaneIcon,
  SmartphoneIcon,
  TriangleAlertIcon,
  VideoIcon,
} from "lucide-react";

export function SinkIcon({
  type,
  className,
}: {
  type: SinkType;
  className?: string;
}) {
  const Icon = {
    camera: VideoIcon,
    action: CameraIcon,
    drone: PlaneIcon,
    phone: SmartphoneIcon,
    audio: AudioLinesIcon,
    unknown: BadgeQuestionMarkIcon,
  }[type];
  return <Icon className={className} />;
}

/** Colored square with the device icon, used wherever a sink is listed. */
export function SinkBadge({
  sink,
  size = "md",
  className,
  loading = false,
}: {
  sink?: Sink;
  size?: "sm" | "md" | "lg";
  className?: string;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Skeleton
        className={cn(
          "relative shrink-0 rounded-[5px]",
          size === "sm" && "size-5",
          size === "md" && "size-6",
          size === "lg" && "size-8 rounded-md",
          className,
        )}
      ></Skeleton>
    );
  }

  return (
    <span
      className={cn(
        "relative shrink-0 inline-flex items-center justify-center rounded-[5px] ring-1 ring-inset",
        size === "sm" && "size-5 [&_svg]:size-3",
        size === "md" && "size-6 [&_svg]:size-3.5",
        size === "lg" && "size-8 rounded-md [&_svg]:size-4",
        className,
      )}
      style={{
        background: `color-mix(in oklch, ${sink?.color} 16%, transparent)`,
        color: sink?.color,
        ["--tw-ring-color" as string]: `color-mix(in oklch, ${sink?.color} 28%, transparent)`,
      }}
    >
      <SinkIcon type={(sink?.type || "unknown") as SinkType} />
    </span>
  );
}

const noise = (n: number, seed: number) => {
  const x = Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Placeholder "footage": soft, out-of-focus light fields that drift with time,
 * so scrubbing visibly changes the picture.
 *
 * Performance: each light is its own element with a *static* gradient that is
 * moved with `transform`, so playback only re-composites; nothing re-rasterizes.
 * `live` frames (monitor, inspector, hover-scrub) get their own GPU layers;
 * static thumbnails don't, to keep layer count low.
 */
export function Frame({
  sink,
  asset,
  t,
  className,
  grain = true,
  thumb = false,
  live = false,
}: {
  sink: Sink;
  asset: Asset;
  t: number;
  className?: string;
  grain?: boolean;
  thumb?: boolean;
  live?: boolean;
}) {
  const millis = Math.max(
    0,
    t - Date.parse(asset.captureDate ?? asset.uploadDate),
  );

  if (asset.status === "Ready") {
    if (asset.contentType.startsWith("audio"))
      return (
        <AudioFrame
          sink={sink}
          asset={asset}
          t={t}
          className={className}
          thumb={thumb}
        />
      );

    if (asset.filmstrip)
      return (
        <FilmstripFrame
          offsetMs={millis}
          strip={asset.filmstrip}
          className={className}
        />
      );
  }

  const seed = hash(asset.id);
  const secs = millis / 1000;
  const drift =
    sink.type === "drone" ? 0.06 : sink.type === "action" ? 0.09 : 0.035;
  const count = thumb ? 3 : 5;
  const hue = (240 - seed) % 360;

  return (
    <div
      className={cn(
        "relative overflow-hidden isolate",
        grain && "grain",
        className,
      )}
      style={{
        background: `linear-gradient(${150 + (seed % 60)}deg, oklch(0.3 0.05 ${hue}), oklch(0.12 0.02 ${(hue + 40) % 360}))`,
      }}
    >
      {Array.from({ length: count }, (_, i) => {
        const ph = noise(i, seed) * Math.PI * 2;
        const sp = drift * (0.6 + noise(i + 9, seed));
        const x = 50 + 42 * Math.sin(secs * sp + ph); // % of frame width
        const y = 50 + 34 * Math.cos(secs * sp * 0.8 + ph * 1.3); // % of frame height
        const size = 56 + noise(i + 3, seed) * 68; // diameter, % of frame width
        const h = (hue + (i - 2) * 26 + 360) % 360;
        const l = 0.5 + noise(i + 5, seed) * 0.3;
        // translate % is relative to the blob itself (square, `size`% of a 16:9 frame's width)
        const tx = (x / size) * 100 - 50;
        const ty = (y / ((size * 16) / 9)) * 100 - 50;
        return (
          <div
            key={i}
            className="absolute left-0 top-0 aspect-square rounded-full"
            style={{
              width: `${size}%`,
              background: `radial-gradient(closest-side, oklch(${l.toFixed(2)} 0.11 ${h} / 0.85), transparent)`,
              transform: `translate3d(${tx.toFixed(2)}%, ${ty.toFixed(2)}%, 0)`,
              willChange: live ? "transform" : undefined,
            }}
          />
        );
      })}
      <div
        className={cn(
          "absolute inset-0",
          sink.type === "action" ? "vignette-strong" : "vignette",
        )}
      />
      {sink.type === "drone" && !thumb && <DroneHud />}
      {asset.status !== "Ready" && (
        <StatusOverlay asset={asset} compact={thumb} />
      )}
    </div>
  );
}

function DroneHud() {
  const corner = "absolute size-3 border-white/50";
  return (
    <div className="absolute inset-[18%] pointer-events-none">
      <span className={cn(corner, "left-0 top-0 border-l border-t")} />
      <span className={cn(corner, "right-0 top-0 border-r border-t")} />
      <span className={cn(corner, "left-0 bottom-0 border-l border-b")} />
      <span className={cn(corner, "right-0 bottom-0 border-r border-b")} />
      <span className="absolute left-1/2 top-1/2 size-1 -translate-1/2 rounded-full bg-white/60" />
    </div>
  );
}

/** Scrolling waveform drawn as a single SVG path (one DOM write per frame). */
export function AudioFrame({
  sink,
  asset,
  t,
  className,
  thumb,
}: {
  sink: Sink;
  asset: Asset;
  t: number;
  className?: string;
  thumb?: boolean;
}) {
  const seed = hash(asset.id) % 1000;
  const bucket = Math.floor(t / 100);
  const bars = thumb ? 24 : 96;
  const level = (i: number) => {
    const n = bucket + i - bars / 2;
    const env = 0.3 + 0.7 * noise(Math.floor(n / 22), seed);
    return Math.max(0.03, env * (0.25 + 0.75 * noise(n, seed)));
  };

  // bars as rects in one path; left half (played) and right half (upcoming) separately
  const w = 100 / bars;
  let played = "";
  let upcoming = "";
  for (let i = 0; i < bars; i++) {
    const hh = level(i) * 72;
    const rect = `M${(i * w + w * 0.15).toFixed(2)} ${(50 - hh / 2).toFixed(2)}h${(w * 0.7).toFixed(2)}v${hh.toFixed(2)}h${(-w * 0.7).toFixed(2)}z`;
    if (i < bars / 2) played += rect;
    else upcoming += rect;
  }

  return (
    <div className={cn("relative overflow-hidden flex bg-well", className)}>
      <div className="flex-1 relative px-[5%]">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="size-full"
        >
          <line
            x1="0"
            x2="100"
            y1="50"
            y2="50"
            stroke="white"
            strokeOpacity=".05"
            vectorEffect="non-scaling-stroke"
          />
          <path d={played} fill={sink.color} fillOpacity=".9" />
          <path d={upcoming} fill={sink.color} fillOpacity=".28" />
        </svg>
        {!thumb && (
          <div className="absolute inset-y-[10%] left-1/2 w-px bg-playhead" />
        )}
      </div>
      {!thumb && <Meters levels={[level(bars / 2), level(bars / 2 + 3)]} />}
      {asset.status !== "Ready" && (
        <StatusOverlay asset={asset} compact={thumb} />
      )}
    </div>
  );
}

function FilmstripFrame({
  strip,
  offsetMs,
  className,
}: {
  strip: FilmstripInfo;
  offsetMs: number;
  className?: string;
}) {
  const rows = Math.ceil(strip.frameCount / strip.columns);
  const i = Math.min(
    strip.frameCount - 1,
    Math.max(0, Math.floor(offsetMs / strip.intervalMillis)),
  );
  const col = i % strip.columns;
  const row = Math.floor(i / strip.columns);
  // At p%, the image's p% point lines up with the box's p% point, so
  // tile c of n sits at c / (n - 1); a single column/row is just 0%.
  const pct = (k: number, n: number) => (n > 1 ? (k / (n - 1)) * 100 : 0);

  return (
    <div
      className={cn("w-full bg-no-repeat", className)}
      style={{
        aspectRatio: `${strip.frameWidth} / ${strip.frameHeight}`,
        backgroundImage: `url(${DERIVED_URL}/${strip.objectKey})`,
        backgroundSize: `${strip.columns * 100}% ${rows * 100}%`,
        backgroundPosition: `${pct(col, strip.columns)}% ${pct(row, rows)}%`,
      }}
    />
  );
}

/** Segmented peak meters, green → amber → red. */
export function Meters({
  levels,
  className,
}: {
  levels: number[];
  className?: string;
}) {
  return (
    <div className={cn("flex gap-0.75 py-[5%] pr-[3%] pl-1", className)}>
      {levels.map((v, i) => (
        <div
          key={i}
          className="w-1.25 relative rounded-[1px] bg-white/6 overflow-hidden"
        >
          <div
            className="absolute inset-x-0 bottom-0"
            style={{
              height: `${Math.min(1, v) * 100}%`,
              backgroundImage:
                "linear-gradient(to top, oklch(0.72 0.17 150) 0 62%, oklch(0.82 0.16 90) 62% 84%, oklch(0.66 0.21 25) 84%)",
              backgroundSize: "100% var(--h)",
              backgroundPosition: "bottom",
              ["--h" as string]: `${(1 / Math.max(0.01, Math.min(1, v))) * 100}%`,
              maskImage:
                "repeating-linear-gradient(to top, black 0 2px, transparent 2px 3px)",
            }}
          />
        </div>
      ))}
    </div>
  );
}

function StatusOverlay({
  asset,
  compact,
}: {
  asset: Asset;
  compact?: boolean;
}) {
  return (
    <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-1.5 text-white/80">
      {asset.status === "Failed" ? (
        <TriangleAlertIcon
          className={cn("text-reject", compact ? "size-3.5" : "size-5")}
        />
      ) : (
        <LoaderCircleIcon
          className={cn("animate-spin", compact ? "size-3.5" : "size-5")}
        />
      )}
      {!compact && (
        <span className="text-[0.65rem] font-medium">
          {asset.status}
          {/* {asset.progress != null && (
            <span className="tc text-white/60">
              {" "}
              · {Math.round(asset.progress * 100)}%
            </span>
          )} */}
        </span>
      )}
    </div>
  );
}

export function Stripes({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return <div className={cn("relative hatch", className)}>{children}</div>;
}
