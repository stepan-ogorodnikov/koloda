import { useCallback, useState } from "react";

export type UsePromptTemplatesReturn = {
  generationPromptTemplate: string | null;
  chatPromptTemplate: string | null;
  handleGenerationPromptChange: (value: string | null) => void;
  handleChatPromptChange: (value: string | null) => void;
};

export function usePromptTemplates(): UsePromptTemplatesReturn {
  const [generationPromptTemplate, setGenerationPromptTemplate] = useState<string | null>(null);
  const [chatPromptTemplate, setChatPromptTemplate] = useState<string | null>(null);

  const handleGenerationPromptChange = useCallback((value: string | null) => {
    setGenerationPromptTemplate(value);
  }, []);

  const handleChatPromptChange = useCallback((value: string | null) => {
    setChatPromptTemplate(value);
  }, []);

  return {
    generationPromptTemplate,
    chatPromptTemplate,
    handleGenerationPromptChange,
    handleChatPromptChange,
  };
}
