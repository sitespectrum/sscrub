"use client";

import { cn } from "@/lib/utils";

/** Docked panel with a tabbed title bar, NLE style. */
export function Panel<T extends string>({
  tabs,
  active,
  onTab,
  actions,
  className,
  bodyClassName,
  children,
}: {
  tabs: { value: T; label: React.ReactNode }[];
  active?: T;
  onTab?: (v: T) => void;
  actions?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  const current = active ?? tabs[0]?.value;
  return (
    <section
      className={cn(
        "h-full flex flex-col rounded-md border border-(--nle-hairline) bg-(--nle-panel) overflow-hidden",
        className,
      )}
    >
      <header className="h-8 shrink-0 flex items-stretch gap-1 pl-1 pr-1.5 border-b border-(--nle-hairline)">
        <div className="flex items-stretch">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => onTab?.(tab.value)}
              className={cn(
                "relative px-2.5 text-[0.7rem] font-medium text-muted-foreground hover:text-foreground transition-colors",
                current === tab.value && "text-foreground",
              )}
            >
              {tab.label}
              {current === tab.value && (
                <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-primary" />
              )}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1">{actions}</div>
      </header>
      <div className={cn("flex-1 min-h-0 flex flex-col", bodyClassName)}>
        {children}
      </div>
    </section>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: {
    value: T;
    label?: React.ReactNode;
    icon?: React.ReactNode;
    title?: string;
  }[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-px rounded-md bg-(--nle-well) p-0.5 ring-1 ring-inset ring-(--nle-hairline)",
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-6 inline-flex items-center gap-1.5 rounded-[5px] px-2 text-[0.7rem] font-medium text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-3.5",
            !o.label && "w-6 justify-center px-0",
            value === o.value &&
              "bg-(--nle-raised) text-foreground shadow-[0_1px_0_0_oklch(1_0_0/0.06)_inset,0_1px_2px_oklch(0_0_0/0.4)]",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Kbd({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        "tc inline-flex h-4 min-w-4 items-center justify-center rounded-[4px] border border-(--nle-hairline) bg-white/[0.04] px-1 text-[0.6rem] font-medium text-muted-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/** Tiny square toggle used in track headers (Premiere's eye / lock / solo). */
export function TrackToggle({
  on,
  onClick,
  title,
  activeClass = "bg-primary/25 text-primary",
  children,
}: {
  on?: boolean;
  onClick?: () => void;
  title: string;
  activeClass?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        "size-5 rounded-[4px] inline-flex items-center justify-center text-muted-foreground/70 hover:text-foreground hover:bg-white/[0.06] [&_svg]:size-3",
        on && activeClass,
      )}
    >
      {children}
    </button>
  );
}

export function Stat({
  label,
  value,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 text-xs",
        className,
      )}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="tc text-foreground/90 truncate">{value}</span>
    </div>
  );
}
