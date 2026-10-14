"use client";

import { buttonVariants } from "@/components/ui/button";
import { useClips, useProject, useSinks } from "@/lib/placeholder/hooks";
import Link from "next/link";
import { Editor } from "./editor";

export function EditorRoute({ id }: { id: string }) {
  const project = useProject(id);
  const sinks = useSinks();
  const clips = useClips();

  if (project.isLoading || sinks.isLoading || clips.isLoading) return null;

  if (!project.data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-sm">
        <span className="text-muted-foreground">Project not found.</span>
        <Link
          href="/app/projects"
          className={buttonVariants({ variant: "outline" })}
        >
          Back to projects
        </Link>
      </div>
    );
  }

  return (
    <Editor
      key={project.data.id}
      project={project.data}
      sinks={sinks.data ?? []}
      clips={clips.data ?? []}
    />
  );
}
