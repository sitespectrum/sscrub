"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import {
  ArrowDownUpIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  DownloadIcon,
  FilmIcon,
  FolderInputIcon,
  LayoutGridIcon,
  ListIcon,
  LoaderCircleIcon,
  PlusIcon,
  RotateCwIcon,
  SearchIcon,
  SparklesIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UploadCloudIcon,
  XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Coverage } from "./_components/coverage";
import { Frame, SinkBadge, SinkIcon } from "./_components/frame";
import { Gutter } from "./_components/gutter";
import { MockHeader } from "./_components/header";
import { Kbd, Segmented } from "./_components/ui";
import {
  type AssetStatus,
  type Clip,
  CLIPS,
  HOUR_MS,
  SINKS,
  at,
  clipsBySink,
  fmtClock,
  fmtDate,
  fmtDur,
  fmtSize,
  sinkById,
} from "./_lib/data";

type Sort = "captured" | "duration" | "size" | "name";

export default function LibraryMockup() {
  const [sinkId, setSinkId] = useState<string | null>("a-cam");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<Sort>("captured");
  const [thumb, setThumb] = useState(220);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const sink = sinkId ? sinkById(sinkId) : null;
  const scope = useMemo(() => (sinkId ? clipsBySink(sinkId) : CLIPS), [sinkId]);
  const clips = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = scope.filter(
      (c) => !q || c.fileName.toLowerCase().includes(q),
    );
    const by: Record<Sort, (a: Clip, b: Clip) => number> = {
      captured: (a, b) => a.start - b.start,
      duration: (a, b) => b.duration - a.duration,
      size: (a, b) => b.size - a.size,
      name: (a, b) => a.fileName.localeCompare(b.fileName),
    };
    return [...list].sort(by[sort]);
  }, [scope, query, sort]);

  // group by capture hour when sorted chronologically
  const groups = useMemo(() => {
    if (sort !== "captured")
      return [{ key: "all", label: null as string | null, clips }];
    const m = new Map<number, Clip[]>();
    for (const c of clips) {
      const h = Math.floor(c.start / HOUR_MS) * HOUR_MS;
      m.set(h, [...(m.get(h) ?? []), c]);
    }
    return [...m].map(([h, cs]) => ({
      key: String(h),
      label: `${fmtClock(h, false)} – ${fmtClock(h + HOUR_MS, false)}`,
      clips: cs,
    }));
  }, [clips, sort]);

  const totalSize = scope.reduce((a, c) => a + c.size, 0);
  const totalDur = scope.reduce((a, c) => a + c.duration, 0);
  const pending = CLIPS.filter((c) => c.status !== "Ready");

  const toggleSelect = (id: string, additive: boolean) =>
    setSelected((s) => {
      const n = new Set(additive ? s : []);
      if (s.has(id) && additive) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      <MockHeader active="library" />
      <ResizablePanelGroup
        orientation="horizontal"
        className="flex-1 min-h-0 p-1"
      >
        {/* Sidebar */}
        <ResizablePanel defaultSize="17%" minSize="13%" maxSize="28%">
          <aside className="h-full flex flex-col rounded-md border border-(--nle-hairline) bg-(--nle-panel) overflow-hidden">
            <div className="p-2 flex flex-col gap-px">
              <NavItem
                active={sinkId === null}
                onClick={() => setSinkId(null)}
                icon={<FilmIcon />}
                label="All footage"
                meta={CLIPS.length}
              />
              <NavItem icon={<ClockIcon />} label="Recently added" meta={12} />
              <NavItem
                icon={<TriangleAlertIcon />}
                label="Needs attention"
                meta={1}
                tone="warn"
              />
            </div>
            <div className="px-4 pt-3 pb-1.5 flex items-center justify-between">
              <span className="eyebrow">Sinks</span>
              <NewSinkDialog />
            </div>
            <div className="px-2 flex flex-col gap-px overflow-y-auto">
              {SINKS.map((s) => {
                const cs = clipsBySink(s.id);
                const busy = cs.some(
                  (c) => c.status === "Uploading" || c.status === "Processing",
                );
                return (
                  <button
                    key={s.id}
                    onClick={() => setSinkId(s.id)}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04]",
                      sinkId === s.id &&
                        "bg-white/[0.07] hover:bg-white/[0.07]",
                    )}
                  >
                    <SinkBadge sink={s} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-medium truncate">
                        {s.name}
                      </span>
                      <span className="block text-[0.65rem] text-muted-foreground truncate">
                        {s.model}
                      </span>
                    </span>
                    {busy ? (
                      <LoaderCircleIcon className="size-3 animate-spin text-muted-foreground" />
                    ) : (
                      <span className="tc text-[0.65rem] text-muted-foreground">
                        {cs.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex-1" />
            <div className="m-2 rounded-md bg-(--nle-well) p-3 ring-1 ring-inset ring-(--nle-hairline)">
              <div className="flex justify-between text-[0.65rem] mb-2">
                <span className="font-medium">Storage</span>
                <span className="tc text-muted-foreground">
                  {fmtSize(CLIPS.reduce((a, c) => a + c.size, 0))} of 2 TB
                </span>
              </div>
              <div className="flex h-1 rounded-full overflow-hidden bg-white/[0.06] gap-px">
                {SINKS.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      width: `${(clipsBySink(s.id).reduce((a, c) => a + c.size, 0) / 2e12) * 100}%`,
                      background: s.color,
                    }}
                  />
                ))}
              </div>
            </div>
          </aside>
        </ResizablePanel>
        <Gutter group="horizontal" />

        {/* Main */}
        <ResizablePanel minSize="50%">
          <main className="relative h-full flex flex-col rounded-md border border-(--nle-hairline) bg-(--nle-panel) overflow-hidden">
            <div className="px-5 py-4 flex items-center gap-4 border-b border-(--nle-hairline)">
              {sink ? (
                <SinkBadge sink={sink} size="lg" />
              ) : (
                <span className="size-8 rounded-md bg-white/[0.06] flex items-center justify-center">
                  <FilmIcon className="size-4" />
                </span>
              )}
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <h1 className="text-base font-semibold tracking-tight">
                    {sink?.name ?? "All footage"}
                  </h1>
                  {sink && (
                    <span className="text-xs text-muted-foreground">
                      {sink.model}
                    </span>
                  )}
                </div>
                <div className="tc text-[0.7rem] text-muted-foreground mt-0.5">
                  {scope.length} clips <Dot /> {fmtDur(totalDur)} <Dot />{" "}
                  {fmtSize(totalSize)} <Dot /> {fmtDate(at(0))}
                </div>
              </div>
              <div className="flex-1" />
              <Button
                size="lg"
                className="shadow-[0_1px_0_0_oklch(1_0_0/0.15)_inset]"
              >
                <UploadCloudIcon data-icon="inline-start" /> Upload footage
              </Button>
            </div>

            {/* Toolbar */}
            <div className="h-11 px-5 flex items-center gap-2 border-b border-(--nle-hairline) bg-(--nle-well)/40">
              <div className="relative w-56">
                <SearchIcon className="size-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter by file name"
                  className="h-7 pl-7 text-xs"
                />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline" />}>
                  <ArrowDownUpIcon data-icon="inline-start" />
                  {
                    {
                      captured: "Capture time",
                      duration: "Duration",
                      size: "File size",
                      name: "Name",
                    }[sort]
                  }
                  <ChevronDownIcon
                    data-icon="inline-end"
                    className="opacity-60"
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-44">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={sort}
                      onValueChange={(v) => setSort(v as Sort)}
                    >
                      <DropdownMenuRadioItem value="captured">
                        Capture time
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="duration">
                        Duration
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="size">
                        File size
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="name">
                        Name
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="flex-1" />
              {view === "grid" && (
                <input
                  type="range"
                  min={150}
                  max={340}
                  value={thumb}
                  onChange={(e) => setThumb(+e.target.value)}
                  className="nle-range w-24"
                  title="Thumbnail size"
                />
              )}
              <Segmented
                value={view}
                onChange={setView}
                options={[
                  { value: "grid", icon: <LayoutGridIcon />, title: "Grid" },
                  { value: "list", icon: <ListIcon />, title: "List" },
                ]}
              />
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="px-5 pt-5 flex flex-col gap-4">
                <section className="rounded-lg bg-(--nle-well) ring-1 ring-inset ring-(--nle-hairline) p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="eyebrow">Recording timeline</span>
                      <span className="text-[0.7rem] text-muted-foreground">
                        {fmtDate(at(0))}
                      </span>
                    </div>
                    <span className="tc text-[0.6rem] text-muted-foreground">
                      UTC
                    </span>
                  </div>
                  <Coverage
                    sinks={sink ? [sink] : SINKS}
                    from={at(9)}
                    to={at(20)}
                    rowHeight={sink ? 20 : 10}
                    labelWidth={96}
                  />
                </section>
                <DropZone sinkName={sink?.name} />
              </div>

              {groups.map((g) => (
                <section
                  key={g.key}
                  className="pb-2 [content-visibility:auto] [contain-intrinsic-size:auto_640px]"
                >
                  {g.label && (
                    <div className="sticky top-0 z-10 px-5 py-2.5 flex items-center gap-3 bg-(--nle-panel)">
                      <span className="tc text-xs font-medium">{g.label}</span>
                      <span className="text-[0.65rem] text-muted-foreground tc">
                        {g.clips.length} clips <Dot />{" "}
                        {fmtDur(g.clips.reduce((a, c) => a + c.duration, 0))}
                      </span>
                      <span className="flex-1 h-px bg-(--nle-hairline)" />
                    </div>
                  )}
                  <div className="px-5">
                    {view === "grid" ? (
                      <div
                        className="grid gap-x-3 gap-y-4"
                        style={{
                          gridTemplateColumns: `repeat(auto-fill, minmax(${thumb}px, 1fr))`,
                        }}
                      >
                        {g.clips.map((c) => (
                          <ClipCard
                            key={c.id}
                            clip={c}
                            showSink={!sink}
                            selected={selected.has(c.id)}
                            onSelect={(add) => toggleSelect(c.id, add)}
                          />
                        ))}
                      </div>
                    ) : (
                      <ClipTable
                        clips={g.clips}
                        selected={selected}
                        onSelect={toggleSelect}
                      />
                    )}
                  </div>
                </section>
              ))}
              <div className="h-24" />
            </div>

            {selected.size > 0 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 rounded-lg bg-(--nle-raised) p-1 pl-3 ring-1 ring-white/10 shadow-2xl shadow-black/60">
                <span className="text-xs font-medium pr-2">
                  {selected.size} selected
                </span>
                <span className="h-4 w-px bg-(--nle-hairline)" />
                <Button variant="ghost">
                  <FolderInputIcon data-icon="inline-start" /> Move to sink
                </Button>
                <Button variant="ghost">
                  <DownloadIcon data-icon="inline-start" /> Download
                </Button>
                <Button variant="ghost" className="text-(--nle-reject)">
                  <Trash2Icon data-icon="inline-start" /> Delete
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setSelected(new Set())}
                >
                  <XIcon />
                </Button>
              </div>
            )}
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>
      <UploadTray clips={pending} />
    </div>
  );
}

