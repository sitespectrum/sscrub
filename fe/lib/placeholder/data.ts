// Placeholder data so the UI renders before it is wired to the API.
// Deterministic (seeded RNG, fixed UTC day) so server and client renders match.
// Only consumed through ./hooks.ts.

import { hash } from "../format";
import type {
  AssetStatus,
  Clip,
  Project,
  SinkView as Sink,
  SinkType,
} from "../media";

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;

export const DAY = Date.UTC(2026, 9, 11);
export const at = (h: number, m = 0, s = 0) =>
  DAY + h * HOUR + m * MIN + s * SEC;

export const SINKS: Sink[] = [
  {
    id: "a-cam",
    name: "A-Cam",
    model: "Sony FX3",
    kind: "camera",
    color: "#8b5cf6",
    hue: 265,
  },
  {
    id: "b-cam",
    name: "B-Cam",
    model: "Sony A7S III",
    kind: "camera",
    color: "#06b6d4",
    hue: 195,
  },
  {
    id: "helmet",
    name: "Helmet Cam",
    model: "GoPro HERO12",
    kind: "action",
    color: "#f59e0b",
    hue: 35,
  },
  {
    id: "drone",
    name: "Drone",
    model: "DJI Mini 4 Pro",
    kind: "drone",
    color: "#10b981",
    hue: 150,
  },
  {
    id: "phone",
    name: "Phone",
    model: "iPhone 16 Pro",
    kind: "phone",
    color: "#f43f5e",
    hue: 345,
  },
  {
    id: "audio",
    name: "Field Audio",
    model: "Zoom H6",
    kind: "audio",
    color: "#3b82f6",
    hue: 220,
  },
];

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KIND_PARAMS: Record<
  SinkType,
  {
    clip: [number, number];
    gap: [number, number];
    bitrate: number;
    codec: string;
    res: string;
    name: (n: number) => string;
  }
> = {
  camera: {
    clip: [15, 420],
    gap: [20, 600],
    bitrate: 18e6,
    codec: "XAVC S-I 4:2:2",
    res: "3840×2160 · 25p",
    name: (n) => `C${String(n).padStart(4, "0")}.MP4`,
  },
  action: {
    clip: [600, 2700],
    gap: [900, 3600],
    bitrate: 15e6,
    codec: "HEVC",
    res: "5312×2988 · 30p",
    name: (n) => `GX01${String(n).padStart(4, "0")}.MP4`,
  },
  drone: {
    clip: [180, 900],
    gap: [1500, 4200],
    bitrate: 19e6,
    codec: "H.265 D-Log M",
    res: "3840×2160 · 30p",
    name: (n) => `DJI_${String(n).padStart(4, "0")}.MP4`,
  },
  phone: {
    clip: [5, 90],
    gap: [300, 2400],
    bitrate: 6e6,
    codec: "HEVC · HDR",
    res: "3840×2160 · 30p",
    name: (n) => `IMG_${4500 + n}.MOV`,
  },
  audio: {
    clip: [1500, 5400],
    gap: [60, 900],
    bitrate: 288e3,
    codec: "WAV 24-bit 48 kHz",
    res: "4 ch",
    name: (n) => `ZOOM${String(n).padStart(4, "0")}.WAV`,
  },
  unknown: {
    clip: [1, 2],
    gap: [3, 4],
    bitrate: 6e6,
    codec: "",
    res: "0x0",
    name: (n) => "xxx",
  },
};

function generateClips(sink: Sink): Clip[] {
  const rng = mulberry32(hash(sink.id));
  const p = KIND_PARAMS[sink.kind];
  const rand = ([a, b]: [number, number]) => (a + rng() * (b - a)) * SEC;
  const out: Clip[] = [];
  let t = at(9, 30) + rng() * 25 * MIN;
  let n = 1 + Math.floor(rng() * 300);

  const push = (start: number, duration: number) => {
    out.push({
      id: `${sink.id}-${n}`,
      sinkId: sink.id,
      fileName: p.name(n),
      start: Math.round(start),
      duration: Math.round(duration),
      size: Math.round((duration / SEC) * (p.bitrate / 8)),
      status: "Ready",
      codec: p.codec,
      resolution: p.res,
    });
    n++;
  };

  while (t < at(19, 30)) {
    let dur = rand(p.clip);
    if (sink.kind === "action") {
      // GoPro splits long recordings into ~17:42 chapters
      const chapter = 17 * MIN + 42 * SEC;
      let s = t;
      while (dur > 0) {
        const d = Math.min(chapter, dur);
        push(s, d);
        s += d;
        dur -= d;
      }
      t = s;
    } else {
      push(t, dur);
      t += dur;
    }
    t += rand(p.gap);
  }
  return out;
}

export const CLIPS: Clip[] = SINKS.flatMap(generateClips);

// A few non-ready assets so the library shows the upload pipeline.
(() => {
  const b = CLIPS.filter((c) => c.sinkId === "b-cam");
  const set = (c: Clip | undefined, s: AssetStatus, progress?: number) => {
    if (c) Object.assign(c, { status: s, progress });
  };
  set(b.at(-1), "Uploading", 0.18);
  set(b.at(-2), "Uploading", 0.64);
  set(b.at(-3), "Processing");
  set(CLIPS.filter((c) => c.sinkId === "phone").at(-2), "Failed");
})();

export const PROJECTS: Project[] = [
  {
    id: "ceremony",
    name: "Riverside — Ceremony",
    sinkIds: ["a-cam", "b-cam", "helmet", "drone", "audio"],
    start: at(13, 30),
    end: at(16, 30),
    updated: "2h ago",
  },
  {
    id: "reception",
    name: "Riverside — Reception",
    sinkIds: ["a-cam", "b-cam", "phone", "audio"],
    start: at(16, 30),
    end: at(19, 30),
    updated: "Yesterday",
  },
  {
    id: "prep",
    name: "Morning Prep",
    sinkIds: ["a-cam", "phone", "helmet"],
    start: at(9, 30),
    end: at(12, 0),
    updated: "Oct 11",
  },
];
