"use client";

import { ResizableHandle } from "@/components/ui/resizable";

/** Transparent resize handle that leaves a gap between floating panels. */
export function Gutter({ group }: { group: "horizontal" | "vertical" }) {
  return (
    <ResizableHandle
      className={
        group === "horizontal"
          ? "w-1! bg-transparent! hover:bg-primary/40! transition-colors rounded-full"
          : "h-1! bg-transparent! hover:bg-primary/40! transition-colors rounded-full"
      }
    />
  );
}
