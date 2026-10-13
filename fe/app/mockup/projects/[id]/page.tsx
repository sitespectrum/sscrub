import { PROJECTS } from "../../_lib/data";
import { Editor } from "./editor";

export function generateStaticParams() {
  return PROJECTS.map((p) => ({ id: p.id }));
}

export default async function EditorMockupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Editor projectId={id} />;
}
