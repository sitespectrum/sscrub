"use client";

// Real playback for the editor. At 1× the playhead clock stays the master:
// each clip under it gets a <video>/<audio> element that follows it, and the
// clock holds while any of them is still buffering (see `onWaiting`).

import { API_URL } from "@/lib/constants";
import type { Clip } from "@/lib/media";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import type { Track } from "./monitor";

/** Per-track output level. */
export interface TrackMix {
  /** 0–1. */
  volume: number;
  muted: boolean;
}

export const DEFAULT_MIX: TrackMix = { volume: 1, muted: false };

/**
 * "playing": the clock runs at 1× and media should play along.
 * "holding": the clock is waiting for some clip to buffer. Clips stay where
 * they are (no seeking), so a short hiccup doesn't cost a rebuffer.
 * "paused": playback stopped; media stays mounted, lined up with the
 * playhead.
 */
export type MediaMode = "playing" | "holding" | "paused";

export type OnWaiting = (clipId: string, waiting: boolean) => void;

/** Mount the next clip this early, so it has loaded by the time it starts. */
const PRELOAD_MS = 3000;
/**
 * Past this drift, seek; below it, nudge the playback rate instead. Seeking
 * HEVC can rebuffer for seconds, and Firefox's currentTime jumps in uneven
 * steps, so this is generous.
 */
const SEEK_DRIFT_S = 1;
/** Drift that is left alone, so the pitch doesn't wobble. */
const DEADBAND_S = 0.1;
/**
 * Stop holding the clock for a clip that has been buffering this long. One
 * that never showed a frame is given up on (filmstrip instead); one that has
 * played keeps going and is lined up again once it recovers.
 */
const STALL_TIMEOUT_MS = 10_000;

const playable = (c: Clip) =>
  c.status === "Ready" && !c.asset.contentType.startsWith("image/");

/** Clips that are playing at `t`, or about to start. */
export const mediaClips = (track: Track, t: number) =>
  track.clips.filter(
    (c) =>
      playable(c) && c.start - PRELOAD_MS <= t && t < c.start + c.duration,
  );

/**
 * Media for one track. With `video`, the playing clip covers its container;
 * otherwise only its sound plays (an <audio> element decodes no picture).
 */
export function TrackMedia({
  track,
  t,
  mode,
  mix,
  video,
  onWaiting,
}: {
  track: Track;
  t: number;
  mode: MediaMode;
  mix: TrackMix;
  video: boolean;
  onWaiting: OnWaiting;
}) {
  const isAudioSink = track.sink.kind === "audio";
  return mediaClips(track, t).map((c) => (
    <ClipMedia
      key={c.id}
      clip={c}
      t={t}
      mode={mode}
      mix={mix}
      video={video && !isAudioSink && !c.asset.contentType.startsWith("audio/")}
      onWaiting={onWaiting}
    />
  ));
}

