"use client";

import { Coverage } from "@/app/app/_components/coverage";
import { Frame } from "@/app/app/_components/frame";
import { AppHeader } from "@/app/app/_components/header";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { $api } from "@/lib/api/openapi-clients";
import { fmtAgo, fmtDur, fmtWindow } from "@/lib/format";
import { useClips, useProjects, useSinks } from "@/lib/hooks/useMedia";
import {
  type Clip,
  type Project,
  type SinkView,
  clipsInRange,
  groupBySink,
  nextClip,
} from "@/lib/media";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { PlusIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

export default function ProjectsPage() {
  const projects = useProjects();
  const sinks = useSinks();
  const clips = useClips();
  const sinkById = useMemo(
    () => new Map(sinks.data?.map((s) => [s.id, s])),
    [sinks.data],
  );
  const clipsBySink = useMemo(() => groupBySink(clips.data ?? []), [clips.data]);
  const loading = projects.isLoading || sinks.isLoading || clips.isLoading;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <AppHeader active="projects" />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex items-end justify-between gap-4 mb-6">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
              <p className="text-xs text-muted-foreground mt-1">
                Each project is a set of sinks over a window of time, laid out
                as a multicam timeline.
              </p>
            </div>
            <Link
              href="/app/projects/new"
              className={buttonVariants({ size: "lg" })}
            >
              <PlusIcon data-icon="inline-start" /> New project
            </Link>
          </div>

          {projects.error && (
            <p className="mb-5 text-xs text-reject">Could not load projects.</p>
          )}

          <div className="grid gap-5 grid-cols-[repeat(auto-fill,minmax(min(320px,100%),1fr))]">
            {loading
              ? Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="rounded-lg min-h-72" />
                ))
              : projects.data?.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    sinkById={sinkById}
                    clipsBySink={clipsBySink}
                  />
                ))}
            <Link
              href="/app/projects/new"
              className="rounded-lg border border-dashed border-white/10 flex flex-col items-center justify-center gap-3 text-xs text-muted-foreground transition-colors hover:text-foreground hover:border-primary/60 hover:bg-primary/4 min-h-72"
            >
              <span className="size-9 rounded-full bg-white/5 flex items-center justify-center">
                <PlusIcon className="size-4" />
              </span>
              <span className="text-center">
                <span className="block font-medium text-foreground">
                  New project
                </span>
                Pick sinks and a time window
              </span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectCard({
  project: p,
  sinkById,
  clipsBySink,
}: {
  project: Project;
  sinkById: Map<string, SinkView>;
  clipsBySink: Record<string, Clip[] | undefined>;
}) {
  const sinks = p.sinkIds.flatMap((id) => sinkById.get(id) ?? []);
  const video = sinks.filter((s) => s.kind !== "audio").slice(0, 4);
  const posterT = p.start + (p.end - p.start) * 0.4;
  const inRange = sinks.flatMap((s) =>
    clipsInRange(clipsBySink[s.id] ?? [], p.start, p.end),
  );
  const clipCount = inRange.length;
  const culled = clipCount
    ? inRange.filter((c) => p.flags[c.id]).length / clipCount
    : 0;

  return (
    <div className="group relative">
    <Link
      href={`/app/projects/${p.id}`}
      className="flex flex-col h-full rounded-lg bg-panel ring-1 ring-hairline overflow-hidden transition-shadow hover:ring-white/20 hover:shadow-xl hover:shadow-black/40"
    >
      <div
        className={cn(
          "grid gap-px bg-black aspect-video",
          video.length > 1 && "grid-cols-2",
          video.length > 2 && "grid-rows-2",
        )}
      >
        {video.map((s) => {
          const cs = clipsInRange(clipsBySink[s.id] ?? [], p.start, p.end);
          const clip =
            cs.find(
              (c) => posterT >= c.start && posterT < c.start + c.duration,
            ) ??
            nextClip(cs, posterT) ??
            cs[0];
          return clip ? (
            <div key={s.id} className="relative min-h-0">
              <Frame
                sink={s}
                asset={clip.asset}
                t={Math.max(posterT, clip.start)}
                thumb
                className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.03]"
              />
              <span className="absolute bottom-1 left-1 rounded-[3px] bg-black/60 px-1 text-[0.55rem] text-white/80">
                {s.name}
              </span>
            </div>
          ) : (
            <div key={s.id} className="hatch" />
          );
        })}
      </div>
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight truncate">
              {p.name}
            </div>
            <div className="tc text-[0.7rem] text-muted-foreground mt-0.5">
              {fmtWindow(p.start, p.end)}
            </div>
          </div>
          <span className="tc text-[0.65rem] text-muted-foreground whitespace-nowrap">
            {fmtAgo(p.updatedAt)}
          </span>
        </div>
        <Coverage
          sinks={sinks}
          clips={clipsBySink}
          from={p.start}
          to={p.end}
          rowHeight={5}
          label={false}
          showAxis={false}
          className="[&>div>div]:gap-0.75"
        />
        <div className="flex items-center gap-3 text-[0.65rem] text-muted-foreground">
          <div className="flex -space-x-1">
            {sinks.map((s) => (
              <span
                key={s.id}
                title={s.name}
                className="size-3.5 rounded-full ring-2 ring-panel"
                style={{ background: s.color }}
              />
            ))}
          </div>
          <span className="tc">
            {sinks.length} sinks · {clipCount} clips · {fmtDur(p.end - p.start)}
          </span>
          <span className="flex-1" />
          <span className="flex items-center gap-1.5">
            <span className="w-12 h-1 rounded-full bg-white/8 overflow-hidden">
              <span
                className="block h-full bg-pick"
                style={{ width: `${culled * 100}%` }}
              />
            </span>
            <span className="tc">{Math.round(culled * 100)}%</span>
          </span>
        </div>
      </div>
    </Link>
    <DeleteProjectButton project={p} />
    </div>
  );
}

function DeleteProjectButton({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const del = $api.useMutation("delete", "/api/projects/{id}", {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["get", "/api/projects"] });
      setOpen(false);
    },
    onError: () =>
      toast.add({ type: "error", title: "Could not delete project" }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !del.isPending && setOpen(o)}>
      <DialogTrigger
        render={
          <Button
            size="icon-sm"
            variant="secondary"
            title="Delete project"
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"
          />
        }
      >
        <Trash2Icon />
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Delete “{project.name}”?</DialogTitle>
          <DialogDescription>
            Its picks, rejects and markers are removed. The footage stays in
            the library.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose
            render={<Button variant="outline" disabled={del.isPending} />}
          >
            Cancel
          </DialogClose>
          <Button
            variant="destructive"
            disabled={del.isPending}
            onClick={() => del.mutate({ params: { path: { id: project.id } } })}
          >
            {del.isPending && <Spinner data-icon="inline-start" />}
            Delete project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
