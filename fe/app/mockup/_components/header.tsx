"use client";

import { cn } from "@/lib/utils";
import { BellIcon, SearchIcon, UploadCloudIcon } from "lucide-react";
import Link from "next/link";
import { Kbd } from "./ui";

const NAV = [
  { href: "/mockup", label: "Library", key: "library" },
  { href: "/mockup/projects", label: "Projects", key: "projects" },
] as const;

export function MockHeader({
  active,
  actions,
  children,
}: {
  active?: (typeof NAV)[number]["key"];
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="h-11 shrink-0 pl-3 pr-2 flex items-center gap-3 bg-(--nle-app) border-b border-(--nle-hairline)">
      <Link href="/mockup" className="flex items-center gap-2 pr-1">
        <img src="/brand/sscrub-mark.svg" alt="" className="h-5" />
        <span className="font-semibold text-sm tracking-tight">
          <span className="text-chart-2">ss</span>crub
        </span>
      </Link>
      <span className="h-4 w-px bg-(--nle-hairline)" />
      {children ?? (
        <nav className="flex items-center gap-0.5">
          {NAV.map((n) => (
            <Link
              key={n.key}
              href={n.href}
              className={cn(
                "px-2.5 h-7 inline-flex items-center rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
                active === n.key && "bg-white/[0.06] text-foreground",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      )}
      <div className="flex-1" />
      {actions}
      <button className="group hidden md:flex h-7 w-60 items-center gap-2 rounded-md bg-white/[0.04] px-2 text-xs text-muted-foreground ring-1 ring-inset ring-(--nle-hairline) hover:bg-white/[0.06]">
        <SearchIcon className="size-3.5" />
        <span className="flex-1 text-left">
          Search footage, sinks, projects
        </span>
        <Kbd>⌘K</Kbd>
      </button>
      <button
        title="Uploads"
        className="relative size-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
      >
        <UploadCloudIcon className="size-4" />
        <span className="absolute top-1 right-1 size-1.5 rounded-full bg-(--nle-playhead)" />
      </button>
      <button
        title="Notifications"
        className="size-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
      >
        <BellIcon className="size-4" />
      </button>
      <div className="ml-1 size-6 rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 text-[0.6rem] font-semibold flex items-center justify-center text-white ring-2 ring-(--nle-app)">
        DS
      </div>
    </header>
  );
}