const Dot = () => <span className="mx-1 opacity-40">·</span>;

function NavItem({
  active,
  onClick,
  icon,
  label,
  meta,
  tone,
}: {
  active?: boolean;
  onClick?: () => void;
  icon: React.ReactNode;
  label: string;
  meta?: React.ReactNode;
  tone?: "warn";
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2 h-7 text-xs text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground [&_svg]:size-3.5",
        active && "bg-white/[0.07] text-foreground",
      )}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      <span
        className={cn(
          "tc text-[0.65rem]",
          tone === "warn" &&
            "rounded-full bg-amber-500/15 px-1.5 text-amber-400",
        )}
      >
        {meta}
      </span>
    </button>
  );
}

function DropZone({ sinkName }: { sinkName?: string }) {
  return (
    <div className="group rounded-lg border border-dashed border-white/10 hover:border-primary/60 hover:bg-primary/[0.04] transition-colors px-4 py-3 flex items-center gap-3">
      <span className="size-8 rounded-full bg-white/[0.05] group-hover:bg-primary/15 group-hover:text-primary flex items-center justify-center transition-colors">
        <UploadCloudIcon className="size-4" />
      </span>
      <div className="flex-1 text-xs">
        <span className="font-medium">
          Drop footage {sinkName ? <>into {sinkName}</> : "anywhere"}
        </span>
        <span className="text-muted-foreground">
          {" "}
          — capture time is read from metadata, duplicates are skipped by
          content hash.
        </span>
      </div>
      <span className="text-[0.65rem] text-muted-foreground tc">
        MP4 · MOV · MXF · WAV
      </span>
    </div>
  );
}

