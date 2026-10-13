"use client";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { Coverage } from "../_components/coverage";
import { Frame } from "../_components/frame";
import { MockHeader } from "../_components/header";
import {
  type Project,
  PROJECTS,
  clipsInRange,
  fmtClock,
  fmtDate,
  fmtDur,
  hash,
  nextClip,
  sinkById,
} from "../_lib/data";

export default function ProjectsMockup() {
  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      <MockHeader active="projects" />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex items-end justify-between mb-6">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
              <p className="text-xs text-muted-foreground mt-1">
                Each project is a set of sinks over a window of time, laid out
                as a multicam timeline.
              </p>
            </div>
            <Link
              href="/mockup/projects/new"
              className={buttonVariants({ size: "lg" })}
            >
              <PlusIcon data-icon="inline-start" /> New project
            </Link>
          </div>

          <div className="grid gap-5 grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
            {PROJECTS.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
            <Link
              href="/mockup/projects/new"
              className="rounded-lg border border-dashed border-white/10 flex flex-col items-center justify-center gap-3 text-xs text-muted-foreground transition-colors hover:text-foreground hover:border-primary/60 hover:bg-primary/[0.04] min-h-72"
            >
              <span className="size-9 rounded-full bg-white/[0.05] flex items-center justify-center">
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

function ProjectCard({ project: p }: { project: Project }) {
  const sinks = p.sinkIds.map(sinkById);
  const video = sinks.filter((s) => s.kind !== "audio").slice(0, 4);
  const posterT = p.start + (p.end - p.start) * 0.4;
  const clipCount = sinks.reduce(
    (a, s) => a + clipsInRange(s.id, p.start, p.end).length,
    0,
  );
  const culled = 0.2 + (hash(p.id) % 60) / 100;

  return (
    <Link
      href={`/mockup/projects/${p.id}`}
      className="group flex flex-col rounded-lg bg-(--nle-panel) ring-1 ring-(--nle-hairline) overflow-hidden transition-shadow hover:ring-white/20 hover:shadow-xl hover:shadow-black/40"
    >
      <div
        className={cn(
          "grid gap-px bg-black aspect-video",
          video.length > 1 && "grid-cols-2",
          video.length > 2 && "grid-rows-2",
        )}
      >
        {video.map((s) => {
          const cs = clipsInRange(s.id, p.start, p.end);
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
                clip={clip}
                t={Math.max(posterT, clip.start)}
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
              {fmtDate(p.start)} · {fmtClock(p.start, false)}–
              {fmtClock(p.end, false)}
            </div>
          </div>
          <span className="tc text-[0.65rem] text-muted-foreground whitespace-nowrap">
            {p.updated}
          </span>
        </div>
        <Coverage
          sinks={sinks}
          from={p.start}
          to={p.end}
          rowHeight={5}
          label={false}
          showAxis={false}
          className="[&>div>div]:gap-[3px]"
        />
        <div className="flex items-center gap-3 text-[0.65rem] text-muted-foreground">
          <div className="flex -space-x-1">
            {sinks.map((s) => (
              <span
                key={s.id}
                title={s.name}
                className="size-3.5 rounded-full ring-2 ring-(--nle-panel)"
                style={{ background: s.color }}
              />
            ))}
          </div>
          <span className="tc">
            {sinks.length} sinks · {clipCount} clips · {fmtDur(p.end - p.start)}
          </span>
          <span className="flex-1" />
          <span className="flex items-center gap-1.5">
            <span className="w-12 h-1 rounded-full bg-white/[0.08] overflow-hidden">
              <span
                className="block h-full bg-(--nle-pick)"
                style={{ width: `${culled * 100}%` }}
              />
            </span>
            <span className="tc">{Math.round(culled * 100)}%</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
