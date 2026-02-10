import type { ChatMessage } from '../types';

type Entry = {
  expiresAt: number;
  messages: ChatMessage[];
};

export class InMemoryConversationStore {
  private readonly ttlMs: number;
  private readonly maxTurns: number;
  private readonly map = new Map<string, Entry>();

  constructor(opts: { ttlSeconds: number; maxTurns: number }) {
    this.ttlMs = Math.max(1, opts.ttlSeconds) * 1000;
    this.maxTurns = Math.max(1, opts.maxTurns);
  }

  makeKey(chatId: string, senderOpenId: string): string {
    return `${chatId}:${senderOpenId}`;
  }

  getHistory(key: string): ChatMessage[] {
    this.gcOne(key);
    const e = this.map.get(key);
    return e ? [...e.messages] : [];
  }

  append(key: string, msg: ChatMessage): void {
    const now = Date.now();
    const e = this.map.get(key) || { expiresAt: now + this.ttlMs, messages: [] };
    e.expiresAt = now + this.ttlMs;
    e.messages.push(msg);
    // maxTurns counts user+assistant pairs, but we store messages flat. Keep last maxTurns*2 messages.
    const cap = this.maxTurns * 2;
    if (e.messages.length > cap) e.messages = e.messages.slice(e.messages.length - cap);
    this.map.set(key, e);
  }

  private gcOne(key: string): void {
    const e = this.map.get(key);
    if (!e) return;
    if (e.expiresAt <= Date.now()) this.map.delete(key);
  }
}

