"use client";

import { cn } from "@/lib/utils";
import { memo, useRef } from "react";
import {
  type Sink,
  HOUR_MS,
  MIN_MS,
  clipsInRange,
  fmtClock,
  fmtDur,
} from "../_lib/data";

/**
 * "When was each sink recording" chart. Rows can carry custom labels, and an
 * optional brush picks a time range (new-project flow).
 */
export function Coverage({
  sinks,
  from,
  to,
  dimmed,
  rowHeight = 14,
  label,
  labelWidth = 112,
  showAxis = true,
  brush,
  className,
}: {
  sinks: Sink[];
  from: number;
  to: number;
  dimmed?: Set<string>;
  rowHeight?: number;
  label?: false | ((s: Sink) => React.ReactNode);
  labelWidth?: number;
  showAxis?: boolean;
  brush?: {
    start: number;
    end: number;
    onChange: (start: number, end: number) => void;
  };
  className?: string;
}) {
  const span = to - from;
  const pct = (t: number) => `${((t - from) / span) * 100}%`;
  const area = useRef<HTMLDivElement>(null);
  const hours: number[] = [];
  for (let h = Math.ceil(from / HOUR_MS) * HOUR_MS; h <= to; h += HOUR_MS)
    hours.push(h);

  const startDrag =
    (mode: "move" | "start" | "end" | "new") => (e: React.PointerEvent) => {
      if (!brush || !area.current) return;
      e.stopPropagation();
      e.preventDefault();
      const rect = area.current.getBoundingClientRect();
      const toT = (x: number) => {
        const t = from + ((x - rect.left) / rect.width) * span;
        return (
          Math.round(Math.min(to, Math.max(from, t)) / (5 * MIN_MS)) *
          5 *
          MIN_MS
        );
      };
      const t0 = toT(e.clientX);
      const { start: s0, end: e0 } = brush;
      if (mode === "new") brush.onChange(t0, t0);
      const move = (ev: PointerEvent) => {
        const t = toT(ev.clientX);
        if (mode === "move") {
          const d = Math.min(to - e0, Math.max(from - s0, t - t0));
          brush.onChange(s0 + d, e0 + d);
        } else if (mode === "start")
          brush.onChange(Math.min(t, e0 - 5 * MIN_MS), e0);
        else if (mode === "end")
          brush.onChange(s0, Math.max(t, s0 + 5 * MIN_MS));
        else brush.onChange(Math.min(t0, t), Math.max(t0, t));
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    };

  const renderLabel =
    label === false
      ? null
      : (label ??
        ((s: Sink) => (
          <span
            className={cn(
              "flex items-center gap-2 truncate text-[0.7rem] text-muted-foreground",
              dimmed?.has(s.id) && "opacity-40",
            )}
          >
            <span
              className="size-2 rounded-[2px] shrink-0"
              style={{ background: s.color }}
            />
            {s.name}
          </span>
        )));

  return (
    <div className={cn("flex gap-3", className)}>
      {renderLabel && (
        <div
          className="flex flex-col gap-1.5 shrink-0"
          style={{ width: labelWidth }}
        >
          {sinks.map((s) => (
            <div
              key={s.id}
              style={{ height: rowHeight }}
              className="flex items-center min-w-0"
            >
              {renderLabel(s)}
            </div>
          ))}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div
          ref={area}
          className={cn(
            "relative flex flex-col gap-1.5 select-none",
            brush && "cursor-crosshair",
          )}
          onPointerDown={brush ? startDrag("new") : undefined}
        >
          <Rows
            sinks={sinks}
            from={from}
            to={to}
            dimmed={dimmed}
            rowHeight={rowHeight}
          />
          {brush && (
            <>
              <div
                className="absolute -inset-y-1.5 left-0 bg-(--nle-panel)/70 pointer-events-none"
                style={{ width: pct(brush.start) }}
              />
              <div
                className="absolute -inset-y-1.5 right-0 bg-(--nle-panel)/70 pointer-events-none"
                style={{ left: pct(brush.end) }}
              />
              <div
                className="absolute -inset-y-1.5 rounded-[5px] ring-1 ring-primary bg-primary/[0.07] cursor-grab active:cursor-grabbing shadow-[0_0_0_4px_oklch(0.6_0.2_285/0.12)]"
                style={{
                  left: pct(brush.start),
                  width: pct(from + brush.end - brush.start),
                }}
                onPointerDown={startDrag("move")}
              >
                {(["start", "end"] as const).map((edge) => (
                  <div
                    key={edge}
                    onPointerDown={startDrag(edge)}
                    className={cn(
                      "absolute inset-y-0 w-4 cursor-ew-resize flex items-center justify-center",
                      edge === "start" ? "-left-2" : "-right-2",
                    )}
                  >
                    <div className="h-7 w-[7px] rounded-full bg-primary ring-2 ring-(--nle-panel) flex flex-col items-center justify-center gap-[2px]">
                      <span className="w-[3px] h-px bg-white/70" />
                      <span className="w-[3px] h-px bg-white/70" />
                      <span className="w-[3px] h-px bg-white/70" />
                    </div>
                  </div>
                ))}
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[4px] bg-primary px-1.5 py-px text-[0.6rem] font-medium text-primary-foreground tc shadow">
                  {fmtClock(brush.start, false)} – {fmtClock(brush.end, false)}{" "}
                  · {fmtDur(brush.end - brush.start)}
                </div>
              </div>
            </>
          )}
        </div>
        {showAxis && (
          <div className="relative h-4 mt-2 text-[0.6rem] text-muted-foreground/80 tc">
            {hours.map((h, i) => (
              <span
                key={h}
                className={cn("absolute", i === 0 ? "" : "-translate-x-1/2")}
                style={{ left: pct(h) }}
              >
                {fmtClock(h, false)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Static part of the chart; memoized so dragging the brush doesn't re-render clips. */
const Rows = memo(function Rows({
  sinks,
  from,
  to,
  dimmed,
  rowHeight,
}: {
  sinks: Sink[];
  from: number;
  to: number;
  dimmed?: Set<string>;
  rowHeight: number;
}) {
  const span = to - from;
  const pct = (t: number) => `${((t - from) / span) * 100}%`;
  const hours: number[] = [];
  for (let h = Math.ceil(from / HOUR_MS) * HOUR_MS; h <= to; h += HOUR_MS)
    hours.push(h);
  return (
    <>
      {hours.map((h) => (
        <div
          key={h}
          className="absolute -inset-y-1 w-px bg-white/[0.05]"
          style={{ left: pct(h) }}
        />
      ))}
      {sinks.map((s) => (
        <div
          key={s.id}
          className={cn(
            "relative rounded-[3px] bg-white/[0.035] transition-opacity",
            dimmed?.has(s.id) && "opacity-25",
          )}
          style={{ height: rowHeight }}
        >
          {clipsInRange(s.id, from, to).map((c) => (
            <div
              key={c.id}
              className="absolute inset-y-0 rounded-[2px]"
              style={{
                left: pct(Math.max(from, c.start)),
                width: `max(2px, ${((Math.min(to, c.start + c.duration) - Math.max(from, c.start)) / span) * 100}%)`,
                background:
                  c.status === "Ready"
                    ? `linear-gradient(to bottom, ${s.color}, color-mix(in oklch, ${s.color} 75%, black))`
                    : `repeating-linear-gradient(135deg, ${s.color}55 0 3px, transparent 3px 6px)`,
              }}
            />
          ))}
        </div>
      ))}
    </>
  );
});
