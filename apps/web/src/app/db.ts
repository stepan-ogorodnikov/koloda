import { openDb } from "@koloda/db-sqlite";
import { requestPersistentStorage } from "./persistent-storage";

// WHY: not awaited, so a browser permission prompt cannot hold up opening the database.
void requestPersistentStorage();

export const db = await openDb();
