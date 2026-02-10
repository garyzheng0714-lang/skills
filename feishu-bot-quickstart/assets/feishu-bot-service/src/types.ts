export type Role = 'system' | 'user' | 'assistant';

export type ChatMessage = {
  role: Exclude<Role, 'system'>;
  content: string;
};

export type TurnContext = {
  chatId: string;
  senderOpenId: string;
  text: string;
  messageId: string;
  rawEvent: unknown;
  systemPrompt: string;
  history: ChatMessage[];
};

