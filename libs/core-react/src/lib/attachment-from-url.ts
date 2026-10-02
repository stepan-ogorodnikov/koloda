import type { Attachment } from "@koloda/srs";
import { atom } from "jotai";

// INVARIANT: set only by the desktop app, whose main process fetches the URL. The web demo leaves it
// null: a page-origin fetch is blocked by CORS on most hosts. Not a `Queries` method on purpose.
export const addAttachmentFromUrlAtom = atom<((url: string) => Promise<Attachment>) | null>(null);
