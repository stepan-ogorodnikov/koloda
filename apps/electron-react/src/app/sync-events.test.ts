import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchedAttachmentsAtom, queryKeys } from "@koloda/core-react";
import { QueryClient } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";
import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import { applySyncEvent, SYNC_KIND_QUERY_KEYS } from "./sync-events";

// WHY: the kinds come from the Rust registry, parsed at test time like `libs/app` error parity,
// so a kind added there fails here until its rows refresh the screens that show them.
const REGISTRY_RS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../crates/koloda-sync-proto/src/registry.rs",
);

function registryKinds(): string[] {
  const source = readFileSync(REGISTRY_RS, "utf8");
  const start = source.indexOf("impl Kind {");
  const asWire = source.slice(source.indexOf("pub fn as_wire", start), source.indexOf("pub fn from_wire", start));
  return [...asWire.matchAll(/Kind::\w+ => "([^"]+)"/g)].map((match) => match[1]);
}

function clientWith(keys: QueryKey[]) {
  const queryClient = new QueryClient();
  for (const queryKey of keys) queryClient.setQueryData(queryKey, []);
  return queryClient;
}

function isInvalidated(queryClient: QueryClient, queryKey: QueryKey) {
  return queryClient.getQueryState(queryKey)?.isInvalidated ?? false;
}

describe("applySyncEvent", () => {
  it("knows every kind the engine syncs", () => {
    expect(registryKinds()).not.toHaveLength(0);
    expect(Object.keys(SYNC_KIND_QUERY_KEYS).sort()).toEqual(registryKinds().sort());
  });

  it("refreshes the screens that show a changed kind and leaves the others", () => {
    const deckCards = queryKeys.cards.deck({ deckId: "d1" });
    const lessons = queryKeys.lessons.all({ deckIds: ["d1"] });
    const totals = queryKeys.lessons.todayReviewTotals();
    const conversations = queryKeys.conversations.all();
    const decks = queryKeys.decks.all();
    const queryClient = clientWith([deckCards, lessons, totals, conversations, decks]);

    applySyncEvent(queryClient, createStore(), { type: "changed", kinds: ["cards"] });

    expect(isInvalidated(queryClient, deckCards)).toBe(true);
    expect(isInvalidated(queryClient, lessons)).toBe(true);
    expect(isInvalidated(queryClient, totals)).toBe(true);
    expect(isInvalidated(queryClient, conversations)).toBe(false);
    expect(isInvalidated(queryClient, decks)).toBe(false);
  });

  it("hands each batch of fetched images to the screens that show them", () => {
    const store = createStore();
    const seen: (readonly string[])[] = [];
    store.sub(fetchedAttachmentsAtom, () => seen.push(store.get(fetchedAttachmentsAtom)));

    applySyncEvent(new QueryClient(), store, { type: "attachmentsFetched", ids: ["aa"] });
    applySyncEvent(new QueryClient(), store, { type: "attachmentsFetched", ids: ["aa"] });

    expect(seen).toEqual([["aa"], ["aa"]]);
  });
});
