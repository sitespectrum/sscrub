import { Suspense } from "react";
import { Library } from "../../_components/library";

export default function SinkPage({ params }: PageProps<"/app/sink/[id]">) {
  return (
    <Suspense>
      {params.then(({ id }) => (
        <Library sinkId={id} />
      ))}
    </Suspense>
  );
}
