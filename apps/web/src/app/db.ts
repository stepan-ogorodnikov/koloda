import { openDb } from "@koloda/db-sqlite";
import { requestPersistentStorage } from "./persistent-storage";

requestPersistentStorage();

export const db = await openDb();
