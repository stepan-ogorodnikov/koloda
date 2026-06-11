import { useCallback, useState } from "react";

export type UseAssistantPromptTemplatesReturn = {
  cardsPromptTemplate: string | null;
  chatPromptTemplate: string | null;
  handleCardsPromptChange: (value: string | null) => void;
  handleChatPromptChange: (value: string | null) => void;
};

export function useAssistantPromptTemplates(): UseAssistantPromptTemplatesReturn {
  const [cardsPromptTemplate, setGenerationPromptTemplate] = useState<string | null>(null);
  const [chatPromptTemplate, setChatPromptTemplate] = useState<string | null>(null);

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
