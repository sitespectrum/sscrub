// UI-facing media types and pure helpers shared by the library, project and
// editor views. `lib/hooks/useMedia.ts` maps API types into these.

import type {
  Asset,
  AssetStatus,
  ClipFlag,
  Sink,
} from "./api/sscrub-api-schema";

export type { AssetStatus };
export type SinkType =
  | "camera"
  | "action"
  | "drone"
  | "phone"
  | "audio"
  | "unknown";

/** API sink plus a parsed `kind`; still assignable wherever a `Sink` is expected. */
export interface SinkView extends Sink {
  kind: SinkType;
}

export interface Clip {
  id: string;
  sinkId: string;
  fileName: string;
  /** Capture start (upload time if unknown), epoch ms. */
  start: number;
  /** Duration, ms. */
  duration: number;
  /** Bytes. */
  size: number;
  status: AssetStatus;
  asset: Asset;
}

/** What the coverage chart draws per clip; a merged span from the server or a full `Clip`. */
export type Span = Pick<Clip, "id" | "start" | "duration" | "status">;

export type Flag = "pick" | "reject";

export interface Marker {
  id: string;
  /** Epoch ms. */
  t: number;
  label: string;
  color: string;
}

export interface Project {
  id: string;
  name: string;
  /** Track order. */
  sinkIds: string[];
  /** Window start/end, epoch ms. */
  start: number;
  end: number;
  /** Epoch ms. */
  updatedAt: number;
  /** Keyed by clip (asset) id. */
  flags: Record<string, Flag>;
  markers: Marker[];
}

/** A project card's data, computed on the server (`GET /api/projects`). */
export interface ProjectSummary {
  id: string;
  name: string;
  /** Window start/end, epoch ms. */
  start: number;
  end: number;
  /** Epoch ms. */
  updatedAt: number;
  /** Clips overlapping the window. */
  clipCount: number;
  /** Of those, how many are picked or rejected. */
  flaggedCount: number;
  /** Track order. */
  sinks: {
    sinkId: string;
    /** The clip for the card's poster frame; null for audio or empty sinks. */
    poster: Asset | null;
    /** Clips merged into bars, ordered by start. */
    coverage: Span[];
  }[];
}

export const toApiFlag = (f: Flag): ClipFlag => (f === "pick" ? "Pick" : "Reject");
export const fromApiFlag = (f: ClipFlag): Flag => (f === "Pick" ? "pick" : "reject");

/** Clips that overlap [from, to). */
export const clipsInRange = <T extends Pick<Clip, "start" | "duration">>(
  clips: T[],
  from: number,
  to: number,
) =>
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
