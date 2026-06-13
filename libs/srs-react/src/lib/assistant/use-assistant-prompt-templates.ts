import type { AssistantSettings } from "@koloda/ai";
import { useCallback, useState } from "react";

export type UseAssistantPromptTemplatesReturn = {
  cardsPromptTemplate: string | null;
  chatPromptTemplate: string | null;
  handleCardsPromptChange: (value: string | null) => void;
  handleChatPromptChange: (value: string | null) => void;
};

export function useAssistantPromptTemplates(assistantSettings?: AssistantSettings): UseAssistantPromptTemplatesReturn {
  const [cardsPromptTemplate, setGenerationPromptTemplate] = useState<string | null>(
    assistantSettings?.cardsPromptTemplate ?? null,
  );
  const [chatPromptTemplate, setChatPromptTemplate] = useState<string | null>(
    assistantSettings?.chatPromptTemplate ?? null,
  );

  const handleCardsPromptChange = useCallback((value: string | null) => {
    setGenerationPromptTemplate(value);
  }, []);

  const handleChatPromptChange = useCallback((value: string | null) => {
    setChatPromptTemplate(value);
  }, []);

  return {
    cardsPromptTemplate,
    chatPromptTemplate,
    handleCardsPromptChange,
    handleChatPromptChange,
  };
}
