import type { ChatMessage } from '../types';

function normalizeBaseUrl(raw: string): string {
  const v = raw.trim().replace(/\/+$/, '');
  return v;
}

function buildChatCompletionsUrl(baseUrl: string): string {
  const b = normalizeBaseUrl(baseUrl);
  // Accept either ".../v1" or root; always call /v1/chat/completions.
  if (b.endsWith('/v1')) return `${b}/chat/completions`;
  return `${b}/v1/chat/completions`;
}

export class OpenAICompatibleLLM {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(opts: { baseUrl: string; apiKey: string; model: string }) {
    this.baseUrl = opts.baseUrl;
    this.apiKey = opts.apiKey;
    this.model = opts.model;
  }

  static fromEnv(): OpenAICompatibleLLM | null {
    const baseUrl = (process.env.LLM_BASE_URL || '').trim();
    const apiKey = (process.env.LLM_API_KEY || '').trim();
    const model = (process.env.LLM_MODEL || '').trim();
    if (!baseUrl || !apiKey || !model) return null;
    return new OpenAICompatibleLLM({ baseUrl, apiKey, model });
  }

  async chat(opts: {
    system: string;
    messages: ChatMessage[];
    userText: string;
  }): Promise<string> {
    const url = buildChatCompletionsUrl(this.baseUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      const payload = {
        model: this.model,
        messages: [
          { role: 'system', content: opts.system },
          ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
          { role: 'user', content: opts.userText },
        ],
        temperature: 0.2,
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`LLM HTTP ${res.status}: ${txt}`);
      }

      const data = (await res.json()) as any;
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new Error(`LLM response missing choices[0].message.content`);
      }
      return content.trim();
    } finally {
      clearTimeout(timeout);
    }
  }
}

