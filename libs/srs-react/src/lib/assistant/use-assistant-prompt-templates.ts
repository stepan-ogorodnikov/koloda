import type { AssistantSettings } from "@koloda/ai";
import { useCallback, useState } from "react";

export type UseAssistantPromptTemplatesReturn = {
  chatPromptTemplate: string | null;
  handleChatPromptChange: (value: string | null) => void;
};

export function useAssistantPromptTemplates(assistantSettings?: AssistantSettings): UseAssistantPromptTemplatesReturn {
  const [chatPromptTemplate, setChatPromptTemplate] = useState<string | null>(
    assistantSettings?.chatPromptTemplate ?? null,
  );

  const handleChatPromptChange = useCallback((value: string | null) => {
    setChatPromptTemplate(value);
  }, []);

  return {
    chatPromptTemplate,
    handleChatPromptChange,
  };
}
