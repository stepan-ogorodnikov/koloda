import type { Timestamps } from "./db";

export type Conversation = Timestamps & {
  id: string;
  state: unknown;
};

export type SetConversationData = {
  id: string;
  state: unknown;
};
