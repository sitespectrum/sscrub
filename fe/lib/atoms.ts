import { atom } from "jotai";
import { PendingUpload } from "./types";

export const pendingUploadsAtom = atom<PendingUpload[]>([]);
