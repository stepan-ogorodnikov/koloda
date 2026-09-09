declare module "wa-sqlite/src/examples/IDBBatchAtomicVFS.js" {
  import type { Base } from "wa-sqlite/src/VFS.js";

  export class IDBBatchAtomicVFS extends Base {
    name: string;
    constructor(idbDatabaseName?: string, options?: { durability?: "default" | "strict" | "relaxed" });
    close(): Promise<void>;
  }
}

declare module "wa-sqlite/dist/wa-sqlite-async.wasm?url" {
  const url: string;
  export default url;
}
