import { useCallback, useState } from "react";

export type UsePromptTemplatesReturn = {
  cardsPromptTemplate: string | null;
  chatPromptTemplate: string | null;
  handleCardsPromptChange: (value: string | null) => void;
  handleChatPromptChange: (value: string | null) => void;
};

export function usePromptTemplates(): UsePromptTemplatesReturn {
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