function ClipMedia({
  clip,
  t,
  mode,
  mix,
  video,
  onWaiting,
}: {
  clip: Clip;
  t: number;
  mode: MediaMode;
  mix: TrackMix;
  video: boolean;
  onWaiting: OnWaiting;
}) {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  // has loaded data (sound or picture)
  const [hasFrame, setHasFrame] = useState(false);
  // has a decoded picture; a browser without the codec (say HEVC) still
  // plays the sound but leaves videoWidth at 0
  const [picture, setPicture] = useState(false);
  const [failed, setFailed] = useState(false);
  const offset = (t - clip.start) / 1000;
  const started = offset >= 0;

  // Latest values for the event handlers below.
  const live = useRef({ started, failed, hasFrame, onWaiting });
  useEffect(() => {
    live.current = { started, failed, hasFrame, onWaiting };
  });

  // Readiness: a started clip blocks the clock until it can play through.
  const reported = useRef(false);
  // set by a "waiting" event, i.e. the element ran out of data while playing
  const stuck = useRef(false);
  // the clock stopped waiting for this clip after STALL_TIMEOUT_MS
  const released = useRef(false);
  const stallTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const report = () => {
    const el = ref.current;
    const { started, failed, hasFrame, onWaiting } = live.current;
    // A playing element's readyState can dip for a frame without it actually
    // stopping, so while it plays only its own "waiting" event counts.
    const waiting =
      !!el &&
      started &&
      !failed &&
      !released.current &&
      (el.seeking || stuck.current || (el.paused && el.readyState < 3));
    if (waiting === reported.current) return;
    reported.current = waiting;
    onWaiting(clip.id, waiting);
    clearTimeout(stallTimer.current);
    if (waiting)
      stallTimer.current = setTimeout(() => {
        if (!hasFrame) return setFailed(true);
        released.current = true;
        reportRef.current();
      }, STALL_TIMEOUT_MS);
  };
  const reportRef = useRef(report);
  useEffect(() => {
    reportRef.current = report;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => reportRef.current();
    const frame = () => {
      setHasFrame(true);
      if (el instanceof HTMLVideoElement && el.videoWidth > 0) setPicture(true);
      update();
    };
    const stop = () => {
      stuck.current = true;
      update();
    };
    const go = () => {
      stuck.current = false;
      released.current = false;
      update();
    };
    const fail = () => setFailed(true);
    const events = ["canplay", "canplaythrough", "seeking", "pause"];
    for (const e of events) el.addEventListener(e, update);
    el.addEventListener("waiting", stop);
    for (const e of ["playing", "timeupdate", "seeked"])
      el.addEventListener(e, go);
    for (const e of ["loadeddata", "seeked", "playing"])
      el.addEventListener(e, frame);
    el.addEventListener("error", fail);
    return () => {
      for (const e of events) el.removeEventListener(e, update);
      el.removeEventListener("waiting", stop);
      for (const e of ["playing", "timeupdate", "seeked"])
        el.removeEventListener(e, go);
      for (const e of ["loadeddata", "seeked", "playing"])
        el.removeEventListener(e, frame);
      el.removeEventListener("error", fail);
      clearTimeout(stallTimer.current);
      if (reported.current) live.current.onWaiting(clip.id, false);
    };
  }, [clip.id, video]);

  // Follow the playhead. Runs every frame while playing, so it only touches
  // the element when something is off.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.volume = mix.volume;
    el.muted = mix.muted;
    report();
    if (failed) {
      // the filmstrip takes over; don't leave its sound running unsynced
      if (!el.paused) el.pause();
      return;
    }

    if (!started) {
      if (!el.paused) el.pause();
      return;
    }
    const drift = el.currentTime - offset;
    if (mode === "playing") {
      if (Math.abs(drift) > SEEK_DRIFT_S) {
        if (!el.seeking) el.currentTime = offset;
      } else {
        // catch up (or wait) over about a second, in coarse steps
        const r =
          Math.abs(drift) < DEADBAND_S
            ? 1
            : Math.round(Math.min(1.1, Math.max(0.9, 1 - drift)) * 50) / 50;
        if (el.playbackRate !== r) el.playbackRate = r;
      }
      if (el.paused)
        el.play().catch((e: DOMException) => {
          // a pause() interrupting play() is expected; anything else is not
          if (e.name !== "AbortError") setFailed(true);
        });
    } else if (mode === "holding") {
      // The buffering clip keeps trying to play and catches up on its own;
      // the others wait in place.
      if (reported.current) {
        if (el.paused) el.play().catch(() => {});
      } else if (!el.paused) el.pause();
    } else {
      if (!el.paused) el.pause();
      if (Math.abs(drift) > 0.04 && !el.seeking) el.currentTime = offset;
    }
  });

  const src = `${API_URL}/api/assets/${clip.id}/presignedUrl`;
  // Start loading at the right spot: a media fragment avoids fetching the
  // head of a long clip just to seek away from it.
  const initial = `${src}#t=${Math.max(0, offset).toFixed(3)}`;
  const [mountSrc] = useState(initial);

  if (!video)
    return <audio ref={ref} src={mountSrc} preload="auto" className="hidden" />;
  return (
    <video
      ref={ref}
      src={mountSrc}
      preload="auto"
      playsInline
      disablePictureInPicture
      className={cn(
        "absolute inset-0 size-full object-contain bg-black pointer-events-none",
        !(picture && started && !failed) && "invisible",
      )}
    />
  );
}
