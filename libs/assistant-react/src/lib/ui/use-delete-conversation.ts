import type { DeleteConversationData } from "@koloda/app";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue, useStore } from "jotai";
import { deleteAssistantConversation } from "../persistence/conversation-write-adapter";

export type UseDeleteConversationOptions = {
  id: DeleteConversationData["id"];
  onSuccess?: () => void;
  onError?: () => void;
};

export function useDeleteConversation({ id, onSuccess, onError }: UseDeleteConversationOptions) {
  const queryClient = useQueryClient();
  const store = useStore();
  const { deleteConversationMutation } = useAtomValue(queriesAtom);

  const { mutate, error, reset, isPending } = useMutation({
    mutationFn: async (data: DeleteConversationData) => {
      const { mutationFn } = deleteConversationMutation();
      if (!mutationFn) throw new Error("deleteConversationMutation is missing mutationFn");
      // WHY: delete must run through the persistence coordinator so an
      // in-flight upsert cannot recreate the row after DB delete (#8).
      await deleteAssistantConversation({
        store,
        conversationId: data.id,
        deleteFromDb: (conversationId) => mutationFn({ id: conversationId }, { client: queryClient, meta: undefined }),
        invalidateConversations: () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all() });
        },
        removeConversationQuery: (conversationId) => {
          queryClient.removeQueries({ queryKey: queryKeys.conversations.detail(conversationId) });
        },
      });
    },
  });

  const deleteConversation = () => {
    mutate(
      { id },
      {
        onSuccess: () => onSuccess?.(),
        onError: () => onError?.(),
      },
    );
  };

  return {
    deleteConversation,
    error,
    reset,
    isPending,
  };
}
