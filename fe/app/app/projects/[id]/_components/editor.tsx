"use client";

import { Frame, Meters, SinkBadge } from "@/app/app/_components/frame";
import { AppHeader } from "@/app/app/_components/header";
import { Gutter, Panel, Segmented, Stat } from "@/app/app/_components/panel";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import {
  fmtClock,
  fmtDate,
  fmtDur,
  fmtSize,
  fmtTC,
  fmtWindow,
  hash,
  spansDays,
} from "@/lib/format";
import { toast } from "@/components/ui/toast";
import { fetchClient } from "@/lib/api/openapi-clients";
import {
  type Clip,
  type Flag,
  type Marker,
  type Project,
  type SinkView,
  clipAt,
  clipsInRange,
  groupBySink,
  toApiFlag,
} from "@/lib/media";
import { cn } from "@/lib/utils";
import {
  BookmarkPlusIcon,
  CheckIcon,
  ChevronFirstIcon,
  ChevronLastIcon,
  ChevronRightIcon,
  CircleIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  KeyboardIcon,
  LayoutGridIcon,
  MagnetIcon,
  MousePointerClickIcon,
  PauseIcon,
  PlayIcon,
  Redo2Icon,
  RotateCcwIcon,
  Share2Icon,
  SkipBackIcon,
  SkipForwardIcon,
  StepBackIcon,
  StepForwardIcon,
  Undo2Icon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toProject } from "@/lib/hooks/useMedia";
import { useQueryClient } from "@tanstack/react-query";
import { DEFAULT_MIX, type TrackMix } from "./media";
import { Monitor, type MonitorMedia, type Track } from "./monitor";
import { type ClipFilter, Timeline } from "./timeline";

const MARKER_COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7"];
const HISTORY_LIMIT = 200;
const mixKey = (projectId: string) => `sscrub:mix:${projectId}`;
const MOD =
  typeof navigator !== "undefined" && /Mac|iP(hone|ad)/.test(navigator.platform)
    ? "⌘"
    : "Ctrl+";

/** One saved change: flag a clip, or add/remove a marker. */
type Op =
  | { kind: "flag"; clipId: string; flag: Flag | null }
  | { kind: "addMarker"; marker: Marker }
  | { kind: "removeMarker"; marker: Marker };

/** An undoable edit, as the op that makes it and the op that reverts it. */
interface Edit {
  label: string;
  redo: Op;
  undo: Op;
}

/**
 * Multicam culling editor. Expects loaded data; remount (via `key`) when the
 * project changes, since playhead/flags/markers are initialized from it.
 */
