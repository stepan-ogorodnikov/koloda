// The only reader and writer of `attachment_bytes` — mirrors Rust `repo::attachment_bytes`.
// A file store replaces this module; attachment metadata and card refs never move.
// See docs/decisions/MEDIA-STORAGE.md.
import type { DB } from "./db";

export async function writeAttachmentBytes(db: DB, id: string, bytes: Uint8Array) {
  await db.run(`INSERT INTO attachment_bytes (id, bytes) VALUES (?, ?)`, [id, bytes]);
}

export async function readAttachmentBytes(db: DB, id: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const row = await db.get(`SELECT bytes FROM attachment_bytes WHERE id = ?`, [id]);
  // WHY: wa-sqlite copies a blob out of WASM memory into its own ArrayBuffer (`sqlite3.row`).
  return row?.bytes instanceof Uint8Array ? (row.bytes as Uint8Array<ArrayBuffer>) : null;
}
