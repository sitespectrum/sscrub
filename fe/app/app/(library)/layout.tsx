import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Suspense } from "react";
import { AppHeader } from "../_components/header";
import { Gutter } from "../_components/panel";
import { Sidebar, SidebarSkeleton } from "./_components/sidebar";

export default function LibraryLayout({ children }: LayoutProps<"/app">) {
  return (
    <>
      <AppHeader active="library" />
      <ResizablePanelGroup
        orientation="horizontal"
        className="flex-1 min-h-0 p-1"
      >
        <ResizablePanel defaultSize="17%" minSize="13%" maxSize="28%">
          <Suspense fallback={<SidebarSkeleton />}>
            <Sidebar />
          </Suspense>
        </ResizablePanel>
        <Gutter group="horizontal" />
        <ResizablePanel minSize="50%">
          <div className="h-full rounded-md border border-hairline bg-panel overflow-hidden">
            {children}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </>
  );
}
