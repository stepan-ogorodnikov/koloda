import { createServer, request } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { connect } from "node:net";
import type { AddressInfo, Socket } from "node:net";

const IMAGE_DOWNLOAD = /^\/v1\/spaces\/[^/]+\/attachments\/(?!missing$)[^/]+$/;

export type SyncProxy = {
  url: string;
  release: () => void;
  stop: () => Promise<void>;
};

/**
 * A loopback proxy in front of a sync server for one device: it forwards every request and the events socket, and
 * holds each image download until `release`, so a spec can show a card whose image has not arrived yet.
 */
export async function startSyncProxy(targetUrl: string): Promise<SyncProxy> {
  const target = new URL(targetUrl);
  const sockets = new Set<Socket>();
  const held: Array<() => void> = [];
  let isReleased = false;

  const track = (socket: Socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  };

  const forward = (incoming: IncomingMessage, reply: ServerResponse) => {
    const outgoing = request(
      {
        host: target.hostname,
        port: target.port,
        method: incoming.method,
        path: incoming.url,
        headers: { ...incoming.headers, host: target.host },
      },
      (response) => {
        reply.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(reply);
      },
    );
    outgoing.once("error", () => reply.destroy());
    incoming.pipe(outgoing);
  };

  const server = createServer((incoming, reply) => {
    const path = new URL(incoming.url ?? "/", target).pathname;
    if (!isReleased && incoming.method === "GET" && IMAGE_DOWNLOAD.test(path)) {
      held.push(() => forward(incoming, reply));
      return;
    }
    forward(incoming, reply);
  });
  server.on("connection", track);
  // WHY: the events socket is a WebSocket; once the head is passed on, the proxy only copies bytes both ways, so the
  // server's answer, an upgrade or a refusal, reaches the device as the server sent it.
  server.on("upgrade", (incoming: IncomingMessage, socket: Socket, head: Buffer) => {
    const upstream = connect(Number(target.port), target.hostname, () => {
      const lines = [`${incoming.method} ${incoming.url} HTTP/${incoming.httpVersion}`];
      for (let i = 0; i < incoming.rawHeaders.length; i += 2) {
        lines.push(`${incoming.rawHeaders[i]}: ${incoming.rawHeaders[i + 1]}`);
      }
      upstream.write(`${lines.join("\r\n")}\r\n\r\n`);
      upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    track(upstream);
    upstream.once("error", () => socket.destroy());
    socket.once("error", () => upstream.destroy());
    socket.once("close", () => upstream.destroy());
    upstream.once("close", () => socket.destroy());
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    release: () => {
      isReleased = true;
      for (const send of held.splice(0)) send();
    },
    stop: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
