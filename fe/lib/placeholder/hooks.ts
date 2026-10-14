// Data access for the app UI. Every page reads through these hooks, so wiring
// the real backend means replacing the bodies here (return shape mirrors
// react-query's `{ data, isLoading }`) and mapping API types to the view
// models in `@/lib/media`.

import type { Clip, Project, SinkView } from "../media";
import { CLIPS, PROJECTS, SINKS } from "./data";

type Query<T> = { data: T | undefined; isLoading: boolean };
const ok = <T>(data: T): Query<T> => ({ data, isLoading: false });

const clipsBySink = Object.groupBy(CLIPS, (c) => c.sinkId);

// TODO(data): $api.useQuery("get", "/api/sinks")
export function useSinks(): Query<SinkView[]> {
  return ok(SINKS);
}

// TODO(data): $api.useQuery("get", "/api/sinks/{id}", { params: { path: { id } } })
export function useSink(id: string | null): Query<SinkView | undefined> {
  return ok(id ? SINKS.find((s) => s.id === id) : undefined);
}

/** All clips, or one sink's clips, ordered by capture time. */
// TODO(data): $api.useQuery("get", "/api/assets", { params: { query: { sinkId } } })
export function useClips(sinkId?: string | null): Query<Clip[]> {
  return ok(sinkId ? (clipsBySink[sinkId] ?? []) : CLIPS);
}

// TODO(data): no projects endpoint yet
export function useProjects(): Query<Project[]> {
  return ok(PROJECTS);
}

// TODO(data): no projects endpoint yet
export function useProject(id: string): Query<Project | undefined> {
  return ok(PROJECTS.find((p) => p.id === id));
}
