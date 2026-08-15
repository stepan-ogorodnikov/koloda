import { atom } from "jotai";
import { lessonStateAtom } from "./lesson-store";

export const lessonPhaseAtom = atom((get) => get(lessonStateAtom).phase);

export const lessonIsOpenAtom = atom((get) => get(lessonPhaseAtom) !== "closed");

export const lessonRequestAtom = atom((get) => get(lessonStateAtom).request);

export const lessonSetupAtom = atom((get) => get(lessonStateAtom).setup);

export const lessonAmountsAtom = atom((get) => get(lessonSetupAtom)?.amounts);

export const lessonAvailableAtom = atom((get) => get(lessonSetupAtom)?.available);

export const lessonHasSessionAtom = atom((get) => get(lessonStateAtom).session != null);

export const lessonContentAtom = atom((get) => get(lessonStateAtom).session?.content);

export const lessonSessionCardsAtom = atom((get) => get(lessonStateAtom).session?.data.cards);

export const lessonProgressAtom = atom((get) => get(lessonStateAtom).session?.progress);

export const lessonTerminationRequestedAtom = atom((get) => get(lessonStateAtom).isTerminationRequested);

export const lessonUploadHeadAtom = atom((get) => get(lessonStateAtom).upload.queue[0]);

export const lessonUploadLogAtom = atom((get) => get(lessonStateAtom).upload.log);
