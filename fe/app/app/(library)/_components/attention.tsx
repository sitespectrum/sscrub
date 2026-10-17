"use client";

import { Frame } from "@/app/app/_components/frame";
import { Spinner } from "@/components/ui/spinner";
import { $api } from "@/lib/api/openapi-clients";
import { AttentionItem, Sink } from "@/lib/api/sscrub-api-schema";
import { fmtClock, fmtDate, fmtDur, fmtSize } from "@/lib/format";
import { CheckIcon, TriangleAlertIcon } from "lucide-react";
import { useMemo } from "react";
import { DeleteAssetsDialog, Dot } from "./library";

export function Attention() {
  const { data: items, isLoading: itemsLoading } = $api.useQuery(
    "get",
    "/api/assets/attention",
  );
  const { data: sinks, isLoading: sinksLoading } = $api.useQuery(
    "get",
    "/api/sinks",
  );

  const sinksById = useMemo(
    () => new Map(sinks?.map((s) => [s.id, s])),
    [sinks],
  );

  return (
    <main className="relative h-full flex flex-col">
      <div className="px-5 py-4 flex items-center gap-4 border-b border-hairline">
        <span className="size-8 rounded-md bg-amber-500/15 text-amber-400 flex items-center justify-center">
          <TriangleAlertIcon className="size-4" />
        </span>
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-tight">
            Needs attention
          </h1>
          <div className="text-[0.7rem] text-muted-foreground mt-0.5">
            Clips that failed processing. Failed clips are retried when the
            server restarts.
          </div>
        </div>
      </div>

      {itemsLoading || sinksLoading ? (
        <div className="flex-1 w-full flex justify-center items-center">
          <Spinner className="size-12 text-muted" />
        </div>
      ) : items!.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <CheckIcon className="size-6 text-pick" />
          <span className="text-xs">Nothing needs attention</span>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2">
          {items!.map((item) => (
            <AttentionRow
              key={item.asset.id}
              item={item}
              sink={sinksById.get(item.asset.sinkId)!}
            />
          ))}
        </div>
      )}
    </main>
  );
}

function AttentionRow({ item, sink }: { item: AttentionItem; sink: Sink }) {
  const { asset } = item;
  const captured = Date.parse(asset.captureDate ?? asset.uploadDate);

  return (
    <div className="rounded-md ring-1 ring-inset ring-hairline bg-well/40 p-3 flex gap-3">
      <Frame
        sink={sink}
        asset={asset}
        t={captured}
        grain={false}
        thumb
        className="w-32 shrink-0 aspect-video rounded-sm"
      />
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="tc text-xs font-medium truncate">
              {asset.fileName}
            </div>
            <div className="tc text-[0.65rem] text-muted-foreground flex items-center">
              <span
                className="size-2 rounded-xs mr-1.5"
                style={{ background: sink.color }}
              />
              {sink.name} <Dot /> {fmtClock(captured)} <Dot />{" "}
              {fmtDur(asset.durationMillis)} <Dot /> {fmtSize(asset.size)}
              {item.failedAt && (
                <>
                  <Dot /> failed {fmtDate(Date.parse(item.failedAt))}{" "}
                  {fmtClock(Date.parse(item.failedAt))}
                </>
              )}
            </div>
          </div>
          <DeleteAssetsDialog ids={[asset.id]} onDeleted={() => {}} />
        </div>
        <pre className="tc text-[0.65rem] text-reject/90 bg-black/30 rounded-sm px-2 py-1.5 whitespace-pre-wrap wrap-break-word max-h-32 overflow-y-auto">
          {item.error ??
            "No error message available — it was lost when the server restarted."}
        </pre>
      </div>
    </div>
  );
}
