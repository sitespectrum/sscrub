"use client";

import { Frame, SinkBadge, SinkIcon } from "@/app/app/_components/frame";
import { Segmented } from "@/app/app/_components/panel";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { $api } from "@/lib/api/openapi-clients";
import { Asset, Sink } from "@/lib/api/sscrub-api-schema";
import { API_URL } from "@/lib/constants";
import { DAY_MS, fmtClock, fmtDate, fmtDur, fmtSize } from "@/lib/format";
import { useUploadFiles } from "@/lib/hooks/useUploadFiles";
import { SinkType, type AssetStatus } from "@/lib/media";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownUpIcon,
  CheckIcon,
  ChevronDownIcon,
  FilmIcon,
  LayoutGridIcon,
  ListIcon,
  LoaderCircleIcon,
  Maximize2Icon,
  PencilIcon,
  SearchIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UploadCloudIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SinkDialog } from "./sink-dialog";

type Sort = "captured" | "duration" | "size" | "name";

export function Library({ sinkId }: { sinkId: string | null }) {
  const { data: sink, isLoading: sinkLoading } = $api.useQuery(
    "get",
    "/api/sinks/{id}",
    {
      params: {
        path: {
          id: sinkId ?? "",
        },
      },
    },
  );
  const { data: assets, isLoading: assetsLoading } = $api.useQuery(
    "get",
    "/api/assets",
    {
      params: {
        query: {
          sinkId: sinkId ?? undefined,
        },
      },
    },
  );
  const { data: sinks, isLoading: sinksLoading } = $api.useQuery(
    "get",
    "/api/sinks",
  );
  const { data: libraryStats, isLoading: libraryStatsLoading } = $api.useQuery(
    "get",
    "/api/stats/library",
    undefined,
    {
      select: (val) =>
        sinkId ? val?.bySink?.find((x) => x.sinkId == sinkId) : val?.overall,
    },
  );

  const { uploadFiles } = useUploadFiles(sinkId ?? "");

  const [view, setView] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<Sort>("captured");
  const [thumb, setThumb] = useState(220);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const searchRes = useMemo(() => {
    if (!assets) return [];

    const cleanQuery = query.trim().toLowerCase();
    const list = assets.filter(
      (asset) =>
        !cleanQuery || asset.fileName.toLowerCase().includes(cleanQuery),
    );
    const by: Record<Sort, (a: Asset, b: Asset) => number> = {
      captured: (a, b) =>
        Date.parse(b.captureDate ?? b.uploadDate) -
        Date.parse(a.captureDate ?? a.uploadDate),
      duration: (a, b) => b.durationMillis - a.durationMillis,
      size: (a, b) => b.size - a.size,
      name: (a, b) => a.fileName.localeCompare(b.fileName),
    };
    return [...list].sort(by[sort]);
  }, [assets, query, sort]);

  const groups = useMemo(() => {
    if (sort !== "captured")
      return [{ key: "all", label: null as string | null, assets: searchRes }];
    const dayAssetsMap = new Map<number, Asset[]>();
    for (const asset of searchRes) {
      const day =
        Math.floor(Date.parse(asset.captureDate ?? asset.uploadDate) / DAY_MS) *
        DAY_MS;
      dayAssetsMap.set(day, [...(dayAssetsMap.get(day) ?? []), asset]);
    }
    return [...dayAssetsMap].map(([dayNum, dayAssets]) => ({
      key: String(dayNum),
      label: fmtDate(dayNum, true),
      assets: dayAssets,
    }));
  }, [searchRes, sort]);

  const totalSize = libraryStats?.size;
  const totalDur = libraryStats?.durationMillis;

  const toggleSelect = (id: string, additive: boolean) =>
    setSelected((s) => {
      const n = new Set(additive ? s : []);
      if (s.has(id) && additive) n.delete(id);
      else n.add(id);
      return n;
    });

  const uploadFileRef = useRef<HTMLInputElement>(null);

  const pickFiles = () => {
    if (!uploadFileRef.current) return;

    uploadFileRef.current.click();
  };

  const startUpload = async (event: Event) => {
    if (!sinkId) {
      toast.add({
        type: "danger",
        title: "SinkID is null",
      });
      return;
    }

    if (!uploadFileRef.current?.files) return;

    uploadFiles(uploadFileRef.current.files);

    // const file = uploadFileRef.current?.files?.item(0);
    // if (!file) return;

    // uploadFile(file, {
    //   sinkId: sinkId!,
    //   onProgress: (uploaded, total) => console.log(uploaded / (total || 1)),
    // });
  };

  useEffect(() => {
    uploadFileRef.current?.addEventListener("input", startUpload);

    return () =>
      uploadFileRef.current?.removeEventListener("input", startUpload);
  }, [uploadFileRef.current]);

  return (
    <main className="relative h-full flex flex-col">
      <div className="px-5 py-4 flex items-center gap-4 border-b border-hairline">
        {sinkId ? (
          <SinkBadge sink={sink} loading={sinkLoading} size="lg" />
        ) : (
          <span className="size-8 rounded-md bg-white/6 flex items-center justify-center">
            <FilmIcon className="size-4" />
          </span>
        )}
        <div className="min-w-0">
          {sinkLoading ? (
            <Skeleton className="h-5 mb-1.5 w-[15vw]" />
          ) : (
            <>
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
            </>
          )}
          {sinkLoading || libraryStatsLoading ? (
            <Skeleton className="w-2/3 h-3 mt-2.5" />
          ) : (
            <>
              <div className="tc text-[0.7rem] text-muted-foreground mt-0.5">
                {libraryStats?.count} clips <Dot /> {fmtDur(totalDur!)} <Dot />{" "}
                {fmtSize(totalSize!)}
              </div>
            </>
          )}
        </div>
        <div className="flex-1" />
        {sinkId && (
          <SinkDialog
            sink={sink}
            trigger={
              <Button size="lg" variant="outline" disabled={sinkLoading}>
                <PencilIcon data-icon="inline-start" /> Edit sink
              </Button>
            }
          />
        )}
        <input
          ref={uploadFileRef}
          type="file"
          aria-hidden="true"
          className="hidden"
          multiple
        />
        <Button
          size="lg"
          className="shadow-[0_1px_0_0_oklch(1_0_0/0.15)_inset]"
          disabled={sinkLoading || sinkId == null}
          onClick={pickFiles}
        >
          <UploadCloudIcon data-icon="inline-start" /> Upload footage
        </Button>
      </div>

      {/* Toolbar */}
      <div className="h-11 px-5 flex items-center gap-2 border-b border-hairline bg-well/40">
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
            <ChevronDownIcon data-icon="inline-end" className="opacity-60" />
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
                <DropdownMenuRadioItem value="name">Name</DropdownMenuRadioItem>
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
            className="range-slim w-24"
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

      {assetsLoading || sinksLoading ? (
        <div className="flex-1 w-full flex justify-center items-center">
          <Spinner className="size-12 text-muted" />
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto">
            {/* <div className="px-5 pt-5 flex flex-col gap-4">
              <section className="rounded-lg bg-well ring-1 ring-inset ring-hairline p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="eyebrow">Recording timeline</span>
                    <span className="text-[0.7rem] text-muted-foreground">
                      {scope.length > 0 && fmtDate(covFrom)}
                    </span>
                  </div>
                  <span className="tc text-[0.6rem] text-muted-foreground">
                    UTC
                  </span>
                </div>
                <Coverage
                  sinks={sink ? [sink] : sinks}
                  clips={clipsBySink}
                  from={covFrom}
                  to={covTo}
                  rowHeight={sink ? 20 : 10}
                  labelWidth={96}
                />
              </section>
              <DropZone sinkName={sink?.name} />
            </div> */}

            {groups.map((group) => (
              <section
                key={group.key}
                className="pb-2 [content-visibility:auto] [contain-intrinsic-size:auto_640px]"
              >
                {group.label && (
                  <div className="sticky -top-px z-10 px-5 py-2.5 flex items-center gap-3 bg-panel">
                    <span className="tc text-xs font-medium">
                      {group.label}
                    </span>
                    <span className="text-[0.65rem] text-muted-foreground tc">
                      {group.assets.length} clips <Dot />{" "}
                      {fmtDur(
                        group.assets.reduce((a, b) => a + b.durationMillis, 0),
                      )}
                    </span>
                    <span className="flex-1 h-px bg-hairline" />
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
                      {group.assets.map((asset) => (
                        <ClipCard
                          key={asset.id}
                          asset={asset}
                          sink={sinks?.find((x) => x.id == asset.sinkId)!}
                          showSink={!sink}
                          selected={selected.has(asset.id)}
                          onSelect={(add) => toggleSelect(asset.id, add)}
                        />
                      ))}
                    </div>
                  ) : (
                    <ClipTable
                      assets={group.assets}
                      loading={assetsLoading}
                      sinkId={sinkId}
                      selected={selected}
                      onSelect={toggleSelect}
                    />
                  )}
                </div>
              </section>
            ))}
            <div className="h-24" />
          </div>
        </>
      )}

      {selected.size > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 rounded-lg bg-raised p-1 pl-3 ring-1 ring-white/10 shadow-2xl shadow-black/60">
          <span className="text-xs font-medium pr-2">
            {selected.size} selected
          </span>
          <span className="h-4 w-px bg-hairline" />
          {/* <Button variant="ghost">
            <FolderInputIcon data-icon="inline-start" /> Move to sink
          </Button>
          <Button variant="ghost">
            <DownloadIcon data-icon="inline-start" /> Download
          </Button>
          */}
          <DeleteAssetsDialog
            ids={[...selected]}
            onDeleted={() => setSelected(new Set())}
          />
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
  );
}

const Dot = () => <span className="mx-1 opacity-40">·</span>;

function DeleteAssetsDialog({
  ids,
  onDeleted,
}: {
  ids: string[];
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const del = $api.useMutation("delete", "/api/assets/{id}");
  const [pending, setPending] = useState(false);

  const confirm = async () => {
    setPending(true);
    const results = await Promise.allSettled(
      ids.map((id) => del.mutateAsync({ params: { path: { id } } })),
    );
    setPending(false);

    queryClient.invalidateQueries({ queryKey: ["get", "/api/assets"] });
    queryClient.invalidateQueries({ queryKey: ["get", "/api/stats/library"] });

    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0)
      toast.add({
        type: "error",
        title: `Could not delete ${failed} of ${ids.length} clips`,
      });

    setOpen(false);
    onDeleted();
  };

  const label = ids.length === 1 ? "1 clip" : `${ids.length} clips`;

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger
        render={<Button variant="ghost" className="text-reject" />}
      >
        <Trash2Icon data-icon="inline-start" /> Delete
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Delete {label}?</DialogTitle>
          <DialogDescription>
            The original footage and all derived files will be permanently
            removed. This can not be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={pending} />}>
            Cancel
          </DialogClose>
          <Button variant="destructive" onClick={confirm} disabled={pending}>
            {pending && <Spinner data-icon="inline-start" />}
            Delete {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DropZone({ sinkName }: { sinkName?: string }) {
  return (
    <div className="group rounded-lg border border-dashed border-white/10 hover:border-primary/60 hover:bg-primary/4 transition-colors px-4 py-3 flex items-center gap-3">
      <span className="size-8 rounded-full bg-white/5 group-hover:bg-primary/15 group-hover:text-primary flex items-center justify-center transition-colors">
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
    icon: <CheckIcon className="size-3 text-pick" />,
    label: "Ready",
  },
  Uploading: {
    icon: <UploadCloudIcon className="size-3 text-playhead" />,
    label: "Uploading",
  },
  Processing: {
    icon: <LoaderCircleIcon className="size-3 animate-spin text-amber-400" />,
    label: "Processing",
  },
  Failed: {
    icon: <TriangleAlertIcon className="size-3 text-reject" />,
    label: "Failed",
  },
};

function ClipCard({
  asset,
  sink,
  showSink,
  selected,
  onSelect,
}: {
  asset: Asset;
  sink: Sink;
  showSink: boolean;
  selected: boolean;
  onSelect: (additive: boolean) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const t =
    Date.parse(asset.captureDate ?? asset.uploadDate) +
    asset.durationMillis * (hover ?? 0.35);

  return (
    <>
      <div
        className="group flex flex-col gap-2 cursor-default"
        onClick={(e) => onSelect(e.metaKey || e.ctrlKey || e.shiftKey)}
      >
        <div
          className={cn(
            "relative rounded-md overflow-hidden ring-1 ring-white/6 transition-shadow",
            selected
              ? "ring-2 ring-primary shadow-[0_0_0_4px_color-mix(in_oklch,var(--primary)_18%,transparent)]"
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
            asset={asset}
            t={t}
            live={hover !== null}
            className="aspect-video"
          />
          {hover !== null && (
            <>
              <div
                className="absolute inset-y-0 w-px bg-playhead/90"
                style={{ left: `${hover * 100}%` }}
              />
              <span className="absolute top-1.5 left-1/2 -translate-x-1/2 rounded bg-black/70 px-1.5 py-px tc text-[0.6rem] text-white">
                {fmtClock(t)}
              </span>
            </>
          )}
          <span
            className={cn(
              "absolute top-1.5 left-1.5 size-4 rounded-lg ring-1 flex items-center justify-center transition-opacity",
              selected
                ? "bg-primary ring-primary opacity-100"
                : "bg-black/40 ring-white/40 opacity-0 group-hover:opacity-100",
            )}
          >
            {selected && <CheckIcon className="size-3 text-white" />}
          </span>
          {(asset.status == "Ready" ||
            asset.status == "Processing" ||
            asset.status == "Failed") && (
            <>
              <button
                type="button"
                title="Fullscreen preview"
                className="absolute top-1.5 right-1.5 size-5 rounded-lg bg-black/40 ring-1 ring-white/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-black/70 focus-visible:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewOpen(true);
                }}
              >
                <Maximize2Icon className="size-3" />
                <span className="sr-only">Fullscreen preview</span>
              </button>
            </>
          )}
          <span className="absolute bottom-1.5 right-1.5 rounded-lg bg-black/70 px-1 py-px tc text-[0.6rem] text-white">
            {fmtDur(asset.durationMillis)}
          </span>
          {showSink && (
            <span className="absolute bottom-1.5 left-1.5 rounded-lg bg-black/70 pl-1 pr-1.5 py-px text-[0.6rem] text-white flex items-center gap-1">
              <span style={{ color: sink.color }}>
                <SinkIcon type={sink.type as SinkType} className="size-2.5" />
              </span>
              {sink.name}
            </span>
          )}
        </div>
        <div className="flex items-start gap-2 px-0.5">
          <div className="flex-1 min-w-0">
            <div className="tc text-xs font-medium truncate">
              {asset.fileName}
            </div>
            <div className="tc text-[0.65rem] text-muted-foreground">
              {fmtClock(Date.parse(asset.captureDate ?? asset.uploadDate))}{" "}
              <Dot /> {fmtSize(asset.size)}
            </div>
          </div>
          {asset.status !== "Ready" && (
            <span className="mt-0.5">{STATUS[asset.status].icon}</span>
          )}
        </div>
      </div>

      <ClipPreviewDialog
        asset={asset}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </>
  );
}

function ClipPreviewDialog({
  asset,
  open,
  onOpenChange,
}: {
  asset: Asset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const src = `${API_URL}/api/assets/${asset.id}/presignedUrl`;
  const mediaClass = "min-h-0 w-full h-full object-contain";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-screen h-dvh max-w-none sm:max-w-none rounded-none ring-0 bg-black p-4 grid-rows-[auto_minmax(0,1fr)]">
        <DialogHeader className="pr-8">
          <DialogTitle className="tc truncate text-white">
            {asset.fileName}
          </DialogTitle>
          <DialogDescription className="tc text-[0.65rem]">
            {fmtDate(Date.parse(asset.captureDate ?? asset.uploadDate), true)}{" "}
            <Dot />{" "}
            {fmtClock(Date.parse(asset.captureDate ?? asset.uploadDate))}{" "}
            <Dot /> {fmtDur(asset.durationMillis)} <Dot /> {fmtSize(asset.size)}
          </DialogDescription>
        </DialogHeader>
        {open &&
          (asset.contentType.startsWith("image/") ? (
            <img src={src} alt={asset.fileName} className={mediaClass} />
          ) : asset.contentType.startsWith("audio/") ? (
            <div className="flex items-center justify-center">
              <audio src={src} controls autoPlay className="w-full max-w-xl" />
            </div>
          ) : (
            <video src={src} controls autoPlay className={mediaClass} />
          ))}
      </DialogContent>
    </Dialog>
  );
}

const COLS =
  "grid-cols-[28px_minmax(0,1.4fr)_minmax(0,1fr)_90px_80px_80px_minmax(0,1.2fr)_90px]";

function ClipTable({
  assets,
  loading,
  sinkId,
  selected,
  onSelect,
}: {
  assets: Asset[];
  loading: boolean;
  sinkId: string | null;
  selected: Set<string>;
  onSelect: (id: string, add: boolean) => void;
}) {
  const { data: sinks, isLoading: sinksLoading } = $api.useQuery(
    "get",
    "/api/sinks",
  );

  if (loading) return <></>;

  return (
    <div className="rounded-md ring-1 ring-inset ring-hairline overflow-hidden text-xs">
      <div
        className={cn(
          "grid gap-3 px-3 h-8 items-center eyebrow bg-well border-b border-hairline",
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
      {assets!.map((asset) => {
        const sink = sinks?.find((x) => x.id == asset.sinkId)!;
        const isSelected = asset.id && selected.has(asset.id);
        return (
          <div
            key={asset.id}
            onClick={(e) =>
              onSelect(asset.id, e.metaKey || e.ctrlKey || e.shiftKey)
            }
            className={cn(
              "grid gap-3 px-3 h-9 items-center border-b border-hairline last:border-b-0 hover:bg-white/3",
              COLS,
              isSelected && "bg-primary/10 hover:bg-primary/15",
            )}
          >
            {}
            <Frame
              sink={sink}
              asset={asset}
              t={
                Date.parse(asset.captureDate ?? asset.uploadDate) +
                asset.durationMillis * 0.35
              }
              grain={false}
              thumb
              className="h-4.5 aspect-video rounded-xs"
            />
            <span className="tc truncate font-medium">{asset.fileName}</span>
            <span className="flex items-center gap-1.5 truncate text-muted-foreground">
              <span
                className="size-2 rounded-xs"
                style={{ background: sink.color }}
              />
              {sink.name}
            </span>
            <span className="tc text-muted-foreground">
              {fmtClock(Date.parse(asset.captureDate ?? asset.uploadDate))}
            </span>
            <span className="tc text-muted-foreground">
              {fmtDur(asset.durationMillis)}
            </span>
            <span className="tc text-muted-foreground text-right">
              {fmtSize(asset.size)}
            </span>
            <span className="truncate text-muted-foreground">
              {asset.contentType}
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              {STATUS[asset.status || "unknown"].icon}
              {STATUS[asset.status || "unknown"].label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
