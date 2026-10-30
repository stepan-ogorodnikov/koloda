import type { IpcArgs, IpcResult } from "@koloda/native-ipc";
import { ipcMain, net } from "electron";
import type { ClientRequest, ClientRequestConstructorOptions } from "electron";
import { Readable } from "node:stream";
import { assertAppSender } from "./app-sender";
import type { KolodaDb } from "./koloda-db";

// INVARIANT: twin of `ATTACHMENT_MAX_BYTES` in `@koloda/srs` and the Rust domain; the repo
// checks it again on add. The `@koloda/srs` barrel pulls Lingui macros main cannot load.
const ATTACHMENT_MAX_BYTES = 5_242_880;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;
// INVARIANT: no `persist:` prefix, so the session lives in memory and holds none of the app's data.
const EMBED_PARTITION = "media-embed";
// WHY: a `Response` with one of these statuses cannot have a body.
const NULL_BODY_STATUSES = [204, 205, 304];

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

// WHY: the renderer reads `{ code, details }` out of the IPC error message (`parseElectronError`).
class MediaError extends Error {
  constructor(code: string, details?: string) {
    super(JSON.stringify({ code, details }));
  }
}

function toHttpUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new MediaError("attachments.fetch", "Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new MediaError("attachments.fetch", `Unsupported protocol: ${url.protocol}`);
  }
  return url;
}

async function readCappedBody(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > ATTACHMENT_MAX_BYTES) {
      await reader.cancel();
      throw new MediaError("validation.attachments.too-large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

// WHY: `fetchImageBytes` follows redirects itself to check every hop, so this resolves a redirect as a 3xx carrying
// its URL and stops there.
// WORKAROUND: `session.fetch` cannot do that. Electron's `fetchWithSession` passes `redirect: "manual"` to
// `ClientRequest` and never handles its `redirect` event, so the request dies with "Redirect was cancelled".
export function createHopFetch(request: (options: ClientRequestConstructorOptions) => ClientRequest): Fetch {
  return (url, { signal }) =>
    new Promise((resolve, reject) => {
      signal?.throwIfAborted();
      const hop = request({ url, partition: EMBED_PARTITION, credentials: "omit", redirect: "manual" });
      signal?.addEventListener(
        "abort",
        () => {
          hop.abort();
          reject(signal.reason);
        },
        { once: true },
      );
      hop.on("redirect", (status, _method, location) => {
        resolve(new Response(null, { status, headers: { location } }));
        // WHY: an aborted request does not die when the listener returns without `followRedirect`.
        hop.abort();
      });
      hop.on("response", (message) => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(message.headers)) {
          headers.set(name, Array.isArray(value) ? value.join(", ") : value);
        }
        // WHY: piping through the signal errors a pending body read on timeout, whatever the aborted message does.
        const body = NULL_BODY_STATUSES.includes(message.statusCode)
          ? null
          : (Readable.toWeb(message as unknown as Readable) as ReadableStream<Uint8Array>).pipeThrough(
              new TransformStream(),
              { signal: signal ?? undefined },
            );
        resolve(new Response(body, { status: message.statusCode, headers }));
      });
      hop.on("error", reject);
      hop.end();
    });
}

// WHY: redirects are followed by hand so every hop is checked for http(s).
export async function fetchImageBytes(value: string, fetch: Fetch, signal: AbortSignal) {
  let url = toHttpUrl(value);
  try {
    for (let redirects = 0; ; redirects++) {
      const response = await fetch(url.href, { credentials: "omit", redirect: "manual", signal });
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        await response.body?.cancel();
        if (redirects >= MAX_REDIRECTS) throw new MediaError("attachments.fetch", "Too many redirects");
        url = toHttpUrl(new URL(location, url).href);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new MediaError("attachments.fetch", `HTTP ${response.status}`);
      }
      return await readCappedBody(response);
    }
  } catch (error) {
    if (error instanceof MediaError) throw error;
    throw new MediaError("attachments.fetch", error instanceof Error ? error.message : String(error));
  }
}

export function registerMediaIpc(db: KolodaDb) {
  const fetchHop = createHopFetch((options) => net.request(options));
  ipcMain.handle(
    "cmd_add_attachment_from_url",
    async (
      event,
      { url }: IpcArgs<"cmd_add_attachment_from_url">,
    ): Promise<IpcResult<"cmd_add_attachment_from_url">> => {
      assertAppSender(event);
      // WHY: Chromium's network stack, not Node's fetch, so the system proxy and certificate store apply. The
      // in-memory session and `credentials: "omit"` keep the app's cookies and data out of the request.
      const bytes = await fetchImageBytes(url, fetchHop, AbortSignal.timeout(FETCH_TIMEOUT_MS));
      return db.addAttachment({ bytes: Buffer.from(bytes).toString("base64") });
    },
  );
}