export function Editor({
  project,
  sinks,
  clips,
}: {
  project: Project;
  sinks: SinkView[];
  clips: Clip[];
}) {
  const { start: from, end: to } = project;
  const multiDay = spansDays(from, to);

  const tracks: Track[] = useMemo(() => {
    const bySink = groupBySink(clips);
    return project.sinkIds
      .flatMap((id) => sinks.find((s) => s.id === id) ?? [])
      .map((sink, index) => ({
        sink,
        clips: clipsInRange(bySink[sink.id] ?? [], from, to),
        index,
      }));
  }, [project, sinks, clips, from, to]);

  const editPoints = useMemo(
    () =>
      [
        ...new Set(
          tracks.flatMap((tr) =>
            tr.clips.flatMap((c) => [c.start, c.start + c.duration]),
          ),
        ),
      ]
        .filter((p) => p >= from && p <= to)
        .sort((a, b) => a - b),
    [tracks, from, to],
  );

  // Merged spans where at least one sink is rolling; playback skips the gaps.
  const coverage = useMemo(() => {
    const spans = tracks
      .flatMap((tr) => tr.clips)
      .map((c): [number, number] => [
        Math.max(from, c.start),
        Math.min(to, c.start + c.duration),
      ])
      .sort((a, b) => a[0] - b[0]);
    const out: [number, number][] = [];
    for (const [s, e] of spans) {
      const last = out.at(-1);
      if (last && s <= last[1]) last[1] = Math.max(last[1], e);
      else out.push([s, e]);
    }
    return out;
  }, [tracks, from, to]);

  // Start where the most sinks are rolling at once. That count only changes
  // at a clip start, so those are the only candidates worth checking.
  const [t, setT] = useState(() => {
    let best = from;
    let bestN = 0;
    for (const c of tracks.flatMap((tr) => tr.clips)) {
      const tt = Math.max(from, c.start);
      const n = tracks.filter((tr) => clipAt(tr.clips, tt)).length;
      if (n > bestN) [best, bestN] = [tt, n];
    }
    return Math.min(to, best + 1000);
  });
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  // Real media is mounted from the moment 1× playback starts until the next
  // seek, so pausing keeps the decoded frame on screen.
  const [mediaOn, setMediaOn] = useState(false);
  // Clips whose media is still buffering; the clock holds until it's empty.
  const [waiting, setWaiting] = useState<ReadonlySet<string>>(new Set());
  const onWaiting = useCallback(
    (id: string, w: boolean) =>
      setWaiting((cur) => {
        if (cur.has(id) === w) return cur;
        const n = new Set(cur);
        if (w) n.add(id);
        else n.delete(id);
        return n;
      }),
    [],
  );
  const [mix, setMix] = useState<Record<string, TrackMix>>(() => {
    try {
      return JSON.parse(localStorage.getItem(mixKey(project.id)) ?? "{}");
    } catch {
      return {};
    }
  });
  const updateMix = useCallback(
    (sinkId: string, patch: Partial<TrackMix>) =>
      setMix((cur) => {
        const n = {
          ...cur,
          [sinkId]: { ...DEFAULT_MIX, ...cur[sinkId], ...patch },
        };
        try {
          localStorage.setItem(mixKey(project.id), JSON.stringify(n));
        } catch {}
        return n;
      }),
    [project.id],
  );
  const [solo, setSolo] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);
  const [filter, setFilter] = useState<ClipFilter>("all");
  const [leftTab, setLeftTab] = useState<"sinks" | "markers">("sinks");
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const [flags, setFlags] = useState<Record<string, Flag>>(project.flags);
  const [markers, setMarkers] = useState<Marker[]>(project.markers);

  const queryClient = useQueryClient();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // the project list shows flag counts and last-edited times
      queryClient.invalidateQueries({ queryKey: ["get", "/api/projects"] });
    };
  }, [queryClient]);

  // Edits apply locally right away and are saved in order through one queue,
  // so an undo can never overtake the change it reverts. After a failed save
  // the rest of the queue is skipped and the editor reloads flags and markers
  // from the server (retrying until it answers), dropping the history.
  const saves = useRef<Promise<unknown>>(Promise.resolve());
  const outOfSync = useRef(false);
  const [undoStack, setUndoStack] = useState<Edit[]>([]);
  const [redoStack, setRedoStack] = useState<Edit[]>([]);

  const resync = async () => {
    for (let attempt = 0; mounted.current; attempt++) {
      const res = await fetchClient
        .GET("/api/projects/{id}", { params: { path: { id: project.id } } })
        .catch(() => undefined);
      if (res?.data && mounted.current) {
        const p = toProject(res.data);
        setFlags(p.flags);
        setMarkers(p.markers);
        setUndoStack([]);
        setRedoStack([]);
        outOfSync.current = false;
        return;
      }
      await new Promise((r) => setTimeout(r, Math.min(30_000, 2000 * 2 ** attempt)));
    }
  };

  const save = (what: string, request: () => Promise<{ error?: unknown }>) => {
    saves.current = saves.current.then(async () => {
      if (outOfSync.current) return;
      const { error } = await request().catch((e) => ({ error: e }));
      if (error === undefined) return;
      outOfSync.current = true;
      toast.add({
        type: "error",
        title: `Could not save ${what}`,
        description:
          (error as { error?: string })?.error ??
          "Reloading the saved state from the server.",
      });
      void resync();
    });
  };

  const apply = (op: Op) => {
    switch (op.kind) {
      case "flag":
        setFlags((cur) => {
          const n = { ...cur };
          if (op.flag) n[op.clipId] = op.flag;
          else delete n[op.clipId];
          return n;
        });
        save("flag", () =>
          fetchClient.PUT("/api/projects/{id}/flags/{assetId}", {
            params: { path: { id: project.id, assetId: op.clipId } },
            body: { flag: op.flag ? toApiFlag(op.flag) : null },
          }),
        );
        break;
      case "addMarker":
        setMarkers((m) => [...m, op.marker]);
        save("marker", () =>
          fetchClient.PUT("/api/projects/{id}/markers/{markerId}", {
            params: { path: { id: project.id, markerId: op.marker.id } },
            body: {
              time: new Date(op.marker.t).toISOString(),
              label: op.marker.label,
              color: op.marker.color,
            },
          }),
        );
        break;
      case "removeMarker":
        setMarkers((m) => m.filter((x) => x.id !== op.marker.id));
        save("marker", () =>
          fetchClient.DELETE("/api/projects/{id}/markers/{markerId}", {
            params: { path: { id: project.id, markerId: op.marker.id } },
          }),
        );
        break;
    }
  };

  /** Applies a new edit and records it for undo. */
  const commit = (edit: Edit) => {
    apply(edit.redo);
    setUndoStack((s) => [...s.slice(-(HISTORY_LIMIT - 1)), edit]);
    setRedoStack([]);
  };

  const undo = () => {
    const edit = undoStack.at(-1);
    if (!edit) return;
    apply(edit.undo);
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((s) => [...s, edit]);
  };

  const redo = () => {
    const edit = redoStack.at(-1);
    if (!edit) return;
    apply(edit.redo);
    setRedoStack((s) => s.slice(0, -1));
    setUndoStack((s) => [...s, edit]);
  };

  const realtime = playing && rate === 1;
  const seek = useCallback(
    (tt: number) => {
      // media follows a jump during 1× playback; otherwise it's dropped
      if (!realtime) setMediaOn(false);
      setT(Math.min(to, Math.max(from, tt)));
    },
    [from, to, realtime],
  );

  const play = (r: number) => {
    setRate(r);
    setPlaying(true);
    setMediaOn(r === 1);
  };
  const pause = () => setPlaying(false);
  const stopForScrub = () => {
    setPlaying(false);
    setMediaOn(false);
  };

  // playback loop
  const stalled = realtime && mediaOn && waiting.size > 0;
  useEffect(() => {
    if (!playing || stalled) return;
    let last = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const dt = (now - last) * rate;
      last = now;
      setT((cur) => {
        let next = cur + dt;
        if (coverage.length) {
          if (dt > 0) {
            const span = coverage.find(([, e]) => next < e);
            next = span ? Math.max(next, span[0]) : to;
          } else {
            const span = coverage.findLast(([s]) => s <= next);
            next = span ? Math.min(next, span[1] - 1) : from;
          }
        }
        if (next >= to || next <= from) setPlaying(false);
        return Math.min(to, Math.max(from, next));
      });
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [playing, stalled, rate, from, to, coverage]);

  const media: MonitorMedia | null = useMemo(
    () =>
      mediaOn
        ? {
            mode: !realtime ? "paused" : stalled ? "holding" : "playing",
            mix,
            onWaiting,
          }
        : null,
    [mediaOn, realtime, stalled, mix, onWaiting],
  );

  const focusClip: Clip | undefined = useMemo(() => {
    const all = tracks.flatMap((tr) => tr.clips);
    if (selectedClip) return all.find((c) => c.id === selectedClip);
    if (solo) return clipAt(tracks.find((tr) => tr.sink.id === solo)!.clips, t);
  }, [tracks, selectedClip, solo, t]);

  const flag = (f: Flag | null) => {
    if (!focusClip) return;
    const clipId = focusClip.id;
    const prev = flags[clipId] ?? null;
    const next = f && prev !== f ? f : null;
    if (next === prev) return;
    commit({
      label: next ? `${next === "pick" ? "Pick" : "Reject"} clip` : "Clear flag",
      redo: { kind: "flag", clipId, flag: next },
      undo: { kind: "flag", clipId, flag: prev },
    });
  };

  const addMarker = () => {
    const marker: Marker = {
      id: crypto.randomUUID(),
      t,
      label: `Marker ${markers.length + 1}`,
      color: MARKER_COLORS[markers.length % MARKER_COLORS.length],
    };
    commit({
      label: "Add marker",
      redo: { kind: "addMarker", marker },
      undo: { kind: "removeMarker", marker },
    });
  };

  const removeMarker = (marker: Marker) =>
    commit({
      label: "Delete marker",
      redo: { kind: "removeMarker", marker },
      undo: { kind: "addMarker", marker },
    });

  const toggleHidden = (id: string) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const prevEdit = () =>
    seek([...editPoints].reverse().find((p) => p < t - 50) ?? from);
  const nextEdit = () => seek(editPoints.find((p) => p > t + 50) ?? to);

  const togglePlay = () => (playing ? pause() : play(1));

  // keyboard: Premiere-ish
  const keys = useRef<(e: KeyboardEvent) => void>(null);
  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    const k = e.key.toLowerCase();
    if (e.metaKey || e.ctrlKey) {
      if (k === "z" && !e.shiftKey) undo();
      else if ((k === "z" && e.shiftKey) || k === "y") redo();
      else return; // leave browser shortcuts alone
      e.preventDefault();
      return;
    }
    const step = e.shiftKey ? 10_000 : 1000;
    if (k === " ") togglePlay();
    else if (k === "k") pause();
    else if (k === "l") play(playing && rate > 0 ? Math.min(rate * 2, 32) : 1);
    else if (k === "j")
      play(playing && rate < 0 ? Math.max(rate * 2, -32) : -1);
    else if (k === "arrowleft") seek(t - step);
    else if (k === "arrowright") seek(t + step);
    else if (k === "arrowup") prevEdit();
    else if (k === "arrowdown") nextEdit();
    else if (k === "home") seek(from);
    else if (k === "end") seek(to);
    else if (k === "escape" || k === "0") setSolo(null);
    else if (/^[1-9]$/.test(k) && tracks[+k - 1])
      setSolo(tracks[+k - 1].sink.id);
    else if (k === "m") addMarker();
    else if (k === "p") flag("pick");
    else if (k === "x") flag("reject");
    else if (k === "u") flag(null);
    else if (k === "=" || k === "+") setZoom((z) => Math.min(64, z * 1.5));
    else if (k === "-") setZoom((z) => Math.max(1, z / 1.5));
    else return;
    e.preventDefault();
  };
  useEffect(() => {
    keys.current = onKey;
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => keys.current?.(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const allClips = tracks.flatMap((tr) => tr.clips);
  const picks = allClips.filter((c) => flags[c.id] === "pick").length;
  const rejects = allClips.filter((c) => flags[c.id] === "reject").length;
  const soloTrack = tracks.find((tr) => tr.sink.id === solo);
  const audio = tracks.find((tr) => tr.sink.kind === "audio");
  const audioClip = audio && clipAt(audio.clips, t);
  const audioMix = (audio && mix[audio.sink.id]) || DEFAULT_MIX;
  const audioGain = audioMix.muted ? 0 : audioMix.volume;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <AppHeader
        actions={
          <div className="flex items-center gap-1 mr-1">
            <Button
              variant="ghost"
              size="icon-sm"
              title={
                undoStack.length
                  ? `Undo ${undoStack.at(-1)!.label} (${MOD}Z)`
                  : "Nothing to undo"
              }
              disabled={!undoStack.length}
              onClick={undo}
            >
              <Undo2Icon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              title={
                redoStack.length
                  ? `Redo ${redoStack.at(-1)!.label} (${MOD}⇧Z)`
                  : "Nothing to redo"
              }
              disabled={!redoStack.length}
              onClick={redo}
            >
              <Redo2Icon />
            </Button>
            <span className="h-4 w-px bg-hairline mx-1" />
            <Button variant="ghost">
              <Share2Icon data-icon="inline-start" /> Share
            </Button>
            <Button>
              <DownloadIcon data-icon="inline-start" /> Export picks
              <span className="tc ml-0.5 rounded-[3px] bg-white/20 px-1 text-[0.6rem]">
                {picks}
              </span>
            </Button>
          </div>
        }
      >
        <nav className="flex items-center gap-1.5 text-xs">
          <Link
            href="/app/projects"
            className="text-muted-foreground hover:text-foreground"
          >
            Projects
          </Link>
          <ChevronRightIcon className="size-3 text-muted-foreground" />
          <span className="font-medium">{project.name}</span>
          <span className="tc ml-1.5 text-[0.65rem] text-muted-foreground">
            {fmtWindow(from, to)}
          </span>
        </nav>
      </AppHeader>

      <ResizablePanelGroup
        orientation="vertical"
        className="flex-1 min-h-0 p-1"
      >
        <ResizablePanel defaultSize="61%" minSize="30%">
          <ResizablePanelGroup orientation="horizontal">
            {/* Left: sinks / markers */}
            <ResizablePanel defaultSize="17%" minSize="12%" maxSize="30%">
              <Panel
                tabs={[
                  { value: "sinks", label: "Sinks" },
                  {
                    value: "markers",
                    label: (
                      <>
                        Markers{" "}
                        <span className="tc text-muted-foreground ml-0.5">
                          {markers.length}
                        </span>
                      </>
                    ),
                  },
                ]}
                active={leftTab}
                onTab={setLeftTab}
                actions={
                  leftTab === "markers" && (
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      title="Add marker (M)"
                      onClick={addMarker}
                    >
                      <BookmarkPlusIcon />
                    </Button>
                  )
                }
              >
                {leftTab === "sinks" ? (
                  <div className="p-1.5 flex flex-col gap-px overflow-y-auto">
                    {tracks.map((tr) => (
                      <SinkRow
                        key={tr.sink.id}
                        track={tr}
                        from={from}
                        to={to}
                        live={!!clipAt(tr.clips, t)}
                        active={solo === tr.sink.id}
                        hidden={hidden.has(tr.sink.id)}
                        onClick={() =>
                          setSolo(solo === tr.sink.id ? null : tr.sink.id)
                        }
                        onToggleHidden={() => toggleHidden(tr.sink.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="p-1.5 flex flex-col gap-px overflow-y-auto">
                    {[...markers]
                      .sort((a, b) => a.t - b.t)
                      .map((m) => (
                        <div
                          key={m.id}
                          className="group/marker flex items-center rounded-md transition-colors hover:bg-white/4"
                        >
                          <button
                            onClick={() => seek(m.t)}
                            className="flex-1 min-w-0 flex items-center gap-2.5 px-2 h-8 text-xs text-left"
                          >
                            <span
                              className="w-0.75 h-4 rounded-full shrink-0"
                              style={{ background: m.color }}
                            />
                            <span className="flex-1 truncate">{m.label}</span>
                            <span className="tc text-[0.65rem] text-muted-foreground">
                              {multiDay && `${fmtDate(m.t)} `}
                              {fmtClock(m.t)}
                            </span>
                          </button>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            title="Delete marker"
                            className="mr-1 opacity-0 group-hover/marker:opacity-100 focus-visible:opacity-100"
                            onClick={() => removeMarker(m)}
                          >
                            <XIcon />
                          </Button>
                        </div>
                      ))}
                  </div>
                )}
              </Panel>
            </ResizablePanel>
            <Gutter group="horizontal" />

            {/* Center: program monitor */}
            <ResizablePanel minSize="35%">
              <Panel
                tabs={[
                  {
                    value: "program",
                    label: (
                      <>
                        Program{" "}
                        <span className="text-muted-foreground font-normal">
                          · {soloTrack ? soloTrack.sink.name : "Multiview"}
                        </span>
                      </>
                    ),
                  },
                ]}
                actions={
                  <Segmented
                    value={solo ?? "all"}
                    onChange={(v) => setSolo(v === "all" ? null : v)}
                    options={[
                      {
                        value: "all",
                        icon: <LayoutGridIcon />,
                        title: "All sinks (0)",
                      },
                      ...tracks.map((tr) => ({
                        value: tr.sink.id,
                        title: `${tr.sink.name} (${tr.index + 1})`,
                        label: (
                          <span className="flex items-center gap-1 tc">
                            <span
                              className="size-1.5 rounded-full"
                              style={{ background: tr.sink.color }}
                            />
                            {tr.index + 1}
                          </span>
                        ),
                      })),
                    ]}
                  />
                }
              >
                <Monitor
                  tracks={tracks}
                  hidden={hidden}
                  solo={solo}
                  t={t}
                  flags={flags}
                  media={media}
                  onSolo={setSolo}
                  onSeek={seek}
                />
                <ScrubBar
                  tracks={tracks}
                  markers={markers}
                  from={from}
                  to={to}
                  t={t}
                  onSeek={seek}
                  onScrubStart={stopForScrub}
                />
                <Transport
                  t={t}
                  multiDay={multiDay}
                  from={from}
                  to={to}
                  playing={playing}
                  rate={rate}
                  onTogglePlay={togglePlay}
                  onSeek={seek}
                  onPrevEdit={prevEdit}
                  onNextEdit={nextEdit}
                  onMarker={addMarker}
                />
              </Panel>
            </ResizablePanel>
            <Gutter group="horizontal" />

            {/* Right: inspector */}
            <ResizablePanel defaultSize="20%" minSize="14%" maxSize="32%">
              <Panel tabs={[{ value: "inspector", label: "Inspector" }]}>
                <div className="flex-1 overflow-y-auto">
                  {focusClip ? (
                    <Inspector
                      clip={focusClip}
                      sink={
                        tracks.find((tr) => tr.sink.id === focusClip.sinkId)!
                          .sink
                      }
                      t={t}
                      multiDay={multiDay}
                      flag={flags[focusClip.id]}
                      onFlag={flag}
                      onSeek={seek}
                    />
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
                      <span className="size-10 rounded-full bg-white/4 ring-1 ring-inset ring-hairline flex items-center justify-center text-muted-foreground">
                        <MousePointerClickIcon className="size-4" />
                      </span>
                      <div>
                        <div className="text-xs font-medium">
                          Nothing selected
                        </div>
                        <p className="text-[0.7rem] text-muted-foreground mt-1 leading-relaxed">
                          Click a clip on the timeline, or view a single sink to
                          inspect what’s under the playhead.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <CullSummary
                  picks={picks}
                  rejects={rejects}
                  total={allClips.length}
                />
              </Panel>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <Gutter group="vertical" />

        {/* Bottom: timeline + meters */}
        <ResizablePanel minSize="20%">
          <div className="h-full flex gap-1">
            <Panel
              className="flex-1 min-w-0"
              tabs={[
                {
                  value: "timeline",
                  label: (
                    <>
                      Timeline{" "}
                      <span className="text-muted-foreground font-normal">
                        · {project.name}
                      </span>
                    </>
                  ),
                },
              ]}
              actions={
                <div className="flex items-center gap-2">
                  <Segmented
                    value={filter}
                    onChange={setFilter}
                    options={[
                      { value: "all", label: "All" },
                      { value: "unreviewed", label: "Unreviewed" },
                      { value: "pick", label: "Picks" },
                      { value: "reject", label: "Rejects" },
                    ]}
                  />
                  <span className="h-4 w-px bg-hairline" />
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    title="Snap"
                    className="text-primary"
                  >
                    <MagnetIcon />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    title="Zoom out (-)"
                    onClick={() => setZoom((z) => Math.max(1, z / 1.5))}
                  >
                    <ZoomOutIcon />
                  </Button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.001}
                    value={Math.log(zoom) / Math.log(64)}
                    onChange={(e) => setZoom(Math.pow(64, +e.target.value))}
                    className="range-slim w-24"
                    title="Zoom"
                  />
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    title="Zoom in (=)"
                    onClick={() => setZoom((z) => Math.min(64, z * 1.5))}
                  >
                    <ZoomInIcon />
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => setZoom(1)}
                  >
                    Fit
                  </Button>
                </div>
              }
            >
              <Timeline
                tracks={tracks}
                from={from}
                to={to}
                t={t}
                playing={playing}
                zoom={zoom}
                solo={solo}
                hidden={hidden}
                flags={flags}
                filter={filter}
                markers={markers}
                selectedClip={selectedClip}
                mix={mix}
                onMix={updateMix}
                onSeek={seek}
                onScrubStart={stopForScrub}
                onSelectClip={setSelectedClip}
                onSolo={setSolo}
                onToggleHidden={toggleHidden}
              />
            </Panel>
            <section className="w-14 shrink-0 flex flex-col rounded-md border border-hairline bg-panel overflow-hidden">
              <div className="h-8 shrink-0 flex items-center justify-center border-b border-hairline text-[0.65rem] text-muted-foreground">
                dB
              </div>
              <div className="flex-1 min-h-0 flex py-2 pl-1">
                <div className="tc flex flex-col justify-between text-[0.5rem] text-muted-foreground/70 pr-0.5">
                  {[0, -6, -12, -24, -48].map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                </div>
                <Meters
                  className="flex-1 justify-center py-0! pr-1!"
                  levels={
                    audioClip
                      ? [
                          levelAt(audioClip, t, 0) * audioGain,
                          levelAt(audioClip, t, 1) * audioGain,
                        ]
                      : [0, 0]
                  }
                />
              </div>
              <div className="h-5 shrink-0 flex justify-center gap-2 text-[0.55rem] text-muted-foreground border-t border-hairline items-center">
                <span>L</span>
                <span>R</span>
              </div>
            </section>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      <StatusBar playing={playing} buffering={stalled} />
    </div>
  );
}

function levelAt(clip: Clip, t: number, ch: number) {
  const seed = hash(clip.id) % 1000;
  const n = Math.floor(t / 100) + ch * 3;
  const r = (x: number) => {
    const v = Math.sin(x * 12.9898 + seed * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  return Math.max(
    0.03,
    (0.3 + 0.7 * r(Math.floor(n / 22))) * (0.25 + 0.75 * r(n)),
  );
}

function SinkRow({
  track,
  from,
  to,
  live,
  active,
  hidden,
  onClick,
  onToggleHidden,
}: {
  track: Track;
  from: number;
  to: number;
  live: boolean;
  active: boolean;
  hidden: boolean;
  onClick: () => void;
  onToggleHidden: () => void;
}) {
  const covered = track.clips.reduce(
    (a, c) => a + Math.min(to, c.start + c.duration) - Math.max(from, c.start),
    0,
  );
  const pct = covered / (to - from);
  return (
    <div
      onClick={onClick}
      className={cn(
        "group flex items-center gap-2.5 rounded-md px-2 py-2 cursor-pointer transition-colors hover:bg-white/4",
        active && "bg-white/[0.07] hover:bg-white/[0.07]",
        hidden && "opacity-50",
      )}
    >
      <span className="relative">
        {/* <SinkBadge sink={track.sink } /> */}
        {live && (
          <span
            className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-reject ring-2 ring-panel"
            title="Recording at playhead"
          />
        )}
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="text-xs font-medium truncate">
            {track.sink.name}
          </span>
        </span>
        <span className="mt-1 flex items-center gap-1.5">
          <span className="flex-1 h-0.75 rounded-full bg-white/6 overflow-hidden">
            <span
              className="block h-full rounded-full"
              style={{ width: `${pct * 100}%`, background: track.sink.color }}
            />
          </span>
          <span className="tc text-[0.6rem] text-muted-foreground w-7 text-right">
            {Math.round(pct * 100)}%
          </span>
        </span>
      </span>
      <Kbd className="group-hover:hidden">{track.index + 1}</Kbd>
      <button
        title={hidden ? "Show in multiview" : "Hide from multiview"}
        onClick={(e) => {
          e.stopPropagation();
          onToggleHidden();
        }}
        className="hidden group-hover:inline-flex size-4 items-center justify-center text-muted-foreground hover:text-foreground"
      >
        {hidden ? (
          <EyeOffIcon className="size-3.5" />
        ) : (
          <EyeIcon className="size-3.5" />
        )}
      </button>
    </div>
  );
}

/** Thin overview under the monitor: combined coverage, markers, playhead. */
function ScrubBar({
  tracks,
  markers,
  from,
  to,
  t,
  onSeek,
  onScrubStart,
}: {
  tracks: Track[];
  markers: Marker[];
  from: number;
  to: number;
  t: number;
  onSeek: (t: number) => void;
  onScrubStart: () => void;
}) {
  const span = to - from;
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const seekTo = (x: number) =>
      onSeek(from + ((x - rect.left) / rect.width) * span);
    onScrubStart();
    seekTo(e.clientX);
    const move = (ev: PointerEvent) => seekTo(ev.clientX);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const p = (t - from) / span;
  return (
    <div className="shrink-0 px-3 pt-2 bg-panel">
      <div
        className="relative h-5 cursor-pointer select-none"
        onPointerDown={down}
      >
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-white/6 overflow-hidden">
          <ScrubCoverage tracks={tracks} from={from} to={to} />
          {/* moving parts use transforms only: no layout, no repaint */}
          <div
            className="absolute inset-0 origin-left bg-playhead/50 will-change-transform"
            style={{ transform: `scaleX(${p})` }}
          />
        </div>
        <ScrubMarkers markers={markers} from={from} to={to} />
        <div
          className="absolute inset-0 pointer-events-none will-change-transform"
          style={{ transform: `translateX(${p * 100}%)` }}
        >
          <span className="absolute top-1/2 left-0 size-3 -translate-1/2 rounded-full bg-white shadow-[0_0_0_3px_color-mix(in_oklch,var(--playhead)_35%,transparent)]" />
        </div>
      </div>
    </div>
  );
}

const ScrubCoverage = memo(function ScrubCoverage({
  tracks,
  from,
  to,
}: {
  tracks: Track[];
  from: number;
  to: number;
}) {
  const span = to - from;
  const pct = (x: number) => `${((x - from) / span) * 100}%`;
  return tracks.flatMap((tr) =>
    tr.clips.map((c) => (
      <div
        key={c.id}
        className="absolute inset-y-0 bg-white/9"
        style={{
          left: pct(Math.max(from, c.start)),
          width: pct(
            from + Math.min(to, c.start + c.duration) - Math.max(from, c.start),
          ),
        }}
      />
    )),
  );
});

const ScrubMarkers = memo(function ScrubMarkers({
  markers,
  from,
  to,
}: {
  markers: Marker[];
  from: number;
  to: number;
}) {
  const pct = (x: number) => `${((x - from) / (to - from)) * 100}%`;
  return markers.map((m) => (
    <span
      key={m.id}
      className="absolute top-0 h-1.5 w-0.75 -translate-x-1/2 rounded-full"
      style={{ left: pct(m.t), background: m.color }}
    />
  ));
});

function Transport({
  t,
  multiDay,
  from,
  to,
  playing,
  rate,
  onTogglePlay,
  onSeek,
  onPrevEdit,
  onNextEdit,
  onMarker,
}: {
  t: number;
  multiDay: boolean;
  from: number;
  to: number;
  playing: boolean;
  rate: number;
  onTogglePlay: () => void;
  onSeek: (t: number) => void;
  onPrevEdit: () => void;
  onNextEdit: () => void;
  onMarker: () => void;
}) {
  const btn = "text-muted-foreground hover:text-foreground";
  return (
    <div className="h-12 shrink-0 grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-3 bg-panel">
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="tc text-[0.95rem] font-medium text-playhead">
          {fmtTC(t)}
        </span>
        {multiDay && (
          <span className="hidden xl:inline tc text-[0.7rem] text-muted-foreground truncate">
            {fmtDate(t)}
          </span>
        )}
        {playing && rate !== 1 && (
          <span className="tc rounded-[3px] bg-primary/20 px-1 text-[0.6rem] text-primary">
            {rate > 0 ? `${rate}×` : `◀ ${-rate}×`}
          </span>
        )}
      </div>
      <div className="flex items-center gap-0.5">
        <Button
          size="icon"
          variant="ghost"
          className={btn}
          title="Add marker (M)"
          onClick={onMarker}
        >
          <BookmarkPlusIcon />
        </Button>
        <span className="h-4 w-px bg-hairline mx-1" />
        <Button
          size="icon"
          variant="ghost"
          className={btn}
          title="Go to start (Home)"
          onClick={() => onSeek(from)}
        >
          <SkipBackIcon />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className={btn}
          title="Previous edit (↑)"
          onClick={onPrevEdit}
        >
          <ChevronFirstIcon />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className={btn}
          title="Back 1s (←)"
          onClick={() => onSeek(t - 1000)}
        >
          <StepBackIcon />
        </Button>
        <button
          title="Play / pause (Space)"
          onClick={onTogglePlay}
          className="mx-1.5 size-9 rounded-full bg-foreground text-background inline-flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
        >
          {playing ? (
            <PauseIcon className="size-4" fill="currentColor" />
          ) : (
            <PlayIcon className="size-4 translate-x-px" fill="currentColor" />
          )}
        </button>
        <Button
          size="icon"
          variant="ghost"
          className={btn}
          title="Forward 1s (→)"
          onClick={() => onSeek(t + 1000)}
        >
          <StepForwardIcon />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className={btn}
          title="Next edit (↓)"
          onClick={onNextEdit}
        >
          <ChevronLastIcon />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className={btn}
          title="Go to end (End)"
          onClick={() => onSeek(to)}
        >
          <SkipForwardIcon />
        </Button>
        <span className="h-4 w-px bg-hairline mx-1" />
        <Button size="icon" variant="ghost" className={btn} title="Loop">
          <RotateCcwIcon />
        </Button>
      </div>
      <div className="flex items-center justify-end gap-2 text-[0.7rem] text-muted-foreground">
        <span className="tc">
          <span className="text-foreground/80">{fmtDur(t - from)}</span> /{" "}
          {fmtDur(to - from)}
        </span>
        <span className="tc rounded-lg px-1.5 py-0.5 ring-1 ring-inset ring-hairline">
          Proxy ½
        </span>
      </div>
    </div>
  );
}

function Inspector({
  clip,
  sink,
  t,
  multiDay,
  flag,
  onFlag,
  onSeek,
}: {
  clip: Clip;
  sink: SinkView;
  t: number;
  multiDay: boolean;
  flag?: Flag;
  onFlag: (f: Flag | null) => void;
  onSeek: (t: number) => void;
}) {
  const inClip = t >= clip.start && t < clip.start + clip.duration;
  const pos = inClip ? (t - clip.start) / clip.duration : 0;
  return (
    <div className="p-3 flex flex-col gap-4">
      <div className="relative rounded-[3px] overflow-hidden ring-1 ring-white/8">
        <Frame
          sink={sink}
          asset={clip.asset}
          t={inClip ? t : clip.start + clip.duration / 2}
          live
          className="aspect-video"
        />
        <div className="absolute bottom-0 inset-x-0 h-0.75 bg-black/50">
          <div
            className="h-full bg-playhead"
            style={{ width: `${pos * 100}%` }}
          />
        </div>
      </div>

      <div className="flex items-start gap-2.5">
        <SinkBadge sink={sink} />
        <div className="min-w-0 flex-1">
          <div className="tc text-[0.8rem] font-medium truncate">
            {clip.fileName}
          </div>
          <div className="text-[0.65rem] text-muted-foreground truncate">
            {sink.name} · {sink.model}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <button
          onClick={() => onFlag("pick")}
          className={cn(
            "h-8 rounded-md inline-flex items-center gap-1.5 px-2.5 text-xs font-medium ring-1 ring-inset transition-colors",
            flag === "pick"
              ? "bg-pick/15 text-pick ring-pick/40"
              : "ring-hairline text-muted-foreground hover:text-foreground hover:bg-white/4",
          )}
        >
          <CheckIcon className="size-3.5" strokeWidth={2.5} /> Pick{" "}
          <Kbd className="ml-auto">P</Kbd>
        </button>
        <button
          onClick={() => onFlag("reject")}
          className={cn(
            "h-8 rounded-md inline-flex items-center gap-1.5 px-2.5 text-xs font-medium ring-1 ring-inset transition-colors",
            flag === "reject"
              ? "bg-reject/15 text-reject ring-reject/40"
              : "ring-hairline text-muted-foreground hover:text-foreground hover:bg-white/4",
          )}
        >
          <XIcon className="size-3.5" strokeWidth={2.5} /> Reject{" "}
          <Kbd className="ml-auto">X</Kbd>
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="eyebrow mb-0.5">Timing</div>
        {multiDay && <Stat label="Date" value={fmtDate(clip.start)} />}
        <Stat label="Captured" value={fmtClock(clip.start)} />
        <Stat label="Ends" value={fmtClock(clip.start + clip.duration)} />
        <Stat label="Duration" value={fmtDur(clip.duration)} />
        <Stat label="Playhead" value={inClip ? fmtTC(t - clip.start) : "—"} />
        <button
          className="self-start text-[0.65rem] text-primary hover:underline mt-0.5"
          onClick={() => onSeek(clip.start)}
        >
          Jump to clip start
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="eyebrow mb-0.5">File</div>
        <Stat label="Type" value={clip.asset.contentType || "—"} />
        <Stat label="Size" value={fmtSize(clip.size)} />
        <Stat
          label="Status"
          value={
            <span className="inline-flex items-center gap-1.5">
              <CircleIcon
                className={cn(
                  "size-1.5",
                  clip.status === "Ready"
                    ? "fill-pick text-pick"
                    : "fill-amber-400 text-amber-400",
                )}
              />
              {clip.status}
            </span>
          }
        />
      </div>
    </div>
  );
}

function CullSummary({
  picks,
  rejects,
  total,
}: {
  picks: number;
  rejects: number;
  total: number;
}) {
  return (
    <div className="shrink-0 p-3 flex flex-col gap-2.5 border-t border-hairline">
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">Culling</span>
        <span className="tc text-[0.7rem] text-muted-foreground">
          <span className="text-foreground">
            {Math.round(((picks + rejects) / total) * 100)}%
          </span>{" "}
          reviewed
        </span>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden bg-white/6 gap-px">
        <div
          className="bg-pick"
          style={{ width: `${(picks / total) * 100}%` }}
        />
        <div
          className="bg-reject"
          style={{ width: `${(rejects / total) * 100}%` }}
        />
      </div>
      <div className="grid grid-cols-3 text-[0.65rem]">
        <Legend color="var(--pick)" label="Picks" value={picks} />
        <Legend color="var(--reject)" label="Rejects" value={rejects} />
        <Legend
          color="oklch(1 0 0 / 0.2)"
          label="Left"
          value={total - picks - rejects}
        />
      </div>
    </div>
  );
}

function Legend({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span className="size-1.5 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="tc text-sm font-medium">{value}</span>
    </div>
  );
}

function StatusBar({
  playing,
  buffering,
}: {
  playing: boolean;
  buffering: boolean;
}) {
  const keys: [string, string][] = [
    ["Space", "Play"],
    ["J K L", "Shuttle"],
    ["↑ ↓", "Edits"],
    ["1–9", "Solo"],
    ["P", "Pick"],
    ["X", "Reject"],
    ["M", "Marker"],
  ];
  return (
    <footer className="h-6 shrink-0 px-3 flex items-center gap-4 text-[0.65rem] text-muted-foreground bg-app border-t border-hairline">
      <span className="flex items-center gap-1.5">
        <span
          className={cn(
            "size-1.5 rounded-full",
            buffering
              ? "bg-amber-400 animate-pulse"
              : playing
                ? "bg-playhead"
                : "bg-pick",
          )}
        />
        {buffering ? "Buffering" : playing ? "Playing" : "Ready"}
      </span>
      <span className="tc">25 fps · UTC · Proxies</span>
      <span className="flex-1" />
      <span className="hidden lg:flex items-center gap-3">
        <KeyboardIcon className="size-3" />
        {keys.map(([k, v]) => (
          <span key={k} className="flex items-center gap-1">
            <Kbd>{k}</Kbd> {v}
          </span>
        ))}
      </span>
    </footer>
  );
}
