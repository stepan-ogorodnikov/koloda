import { ATTACHMENT_MAX_BYTES } from "@koloda/srs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TestDb } from "../test/test-helpers";
import { createTestDb } from "../test/test-helpers";
import { addAttachment, getAttachment, getAttachmentBytes } from "./attachments";
import type { DB } from "./db";

// WHY: the desktop twin pins the same literal, so both hosts mint the same id for the same bytes.
const PNG_16_ID = "d9c9bcbbba3f78d5acb0e0223861c44f79e918c161d4ea7b571f5cc6df50797f";

function pngOfLength(length: number, fill = 0) {
  const bytes = new Uint8Array(length).fill(fill);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
}

async function countRows(db: DB, table: string) {
  const row = await db.get(`SELECT COUNT(*) AS count FROM ${table}`);
  return Number(row?.count);
}

describe("attachments repository integration", () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createTestDb();
  });

  afterEach(async () => {
    await testDb.close();
  });

  it("round-trips every field", async () => {
    const { db } = testDb;

    const added = await addAttachment(db, { bytes: pngOfLength(16), width: 640, height: 480 });
    const stored = await getAttachment(db, PNG_16_ID);

    expect(stored).toEqual({
      id: PNG_16_ID,
      mime: "image/png",
      size: 16,
      width: 640,
      height: 480,
      createdAt: expect.any(Date),
    });
    expect(stored).toEqual(added);
    expect(await getAttachmentBytes(db, PNG_16_ID)).toEqual(pngOfLength(16));
  });

  it("returns the existing row unchanged when the same bytes are added again", async () => {
    const { db } = testDb;

    const first = await addAttachment(db, { bytes: pngOfLength(16), width: 640, height: 480 });
    const second = await addAttachment(db, { bytes: pngOfLength(16) });

    expect(second).toEqual(first);
    expect(await countRows(db, "attachments")).toBe(1);
    expect(await countRows(db, "attachment_bytes")).toBe(1);
  });

  // WHY: second door over the domain cap test — pins that the repo validates before it writes.
  it("rejects an add over the cap and writes nothing", async () => {
    const { db } = testDb;

    await expect(addAttachment(db, { bytes: pngOfLength(ATTACHMENT_MAX_BYTES + 1) })).rejects.toMatchObject({
      issues: [expect.objectContaining({ message: "validation.attachments.too-large" })],
    });
    expect(await countRows(db, "attachments")).toBe(0);
    expect(await countRows(db, "attachment_bytes")).toBe(0);
  });

  // WHY: guards the wa-sqlite heap reservation in db.ts — cap-sized blobs must not grow
  // WASM memory mid-read and corrupt what comes back.
  it("writes and reads back three cap-sized blobs in a row", async () => {
    const { db } = testDb;
    const blobs = [1, 2, 3].map((fill) => pngOfLength(ATTACHMENT_MAX_BYTES, fill));

    const ids: string[] = [];
    for (const bytes of blobs) ids.push((await addAttachment(db, { bytes })).id);

    for (const [i, bytes] of blobs.entries()) {
      const stored = await getAttachmentBytes(db, ids[i] ?? "");
      // WHY: toEqual walks 5 MiB element by element (seconds per blob); Buffer.compare is a memcmp.
      expect(stored && Buffer.compare(stored, bytes)).toBe(0);
    }
  });
});
