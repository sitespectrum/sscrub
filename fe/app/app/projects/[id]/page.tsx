import { Suspense } from "react";
import { EditorRoute } from "./_components/editor-route";

export default function ProjectEditorPage({
  params,
}: PageProps<"/app/projects/[id]">) {
  return (
    <Suspense>
      {params.then(({ id }) => (
        <EditorRoute id={id} />
      ))}
    </Suspense>
  );
}
