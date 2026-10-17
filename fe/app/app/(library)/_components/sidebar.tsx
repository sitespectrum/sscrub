"use client";

import { SinkBadge } from "@/app/app/_components/frame";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { $api } from "@/lib/api/openapi-clients";
import { fmtSize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FilmIcon, PlusIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { SinkDialog } from "./sink-dialog";
import { UploadTray } from "./upload-tray";

const STORAGE_QUOTA = 5e10;

export function Sidebar() {
  const { id: activeId } = useParams<{ id?: string }>();
  const pathname = usePathname();
  const { data: sinks, isLoading: sinksLoading } = $api.useQuery(
    "get",
    "/api/sinks",
  );
  const { data: libraryStats, isLoading: libraryStatsLoading } = $api.useQuery(
    "get",
    "/api/stats/library",
  );

  const { data: attention, isLoading: attentionLoading } = $api.useQuery(
    "get",
    "/api/assets/attention",
    undefined,
    { refetchInterval: 15_000 },
  );

  return (
    <aside className="h-full flex flex-col rounded-md border border-hairline bg-panel overflow-hidden">
      <div className="p-2 flex flex-col gap-px">
        <NavItem
          href="/app"
          active={pathname === "/app"}
          icon={<FilmIcon />}
          label="All footage"
          meta={libraryStats?.overall?.count}
          loading={libraryStatsLoading}
        />
        {/* <NavItem
          icon={<ClockIcon />}
          label="Recently added"
          meta={0}
          loading={libraryStatsLoading}
        /> */}
        <NavItem
          href="/app/attention"
          active={pathname === "/app/attention"}
          icon={<TriangleAlertIcon />}
          label="Needs attention"
          meta={attention?.length}
          tone={attention?.length ? "warn" : undefined}
          loading={attentionLoading}
        />
      </div>

      <div className="px-4 pt-3 pb-1.5 flex items-center justify-between">
        <span className="eyebrow">Sinks</span>
        <SinkDialog
          trigger={
            <Button size="icon-xs" variant="ghost" title="New sink">
              <PlusIcon />
            </Button>
          }
        />
      </div>

      <div className="px-2 flex flex-col gap-px overflow-y-auto">
        {sinksLoading && (
          <>
            {[1, 2, 3, 4].map((i) => {
              return (
                <div
                  key={i}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/4",
                  )}
                >
                  <SinkBadge loading={true} />
                  <span className="flex-1 min-w-0">
                    <Skeleton className="h-2 w-2/3" />
                    <Skeleton className="h-2 w-1/3 mt-2" />
                  </span>
                  <Skeleton className="w-6 h-3" />
                </div>
              );
            })}
          </>
        )}

        {!sinksLoading && (
          <>
            {sinks!.map((sink) => {
              return (
                <Link
                  key={sink.id}
                  href={`/app/sink/${sink.id}`}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/4",
                    activeId === sink.id &&
                      "bg-white/[0.07] hover:bg-white/[0.07]",
                  )}
                >
                  <SinkBadge sink={sink} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-medium truncate">
                      {sink.name}
                    </span>
                    <span className="block text-[0.65rem] text-muted-foreground truncate">
                      {sink.model}
                    </span>
                  </span>
                  {libraryStatsLoading ? (
                    <Skeleton className="size-4" />
                  ) : (
                    <span className="tc text-[0.65rem] text-muted-foreground">
                      {libraryStats!.bySink.find((x) => x.sinkId == sink.id)
                        ?.count ?? 0}
                    </span>
                  )}
                </Link>
              );
            })}
          </>
        )}
      </div>
      <div className="flex-1" />

      <UploadTray />

      <div className="m-2 mt-0 rounded-md bg-well p-3 ring-1 ring-inset ring-hairline">
        <div className="flex justify-between text-[0.65rem] mb-2">
          <span className="font-medium">Storage</span>
          {libraryStatsLoading ? (
            <Skeleton className="h-3 w-1/3" />
          ) : (
            <span className="tc text-muted-foreground">
              {fmtSize(libraryStats?.overall?.size ?? 0)} of{" "}
              {fmtSize(STORAGE_QUOTA)}
            </span>
          )}
        </div>
        <div className="flex h-1 rounded-full overflow-hidden bg-white/6 gap-px">
          {sinks?.map((s) => (
            <div
              key={s.id}
              style={{
                width: `${((libraryStats?.bySink?.find((x) => x.sinkId == s.id)?.size || 0) / STORAGE_QUOTA) * 100}%`,
                background: s.color,
              }}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}

export function SidebarSkeleton() {
  return (
    <aside className="h-full rounded-md border border-hairline bg-panel" />
  );
}

function NavItem({
  href,
  active,
  icon,
  label,
  meta,
  tone,
  loading = false,
}: {
  href?: string;
  active?: boolean;
  icon: React.ReactNode;
  label: string;
  meta?: React.ReactNode;
  tone?: "warn";
  loading?: boolean;
}) {
  return (
    <Link
      href={href ?? "#"}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2 h-7 text-xs text-muted-foreground transition-colors hover:bg-white/4 hover:text-foreground [&_svg]:size-3.5",
        active && "bg-white/[0.07] text-foreground",
      )}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {loading ? (
        <Skeleton className="h-3 w-6" />
      ) : (
        <span
          className={cn(
            "tc text-[0.65rem] bg-raised px-1.5 rounded-full",
            tone === "warn" &&
              "rounded-full bg-amber-500/15 px-1.5 text-amber-400",
          )}
        >
          {meta}
        </span>
      )}
    </Link>
  );
}
