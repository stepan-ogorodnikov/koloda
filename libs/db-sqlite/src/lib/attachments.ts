import { throwKnownError } from "@koloda/app";
import { addAttachmentSchema, attachmentRowSchema, sniffImageMime } from "@koloda/srs";
import type { AddAttachmentData, Attachment, AttachmentMime, SweepAttachmentsData } from "@koloda/srs";
import { readAttachmentBytes, writeAttachmentBytes } from "./attachment-bytes";
import { ATTACHMENT_SELECT } from "./columns";
import type { DB } from "./db";
import { parseRow, parseRowOrNull } from "./parse-rows";
import { nowMs } from "./sql";

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function selectAttachment(db: DB, id: string) {
  return db.get(`SELECT ${ATTACHMENT_SELECT} FROM attachments WHERE id = ?`, [id]);
}

export async function addAttachment(db: DB, data: AddAttachmentData): Promise<Attachment> {
  return throwKnownError("db.add", async () => {
    const { bytes, width, height } = addAttachmentSchema.parse(data);
    // INVARIANT: the schema already rejected bytes with no known format.
    const mime = sniffImageMime(bytes) as AttachmentMime;
    // INVARIANT: the id is the lowercase hex SHA-256 of the bytes, so equal bytes share one row.
    const id = await sha256Hex(bytes);

    return db.transaction(async (tx) => {
      const { changes } = await tx.run(
        `INSERT INTO attachments (id, mime, size, width, height, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO NOTHING`,
        [id, mime, bytes.byteLength, width ?? null, height ?? null, nowMs()],
      );
      // WHY: a re-add of the same bytes keeps the first row and its bytes unchanged.
      if (changes > 0) await writeAttachmentBytes(tx, id, bytes);
      return parseRow(attachmentRowSchema, await selectAttachment(tx, id));
    });
  });
}

export async function getAttachment(db: DB, id: Attachment["id"]): Promise<Attachment | null> {
  return throwKnownError("db.get", async () => parseRowOrNull(attachmentRowSchema, await selectAttachment(db, id)));
}

export async function sweepAttachments(db: DB, { createdBefore }: SweepAttachmentsData) {
  return throwKnownError("db.delete", async () => {
    // WHY: a hex id cannot be hidden by JSON escaping, so a substring match on the stored
    // content finds every ref without parsing it. Bytes go through the foreign-key cascade.
    await db.run(
      `DELETE FROM attachments
       WHERE created_at < ?
         AND NOT EXISTS (SELECT 1 FROM cards WHERE instr(cards.content, 'attachment:' || attachments.id) > 0)`,
      [createdBefore],
    );
  });
}

export async function getAttachmentBytes(db: DB, id: Attachment["id"]): Promise<Uint8Array<ArrayBuffer> | null> {
  return throwKnownError("db.get", async () => readAttachmentBytes(db, id));
}
