"use client";

import { Coverage } from "@/app/app/_components/coverage";
import { SinkBadge } from "@/app/app/_components/frame";
import { AppHeader } from "@/app/app/_components/header";
import { Stat } from "@/app/app/_components/panel";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { $api } from "@/lib/api/openapi-clients";
import {
  DAY_MS,
  HOUR_MS,
  MIN_MS,
  fmtClock,
  fmtDate,
  fmtDur,
  fmtSize,
} from "@/lib/format";
import { clipsInRange, groupBySink, hourBounds } from "@/lib/media";
import { useClips, useSinks } from "@/lib/hooks/useMedia";
import { cn } from "@/lib/utils";
import {
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  InfoIcon,
  MagnetIcon,
  SunIcon,
} from "lucide-react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const toInput = (t: number) => fmtClock(t, false);

export default function NewProjectPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: sinks } = useSinks();
  const { data: clips } = useClips();

  // UTC days that have footage, newest first, with their clip counts.
  const days = useMemo(() => {
    const counts = new Map<number, number>();
    for (const c of clips ?? []) {
      const d = Math.floor(c.start / DAY_MS) * DAY_MS;
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    return [...counts].sort((x, y) => y[0] - x[0]);
  }, [clips]);

  // Defaults (latest day, every sink, the whole day) apply until the user
  // picks something, since the data loads after the first render.
  const [dayPick, setDayPick] = useState<number | null>(null);
  const midnight =
    dayPick ?? days[0]?.[0] ?? hourBounds([])[0];
  const dayClips = useMemo(
    () => clipsInRange(clips ?? [], midnight, midnight + DAY_MS),
    [clips, midnight],
  );
  const clipsBySink = useMemo(() => groupBySink(dayClips), [dayClips]);

  // Chart spans the hours that have footage on the shoot day.
  const [DAY_FROM, DAY_TO] = useMemo(() => hourBounds(dayClips), [dayClips]);
  const fromInput = (v: string) => {
    const [h, m] = v.split(":").map(Number);
    return midnight + (h || 0) * HOUR_MS + (m || 0) * MIN_MS;
  };

  const [name, setName] = useState("");
  const [selectedPick, setSelected] = useState<Set<string> | null>(null);
  const selected = useMemo(
    () => selectedPick ?? new Set(sinks?.map((s) => s.id)),
    [selectedPick, sinks],
  );
  const [rangePick, setRangePick] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const range = useMemo(
    () => rangePick ?? { start: DAY_FROM, end: DAY_TO },
    [rangePick, DAY_FROM, DAY_TO],
  );
  const setRange = (
    r:
      | { start: number; end: number }
      | ((r: { start: number; end: number }) => { start: number; end: number }),
  ) => setRangePick(typeof r === "function" ? r(range) : r);
  const pickDay = (d: number) => {
    setDayPick(d);
    setRangePick(null);
  };

  const create = $api.useMutation("post", "/api/projects", {
    onSuccess: (p) => {
      queryClient.invalidateQueries({ queryKey: ["get", "/api/projects"] });
      router.push(`/app/projects/${p.id}`);
    },
    onError: (e) =>
      toast.add({
        type: "error",
        title: "Could not create project",
        description: e?.error,
      }),
  });
  const submit = () =>
    create.mutate({
      body: {
        name: name.trim() || "Untitled project",
        start: new Date(range.start).toISOString(),
        end: new Date(range.end).toISOString(),
        // keep the chart's order, which becomes the track order
        sinkIds: (sinks ?? []).filter((s) => selected.has(s.id)).map((s) => s.id),
      },
    });

  const toggle = (id: string) =>
    setSelected(() => {
      const n = new Set(selected);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const included = useMemo(
    () =>
      [...selected].flatMap((id) =>
        clipsInRange(clipsBySink[id] ?? [], range.start, range.end),
      ),
    [selected, range, clipsBySink],
  );
  const dimmed = useMemo(
    () => new Set(sinks?.filter((s) => !selected.has(s.id)).map((s) => s.id)),
    [selected, sinks],
  );

  const snapToFootage = () => {
    const cs = [...selected].flatMap((id) =>
      clipsInRange(clipsBySink[id] ?? [], DAY_FROM, DAY_TO),
    );
    if (!cs.length) return;
    setRange({
      start: Math.min(...cs.map((c) => c.start)),
      end: Math.max(...cs.map((c) => c.start + c.duration)),
    });
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <AppHeader active="projects" />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
            <Link href="/app/projects" className="hover:text-foreground">
              Projects
            </Link>
            <ChevronRightIcon className="size-3" />
            <span className="text-foreground">New</span>
          </nav>
          <h1 className="text-xl font-semibold tracking-tight mb-6">
            New project
          </h1>

          <div className="grid gap-5 lg:grid-cols-[1fr_300px] items-start">
            <div className="rounded-lg bg-panel ring-1 ring-hairline divide-y divide-hairline">
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
<DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="outline"
                            className="h-7 justify-start w-44"
                            disabled={!days.length}
                          />
                        }
                      >
                        <CalendarIcon data-icon="inline-start" />
                        <span className="flex-1 text-left">
                          {fmtDate(midnight, true)}
                        </span>
                        <ChevronDownIcon
                          data-icon="inline-end"
                          className="opacity-60"
                        />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-52 max-h-80">
                        <DropdownMenuGroup>
                          <DropdownMenuLabel>Days with footage</DropdownMenuLabel>
                          <DropdownMenuRadioGroup
                            value={midnight}
                            onValueChange={(v) => pickDay(v as number)}
                          >
                            {days.map(([d, n]) => (
                              <DropdownMenuRadioItem key={d} value={d} closeOnClick>
                                <span className="flex-1">
                                  {fmtDate(d, true)}
                                </span>
                                <span className="tc text-[0.65rem] text-muted-foreground">
                                  {n}
                                </span>
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
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

                <div className="rounded-md bg-well ring-1 ring-inset ring-hairline px-3 pt-8 pb-3">
                  <Coverage
                    sinks={sinks ?? []}
                    clips={clipsBySink}
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
                        clipsBySink[s.id] ?? [],
                        range.start,
                        range.end,
                      ).length;
                      return (
                        <button
                          onClick={() => toggle(s.id)}
                          className={cn(
                            "w-full h-full flex items-center gap-2.5 rounded-md px-1.5 text-left transition-colors hover:bg-white/4",
                            !on && "opacity-50 hover:opacity-80",
                          )}
                        >
                          <span
                            className={cn(
                              "size-3.5 rounded-lg ring-1 ring-inset flex items-center justify-center shrink-0 transition-colors",
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

            <aside className="lg:sticky lg:top-0 rounded-lg bg-panel ring-1 ring-hairline overflow-hidden">
              <div className="p-4 border-b border-hairline">
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
                {sinks
                  ?.filter((s) => selected.has(s.id))
                  .map((s, i) => (
                    <div key={s.id} className="flex items-center gap-2 text-xs">
                      <span className="tc w-6 text-[0.6rem] text-muted-foreground">
                        {s.kind === "audio" ? "A" : "V"}
                        {i + 1}
                      </span>
                      <span
                        className="size-2 rounded-xs"
                        style={{ background: s.color }}
                      />
                      <span className="flex-1 truncate">{s.name}</span>
                      <span className="tc text-[0.65rem] text-muted-foreground">
                        {
                          clipsInRange(
                            clipsBySink[s.id] ?? [],
                            range.start,
                            range.end,
                          ).length
                        }
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
                  disabled={
                    !selected.size || range.end <= range.start || create.isPending
                  }
                  onClick={submit}
                >
                  {create.isPending && <Spinner data-icon="inline-start" />}
                  Create & open editor
                </Button>
                <Link
                  href="/app/projects"
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
