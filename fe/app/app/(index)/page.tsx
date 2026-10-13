"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Separator } from "@/components/ui/separator";
import { $api } from "@/lib/api/openapi-clients";
import { PlusIcon } from "lucide-react";
import Link from "next/link";

export default function AppHome() {
  const sinks = $api.useQuery("get", "/api/sinks");

  return (
    <div className="w-full flex-1 flex flex-col">
      <ResizablePanelGroup className="w-full flex-1" orientation="horizontal">
        <ResizablePanel
          minSize={"15%"}
          maxSize={"50%"}
          defaultSize={"15%"}
          className="bg-sidebar"
        >
          <div className="p-4">
            <Button
              variant="secondary"
              size="lg"
              className="font-semibold w-full justify-between"
            >
              Sinks
              <PlusIcon />
            </Button>
          </div>

          <Separator />

          <div className="p-4">
            {sinks?.data?.map((sink) => (
              <Link
                key={sink.id}
                href={`/app/sink/${sink.id}`}
                className={buttonVariants({
                  variant: "ghost",
                  className: "w-full justify-start",
                })}
              >
                {sink.name}
              </Link>
            ))}
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle={true} />
        <ResizablePanel>Two</ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