const STATUS: Record<AssetStatus, { icon: React.ReactNode; label: string }> = {
  Ready: {
    icon: <CheckIcon className="size-3 text-(--nle-pick)" />,
    label: "Ready",
  },
  Uploading: {
    icon: <UploadCloudIcon className="size-3 text-(--nle-playhead)" />,
    label: "Uploading",
  },
  Processing: {
    icon: <LoaderCircleIcon className="size-3 animate-spin text-amber-400" />,
    label: "Processing",
  },
  Failed: {
    icon: <TriangleAlertIcon className="size-3 text-(--nle-reject)" />,
    label: "Failed",
  },
};

function ClipCard({
  clip,
  showSink,
  selected,
  onSelect,
}: {
  clip: Clip;
  showSink: boolean;
  selected: boolean;
  onSelect: (additive: boolean) => void;
}) {
  const sink = sinkById(clip.sinkId);
  const [hover, setHover] = useState<number | null>(null);
  const t = clip.start + clip.duration * (hover ?? 0.35);

  return (
    <div
      className="group flex flex-col gap-2 cursor-default"
      onClick={(e) => onSelect(e.metaKey || e.ctrlKey || e.shiftKey)}
    >
      <div
        className={cn(
          "relative rounded-md overflow-hidden ring-1 ring-white/[0.06] transition-shadow",
          selected
            ? "ring-2 ring-primary shadow-[0_0_0_4px_oklch(0.6_0.2_285/0.18)]"
            : "group-hover:ring-white/20",
        )}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(
            Math.min(0.999, Math.max(0, (e.clientX - r.left) / r.width)),
          );
        }}
        onPointerLeave={() => setHover(null)}
      >
        <Frame
          sink={sink}
          clip={clip}
          t={t}
          live={hover !== null}
          className="aspect-video"
        />
        {hover !== null && (
          <>
            <div
              className="absolute inset-y-0 w-px bg-(--nle-playhead)/90"
              style={{ left: `${hover * 100}%` }}
            />
            <span className="absolute top-1.5 left-1/2 -translate-x-1/2 rounded bg-black/70 px-1.5 py-px tc text-[0.6rem] text-white">
              {fmtClock(t)}
            </span>
          </>
        )}
        <span
          className={cn(
            "absolute top-1.5 left-1.5 size-4 rounded-[4px] ring-1 flex items-center justify-center transition-opacity",
            selected
              ? "bg-primary ring-primary opacity-100"
              : "bg-black/40 ring-white/40 opacity-0 group-hover:opacity-100",
          )}
        >
          {selected && <CheckIcon className="size-3 text-white" />}
        </span>
        <span className="absolute bottom-1.5 right-1.5 rounded-[4px] bg-black/70 px-1 py-px tc text-[0.6rem] text-white">
          {fmtDur(clip.duration)}
        </span>
        {showSink && (
          <span className="absolute bottom-1.5 left-1.5 rounded-[4px] bg-black/70 pl-1 pr-1.5 py-px text-[0.6rem] text-white flex items-center gap-1">
            <span style={{ color: sink.color }}>
              <SinkIcon kind={sink.kind} className="size-2.5" />
            </span>
            {sink.name}
          </span>
        )}
      </div>
      <div className="flex items-start gap-2 px-0.5">
        <div className="flex-1 min-w-0">
          <div className="tc text-xs font-medium truncate">{clip.fileName}</div>
          <div className="tc text-[0.65rem] text-muted-foreground">
            {fmtClock(clip.start)} <Dot /> {fmtSize(clip.size)}
          </div>
        </div>
        {clip.status !== "Ready" && (
          <span className="mt-0.5">{STATUS[clip.status].icon}</span>
        )}
      </div>
    </div>
  );
}

