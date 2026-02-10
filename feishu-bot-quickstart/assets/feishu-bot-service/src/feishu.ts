import {
  Client,
  EventDispatcher,
  WSClient,
} from '@larksuiteoapi/node-sdk';

import type { BotConfig } from './config';
import type { ChatMessage, TurnContext } from './types';
import { handleTurn } from './handler';
import { InMemoryConversationStore } from './store/conversation';
import { TtlSet } from './util/ttl_set';

type Extracted = {
  messageId: string;
  chatId: string;
  chatType: string;
  senderOpenId: string;
  text: string;
  mentions: Array<{ id?: { open_id?: string } }> | undefined;
  rawEvent: unknown;
};

function safeJsonParse(s: string): any | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function extractEvent(data: any): any {
  return data?.event ?? data;
}

function extractMessage(data: any): Extracted | null {
  const ev = extractEvent(data);
  const msg = ev?.message ?? ev?.event?.message ?? ev?.data?.message ?? null;
  const sender = ev?.sender ?? ev?.event?.sender ?? ev?.data?.sender ?? null;

  const senderType: string | undefined = sender?.sender_type ?? sender?.senderType;
  if (senderType && senderType !== 'user') return null;

  const senderOpenId: string =
    sender?.sender_id?.open_id ??
    sender?.senderId?.openId ??
    sender?.sender_id?.openId ??
    '';
  if (!senderOpenId) return null;

  const messageId: string = msg?.message_id ?? msg?.messageId ?? '';
  const chatId: string = msg?.chat_id ?? msg?.chatId ?? '';
  const chatType: string = msg?.chat_type ?? msg?.chatType ?? '';
  const contentRaw: string = msg?.content ?? '';
  if (!messageId || !chatId || !chatType || typeof contentRaw !== 'string') return null;

  const content = safeJsonParse(contentRaw);
  const text = (content?.text ?? '').toString();
  if (!text.trim()) return null;

  const mentions = msg?.mentions as Array<{ id?: { open_id?: string } }> | undefined;

  return {
    messageId,
    chatId,
    chatType,
    senderOpenId,
    text: text.trim(),
    mentions,
    rawEvent: data,
  };
}

function isP2P(chatType: string): boolean {
  return chatType === 'p2p' || chatType === 'private';
}

function isBotMentioned(ex: Extracted, botOpenId: string | undefined): boolean {
  if (!botOpenId) return false;
  const ms = ex.mentions || [];
  return ms.some((m) => m?.id?.open_id === botOpenId);
}

async function sendText(client: any, chatId: string, text: string): Promise<void> {
  const create =
    client?.im?.v1?.message?.create ??
    client?.im?.message?.create ??
    client?.im?.v1?.messages?.create;
  if (typeof create !== 'function') {
    throw new Error('Feishu SDK client does not expose im.v1.message.create (API shape changed?)');
  }
  await create.call(client, {
    params: { receive_id_type: 'chat_id' },
    data: {
      receive_id: chatId,
      msg_type: 'text',
      content: JSON.stringify({ text }),
    },
  });
}

export function startFeishuLongConnBot(cfg: BotConfig): { stop: () => Promise<void> } {
  const client = new Client({
    appId: cfg.feishuAppId,
    appSecret: cfg.feishuAppSecret,
  } as any);

  const store = new InMemoryConversationStore({
    ttlSeconds: cfg.convTtlSeconds,
    maxTurns: cfg.convMaxTurns,
  });

  const seen = new TtlSet(10 * 60 * 1000);

  const dispatcher = new EventDispatcher({});
  dispatcher.register({
    'im.message.receive_v1': (data: any) => {
      // Return quickly; do work asynchronously to avoid blocking dispatcher.
      setImmediate(() => {
        void (async () => {
          const ex = extractMessage(data);
          if (!ex) return;

          if (seen.has(ex.messageId)) return;
          seen.add(ex.messageId);

          if (cfg.allowChatIds.size > 0 && !cfg.allowChatIds.has(ex.chatId)) return;
          if (cfg.allowUserOpenIds.size > 0 && !cfg.allowUserOpenIds.has(ex.senderOpenId)) return;

          if (cfg.replyPolicy === 'dm_only') {
            if (!isP2P(ex.chatType)) return;
          } else {
            if (!isP2P(ex.chatType) && !isBotMentioned(ex, cfg.botOpenId)) return;
          }

          const key = store.makeKey(ex.chatId, ex.senderOpenId);
          const history: ChatMessage[] = store.getHistory(key);

          const ctx: TurnContext = {
            chatId: ex.chatId,
            senderOpenId: ex.senderOpenId,
            text: ex.text,
            messageId: ex.messageId,
            rawEvent: ex.rawEvent,
            systemPrompt: cfg.systemPrompt,
            history,
          };

          store.append(key, { role: 'user', content: ex.text });

          let reply: string;
          try {
            const out = await handleTurn(ctx);
            reply = (out?.text || '').toString().trim();
          } catch (err: any) {
            reply = `handler error: ${err?.message || String(err)}`;
          }

          if (!reply) reply = '(empty reply)';

          store.append(key, { role: 'assistant', content: reply });
          await sendText(client, ex.chatId, reply);
        })().catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[feishu] failed to process message', err);
        });
      });
    },
  });

  const wsClient = new WSClient({
    appId: cfg.feishuAppId,
    appSecret: cfg.feishuAppSecret,
  } as any);

  void wsClient.start({ eventDispatcher: dispatcher }).catch((err: any) => {
    // eslint-disable-next-line no-console
    console.error('[feishu] WSClient.start failed', err);
  });

  return {
    stop: async () => {
      try {
        wsClient.close({ force: true });
      } catch {
        // best-effort
      }
    },
  };
}
