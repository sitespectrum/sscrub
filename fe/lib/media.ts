// UI-facing media types and pure helpers shared by the library, project and
// editor views.
//
// These are view models, not API types. Mapping from the API
// (`@/lib/api/sscrub-api-schema`):
//   SinkView ← Sink { id, name }            — model, kind, color, hue not in the API yet
//   Clip     ← Asset { id, sinkId, fileName, captureDate → start,
//                      durationMillis → duration, size, status }
//                                            — progress, codec, resolution not in the API yet
//   Project  ← (no endpoint yet)

import type { AssetStatus } from "./api/sscrub-api-schema";

export type { AssetStatus };
export type SinkType =
  | "camera"
  | "action"
  | "drone"
  | "phone"
  | "audio"
  | "unknown";

export interface SinkView {
  id: string;
  name: string;
  model: string;
  kind: SinkType;
  /** Track label color (CSS color). */
  color: string;
  /** Base hue for placeholder frames. */
  hue: number;
}

export interface Clip {
  id: string;
  sinkId: string;
  fileName: string;
  /** Capture start, epoch ms. */
  start: number;
  /** Duration, ms. */
  duration: number;
  /** Bytes. */
  size: number;
  status: AssetStatus;
  /** 0..1 while uploading. */
  progress?: number;
  codec: string;
  resolution: string;
}

export interface Project {
  id: string;
  name: string;
  sinkIds: string[];
  /** Window start/end, epoch ms. */
  start: number;
  end: number;
  updated: string;
}

/** Clips that overlap [from, to). */
export const clipsInRange = (clips: Clip[], from: number, to: number) =>
  clips.filter((c) => c.start < to && c.start + c.duration > from);

export const clipAt = (clips: Clip[], t: number) =>
  clips.find((c) => t >= c.start && t < c.start + c.duration);

export const nextClip = (clips: Clip[], t: number) =>
  clips.find((c) => c.start > t);

export function groupBySink(clips: Clip[]) {
  const out: Record<string, Clip[]> = {};
  for (const c of clips) (out[c.sinkId] ??= []).push(c);
  return out;
}

/** Hour-aligned [from, to] covering all clips. */
export function hourBounds(
  clips: Clip[],
  hourMs = 3_600_000,
): [number, number] {
  if (!clips.length) {
    const now = Math.floor(Date.UTC(2026, 0, 1) / hourMs) * hourMs;
    return [now, now + hourMs];
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const c of clips) {
    lo = Math.min(lo, c.start);
    hi = Math.max(hi, c.start + c.duration);
  }
  return [Math.floor(lo / hourMs) * hourMs, Math.ceil(hi / hourMs) * hourMs];
}