const COLS =
  "grid-cols-[28px_minmax(0,1.4fr)_minmax(0,1fr)_90px_80px_80px_minmax(0,1.2fr)_90px]";

function ClipTable({
  clips,
  selected,
  onSelect,
}: {
  clips: Clip[];
  selected: Set<string>;
  onSelect: (id: string, add: boolean) => void;
}) {
  return (
    <div className="rounded-md ring-1 ring-inset ring-(--nle-hairline) overflow-hidden text-xs">
      <div
        className={cn(
          "grid gap-3 px-3 h-8 items-center eyebrow bg-(--nle-well) border-b border-(--nle-hairline)",
          COLS,
        )}
      >
        <span />
        <span>Name</span>
        <span>Sink</span>
        <span>Captured</span>
        <span>Duration</span>
        <span className="text-right">Size</span>
        <span>Format</span>
        <span>Status</span>
      </div>
      {clips.map((c) => {
        const s = sinkById(c.sinkId);
        const sel = selected.has(c.id);
        return (
          <div
            key={c.id}
            onClick={(e) =>
              onSelect(c.id, e.metaKey || e.ctrlKey || e.shiftKey)
            }
            className={cn(
              "grid gap-3 px-3 h-9 items-center border-b border-(--nle-hairline) last:border-b-0 hover:bg-white/[0.03]",
              COLS,
              sel && "bg-primary/10 hover:bg-primary/15",
            )}
          >
            <Frame
              sink={s}
              clip={c}
              t={c.start + c.duration * 0.35}
              grain={false}
              thumb
              className="h-[18px] aspect-video rounded-[2px]"
            />
            <span className="tc truncate font-medium">{c.fileName}</span>
            <span className="flex items-center gap-1.5 truncate text-muted-foreground">
              <span
                className="size-2 rounded-[2px]"
                style={{ background: s.color }}
              />
              {s.name}
            </span>
            <span className="tc text-muted-foreground">
              {fmtClock(c.start)}
            </span>
            <span className="tc text-muted-foreground">
              {fmtDur(c.duration)}
            </span>
            <span className="tc text-muted-foreground text-right">
              {fmtSize(c.size)}
            </span>
            <span className="truncate text-muted-foreground">{c.codec}</span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              {STATUS[c.status].icon}
              {STATUS[c.status].label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function UploadTray({ clips }: { clips: Clip[] }) {
  const [open, setOpen] = useState(true);
  const uploading = clips.filter((c) => c.status === "Uploading");
  const overall =
    uploading.reduce((a, c) => a + (c.progress ?? 0), 0) /
    Math.max(1, uploading.length);
  return (
    <div className="fixed bottom-4 right-4 z-30 w-80 rounded-lg bg-(--nle-raised) ring-1 ring-white/10 shadow-2xl shadow-black/60 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
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
              stroke="var(--nle-playhead)"
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
        <div className="border-t border-(--nle-hairline) py-1">
          {clips.map((c) => {
            const s = sinkById(c.sinkId);
            return (
              <div key={c.id} className="px-3 py-1.5 flex items-center gap-2.5">
                <Frame
                  sink={s}
                  clip={{ ...c, status: "Ready" }}
                  t={c.start}
                  grain={false}
                  thumb
                  className="h-6 aspect-video rounded-[3px]"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-[0.7rem]">
                    <span className="tc truncate font-medium">
                      {c.fileName}
                    </span>
                    <span className="text-muted-foreground truncate">
                      {s.name}
                    </span>
                  </div>
                  {c.status === "Uploading" ? (
                    <div className="mt-1 h-[3px] rounded-full bg-white/[0.08] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-(--nle-playhead)"
                        style={{ width: `${(c.progress ?? 0) * 100}%` }}
                      />
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "text-[0.65rem]",
                        c.status === "Failed"
                          ? "text-(--nle-reject)"
                          : "text-muted-foreground",
                      )}
                    >
                      {c.status === "Processing"
                        ? "Generating proxies…"
                        : "No capture time in metadata"}
                    </div>
                  )}
                </div>
                {c.status === "Failed" ? (
                  <Button size="icon-xs" variant="ghost" title="Retry">
                    <RotateCwIcon />
                  </Button>
                ) : (
                  <span className="tc text-[0.6rem] text-muted-foreground">
                    {c.status === "Uploading" ? (
                      `${Math.round((c.progress ?? 0) * 100)}%`
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

function NewSinkDialog() {
  const [kind, setKind] = useState<(typeof SINKS)[number]["kind"]>("camera");
  return (
    <Dialog>
      <DialogTrigger
        render={<Button size="icon-xs" variant="ghost" title="New sink" />}
      >
        <PlusIcon />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New sink</DialogTitle>
          <DialogDescription>
            A sink is one recording device. Everything dumped into it lands on
            its own track.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sink-name">Name</Label>
            <Input id="sink-name" placeholder="C-Cam" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Device type</Label>
            <div className="grid grid-cols-5 gap-1.5">
              {(["camera", "action", "drone", "phone", "audio"] as const).map(
                (k) => (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-md py-2.5 text-[0.65rem] capitalize text-muted-foreground ring-1 ring-inset ring-(--nle-hairline) hover:bg-white/[0.04] hover:text-foreground",
                      kind === k &&
                        "ring-primary bg-primary/10 text-foreground",
                    )}
                  >
                    <SinkIcon kind={k} className="size-4" />
                    {k}
                  </button>
                ),
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sink-offset">Clock offset</Label>
            <Input id="sink-offset" placeholder="+00:00:00" className="tc" />
            <span className="text-[0.65rem] text-muted-foreground">
              Corrects a device clock that drifted from real time. <Kbd>±</Kbd>
            </span>
          </div>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <DialogClose render={<Button />}>Create sink</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
