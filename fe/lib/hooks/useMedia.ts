// Data access for the projects and editor views: API queries mapped to the
// view models in `@/lib/media`.

import { $api } from "../api/openapi-clients";
import type {
  Asset,
  ProjectResponse,
  Sink,
} from "../api/sscrub-api-schema";
import {
  type Clip,
  type Project,
  type SinkType,
  type SinkView,
  fromApiFlag,
} from "../media";

const SINK_TYPES: SinkType[] = ["camera", "action", "drone", "phone", "audio"];

export const toSinkView = (s: Sink): SinkView => ({
  ...s,
  kind: SINK_TYPES.includes(s.type as SinkType)
    ? (s.type as SinkType)
    : "unknown",
});

export const toClip = (a: Asset): Clip => ({
  id: a.id,
  sinkId: a.sinkId,
  fileName: a.fileName,
  start: Date.parse(a.captureDate ?? a.uploadDate),
  duration: a.durationMillis,
  size: a.size,
  status: a.status,
  asset: a,
});

export const toProject = (p: ProjectResponse): Project => ({
  id: p.id,
  name: p.name,
  sinkIds: p.sinkIds,
  start: Date.parse(p.start),
  end: Date.parse(p.end),
  updatedAt: Date.parse(p.updatedAt),
  flags: Object.fromEntries(
    p.flags.map((f) => [f.assetId, fromApiFlag(f.flag)]),
  ),
  markers: p.markers.map((m) => ({
    id: m.id,
    t: Date.parse(m.time),
    label: m.label,
    color: m.color,
  })),
});

// Module-level selectors keep `select` referentially stable across renders.
const selectSinks = (s: Sink[]) => s.map(toSinkView);
const selectClips = (a: Asset[]) =>
  a.map(toClip).sort((x, y) => x.start - y.start);
const selectProjects = (p: ProjectResponse[]) => p.map(toProject);

export function useSinks() {
  return $api.useQuery("get", "/api/sinks", {}, { select: selectSinks });
}

/** All clips, ordered by capture time. */
export function useClips() {
  return $api.useQuery("get", "/api/assets", {}, { select: selectClips });
}

export function useProjects() {
  return $api.useQuery("get", "/api/projects", {}, { select: selectProjects });
}

export function useProject(id: string) {
  return $api.useQuery(
    "get",
    "/api/projects/{id}",
    { params: { path: { id } } },
    { select: toProject, retry: false },
  );
}
