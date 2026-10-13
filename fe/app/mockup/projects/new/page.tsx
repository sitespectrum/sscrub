"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  CalendarIcon,
  CheckIcon,
  ChevronRightIcon,
  InfoIcon,
  MagnetIcon,
  SunIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Coverage } from "../../_components/coverage";
import { SinkBadge } from "../../_components/frame";
import { MockHeader } from "../../_components/header";
import { Stat } from "../../_components/ui";
import {
  SINKS,
  at,
  clipsInRange,
  fmtClock,
  fmtDate,
  fmtDur,
  fmtSize,
} from "../../_lib/data";

const DAY_FROM = at(8);
const DAY_TO = at(21);

const toInput = (t: number) => fmtClock(t, false);
const fromInput = (v: string) => {
  const [h, m] = v.split(":").map(Number);
  return at(h || 0, m || 0);
};

export default function NewProjectMockup() {
  const router = useRouter();
  const [name, setName] = useState("Riverside — Ceremony");
  const [selected, setSelected] = useState(
    new Set(["a-cam", "b-cam", "drone", "audio"]),
  );
  const [range, setRange] = useState({ start: at(13, 30), end: at(16, 30) });

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const included = useMemo(
    () =>
      [...selected].flatMap((id) => clipsInRange(id, range.start, range.end)),
    [selected, range],
  );
  const dimmed = useMemo(
    () => new Set(SINKS.filter((s) => !selected.has(s.id)).map((s) => s.id)),
    [selected],
  );

  const snapToFootage = () => {
    const cs = [...selected].flatMap((id) =>
      clipsInRange(id, DAY_FROM, DAY_TO),
    );
    if (!cs.length) return;
    setRange({
      start: Math.min(...cs.map((c) => c.start)),
      end: Math.max(...cs.map((c) => c.start + c.duration)),
    });
  };

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      <MockHeader active="projects" />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
            <Link href="/mockup/projects" className="hover:text-foreground">
              Projects
            </Link>
            <ChevronRightIcon className="size-3" />
            <span className="text-foreground">New</span>
          </nav>
          <h1 className="text-xl font-semibold tracking-tight mb-6">
            New project
          </h1>

          <div className="grid gap-5 lg:grid-cols-[1fr_300px] items-start">
            <div className="rounded-lg bg-(--nle-panel) ring-1 ring-(--nle-hairline) divide-y divide-(--nle-hairline)">
              <Section title="Details">
                <div className="grid sm:grid-cols-[1fr_auto] gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Shoot date</Label>
                    <Button
                      variant="outline"
                      className="h-7 justify-start w-44"
                    >
                      <CalendarIcon data-icon="inline-start" />{" "}
                      {fmtDate(range.start)}
                    </Button>
                  </div>
                </div>
              </Section>

              <Section
                title="Sinks & time window"
                description="Choose the devices that were recording, then drag across the chart to set when it took place."
              >
                <div className="flex flex-wrap items-end gap-2 mb-8">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="from">From</Label>
                    <Input
                      id="from"
                      type="time"
                      className="w-28 tc"
                      value={toInput(range.start)}
                      onChange={(e) =>
                        setRange((r) => ({
                          ...r,
                          start: fromInput(e.target.value),
                        }))
                      }
                    />
                  </div>
                  <span className="pb-1.5 text-muted-foreground">–</span>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="to">To</Label>
                    <Input
                      id="to"
                      type="time"
                      className="w-28 tc"
                      value={toInput(range.end)}
                      onChange={(e) =>
                        setRange((r) => ({
                          ...r,
                          end: fromInput(e.target.value),
                        }))
                      }
                    />
                  </div>
                  <span className="pb-1.5 pl-2 tc text-xs text-muted-foreground">
                    {fmtDur(range.end - range.start)}
                  </span>
                  <div className="flex-1" />
                  <Button variant="ghost" onClick={snapToFootage}>
                    <MagnetIcon data-icon="inline-start" /> Snap to footage
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setRange({ start: DAY_FROM, end: DAY_TO })}
                  >
                    <SunIcon data-icon="inline-start" /> Whole day
                  </Button>
                </div>

                <div className="rounded-md bg-(--nle-well) ring-1 ring-inset ring-(--nle-hairline) px-3 pt-8 pb-3">
                  <Coverage
                    sinks={SINKS}
                    dimmed={dimmed}
                    from={DAY_FROM}
                    to={DAY_TO}
                    rowHeight={30}
                    labelWidth={190}
                    brush={{
                      ...range,
                      onChange: (start, end) => setRange({ start, end }),
                    }}
                    label={(s) => {
                      const on = selected.has(s.id);
                      const n = clipsInRange(
                        s.id,
                        range.start,
                        range.end,
                      ).length;
                      return (
                        <button
                          onClick={() => toggle(s.id)}
                          className={cn(
                            "w-full h-full flex items-center gap-2.5 rounded-md px-1.5 text-left transition-colors hover:bg-white/[0.04]",
                            !on && "opacity-50 hover:opacity-80",
                          )}
                        >
                          <span
                            className={cn(
                              "size-3.5 rounded-[4px] ring-1 ring-inset flex items-center justify-center shrink-0 transition-colors",
                              on
                                ? "bg-primary ring-primary text-primary-foreground"
                                : "ring-white/25",
                            )}
                          >
                            {on && (
                              <CheckIcon className="size-2.5" strokeWidth={3} />
                            )}
                          </span>
                          <SinkBadge sink={s} size="sm" />
                          <span className="flex-1 min-w-0">
                            <span className="block text-xs font-medium truncate">
                              {s.name}
                            </span>
                          </span>
                          <span className="tc text-[0.65rem] text-muted-foreground">
                            {n}
                          </span>
                        </button>
                      );
                    }}
                  />
                </div>
                <p className="mt-3 flex items-center gap-1.5 text-[0.65rem] text-muted-foreground">
                  <InfoIcon className="size-3" /> Handles snap to 5 minutes.
                  Footage that only partly overlaps the window is included in
                  full.
                </p>
              </Section>
            </div>

            <aside className="lg:sticky lg:top-0 rounded-lg bg-(--nle-panel) ring-1 ring-(--nle-hairline) overflow-hidden">
              <div className="p-4 border-b border-(--nle-hairline)">
                <div className="eyebrow mb-2">Summary</div>
                <div className="text-sm font-semibold tracking-tight truncate">
                  {name || "Untitled project"}
                </div>
                <div className="tc text-[0.7rem] text-muted-foreground mt-0.5">
                  {fmtDate(range.start)} · {fmtClock(range.start, false)}–
                  {fmtClock(range.end, false)}
                </div>
              </div>
              <div className="p-4 flex flex-col gap-2">
                <Stat label="Window" value={fmtDur(range.end - range.start)} />
                <Stat label="Tracks" value={selected.size} />
                <Stat label="Clips" value={included.length} />
                <Stat
                  label="Footage"
                  value={fmtDur(included.reduce((a, c) => a + c.duration, 0))}
                />
                <Stat
                  label="On disk"
                  value={fmtSize(included.reduce((a, c) => a + c.size, 0))}
                />
              </div>
              <div className="px-4 pb-4 flex flex-col gap-1">
                {SINKS.filter((s) => selected.has(s.id)).map((s, i) => (
                  <div key={s.id} className="flex items-center gap-2 text-xs">
                    <span className="tc w-6 text-[0.6rem] text-muted-foreground">
                      {s.kind === "audio" ? "A" : "V"}
                      {i + 1}
                    </span>
                    <span
                      className="size-2 rounded-[2px]"
                      style={{ background: s.color }}
                    />
                    <span className="flex-1 truncate">{s.name}</span>
                    <span className="tc text-[0.65rem] text-muted-foreground">
                      {clipsInRange(s.id, range.start, range.end).length}
                    </span>
                  </div>
                ))}
              </div>
              {included.some((c) => c.status !== "Ready") && (
                <div className="mx-4 mb-4 rounded-md bg-amber-500/10 ring-1 ring-inset ring-amber-500/20 px-2.5 py-2 text-[0.65rem] text-amber-300">
                  Some footage is still processing and will appear once ready.
                </div>
              )}
              <div className="p-4 pt-0 flex flex-col gap-2">
                <Button
                  size="lg"
                  className="w-full"
                  disabled={!selected.size}
                  onClick={() => router.push("/mockup/projects/ceremony")}
                >
                  Create & open editor
                </Button>
                <Link
                  href="/mockup/projects"
                  className={buttonVariants({
                    variant: "ghost",
                    className: "w-full",
                  })}
                >
                  Cancel
                </Link>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}
