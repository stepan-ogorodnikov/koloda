import { queriesAtom, queryKeys } from "@koloda/core-react";
import type { Deck } from "@koloda/srs";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { createContext, useContext, useEffect, useState } from "react";
import type { UseAssistantPageReturn } from "./use-assistant-page";
import { useAssistantPage } from "./use-assistant-page";

type AssistantChatContextValue = UseAssistantPageReturn & {
  deckId: Deck["id"] | undefined;
  areSettingsOpen: boolean;
  setAreSettingsOpen: (open: boolean) => void;
};

const AssistantChatContext = createContext<AssistantChatContextValue | null>(null);

export function useAssistantChatContext(): AssistantChatContextValue {
  const ctx = useContext(AssistantChatContext);
  if (!ctx) throw new Error("useAssistantChatContext must be used within AssistantChatProvider");

  return ctx;
}

export type AssistantChatProviderProps = {
  deckId?: Deck["id"];
  children: React.ReactNode;
};

export function AssistantChatProvider({ deckId, children }: AssistantChatProviderProps) {
  const { getDeckQuery } = useAtomValue(queriesAtom);
  const deckQuery = useQuery({
    queryKey: queryKeys.decks.detail(deckId!),
    ...getDeckQuery(deckId!),
    enabled: !!deckId,
  });
  const templateId = deckQuery.data?.templateId;
  const { setMode, ...page } = useAssistantPage(deckId, templateId);
  const [areSettingsOpen, setAreSettingsOpen] = useState(false);

  useEffect(() => {
    if (!deckId) setMode("chat");
  }, [deckId, setMode]);

  const value: AssistantChatContextValue = {
    ...page,
    setMode,
    deckId,
    areSettingsOpen,
    setAreSettingsOpen,
  };

  return <AssistantChatContext.Provider value={value}>{children}</AssistantChatContext.Provider>;
}
