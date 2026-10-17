// Display formatting for media times and sizes. All times are rendered in UTC
// so server and client output match.

export const SEC_MS = 1000;
export const MIN_MS = 60 * SEC_MS;
export const HOUR_MS = 60 * MIN_MS;
export const DAY_MS = 24 * HOUR_MS;

/** Stable 32-bit FNV-1a hash, used to derive deterministic visuals from ids. */
export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++)
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const pad = (n: number, w = 2) => String(Math.floor(n)).padStart(w, "0");

export function fmtClock(ms: number, seconds = true) {
  const d = new Date(ms);
  const s = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  return seconds ? `${s}:${pad(d.getUTCSeconds())}` : s;
}

export function fmtTC(ms: number, fps = 25) {
  const d = new Date(ms);
  return `${fmtClock(ms)}:${pad((d.getUTCMilliseconds() / 1000) * fps)}`;
}

export function fmtDur(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${pad(m)}m`;
  return `${m}:${pad(s % 60)}`;
}

export function fmtSize(bytes: number) {
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (bytes >= 1000 && i < u.length - 1) {
    bytes /= 1000;
    i++;
  }
  return `${bytes.toFixed(bytes < 10 && i > 1 ? 1 : 0)} ${u[i]}`;
}

export function fmtDate(ms: number, year = false) {
  return new Date(ms).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: year ? "numeric" : undefined,
    timeZone: "UTC",
  });
}
