import dotenv from 'dotenv';

export type ReplyPolicy = 'dm_only' | 'mention_or_dm';

export type BotConfig = {
  feishuAppId: string;
  feishuAppSecret: string;
  feishuMode: 'longconn';
  replyPolicy: ReplyPolicy;
  botOpenId?: string;
  allowUserOpenIds: Set<string>;
  allowChatIds: Set<string>;
  systemPrompt: string;
  convTtlSeconds: number;
  convMaxTurns: number;
};

function parseIntEnv(name: string, dflt: number): number {
  const raw = (process.env[name] || '').trim();
  if (!raw) return dflt;
  const n = Number(raw);
  return Number.isFinite(n) ? n : dflt;
}

function parseCsvSet(raw: string | undefined): Set<string> {
  const s = new Set<string>();
  const v = (raw || '').trim();
  if (!v) return s;
  for (const part of v.split(',')) {
    const t = part.trim();
    if (t) s.add(t);
  }
  return s;
}

export function loadEnv(): void {
  // Optional local overrides for dev. The scaffold does not create these files.
  dotenv.config({ path: '.env.local' });
  dotenv.config();
}

export function readConfigFromEnv(): Omit<BotConfig, 'feishuAppId' | 'feishuAppSecret'> & {
  feishuAppId?: string;
  feishuAppSecret?: string;
} {
  const feishuMode = ((process.env.FEISHU_MODE || 'longconn').trim() || 'longconn') as string;
  if (feishuMode !== 'longconn') {
    throw new Error(`FEISHU_MODE must be 'longconn' (got: ${feishuMode})`);
  }

  const replyPolicy = ((process.env.FEISHU_REPLY_POLICY || 'dm_only').trim() ||
    'dm_only') as ReplyPolicy;
  if (replyPolicy !== 'dm_only' && replyPolicy !== 'mention_or_dm') {
    throw new Error(`FEISHU_REPLY_POLICY must be 'dm_only' or 'mention_or_dm' (got: ${replyPolicy})`);
  }

  return {
    feishuAppId: (process.env.FEISHU_APP_ID || '').trim() || undefined,
    feishuAppSecret: (process.env.FEISHU_APP_SECRET || '').trim() || undefined,
    feishuMode: 'longconn',
    replyPolicy,
    botOpenId: (process.env.FEISHU_BOT_OPEN_ID || '').trim() || undefined,
    allowUserOpenIds: parseCsvSet(process.env.FEISHU_ALLOW_USER_OPEN_IDS),
    allowChatIds: parseCsvSet(process.env.FEISHU_ALLOW_CHAT_IDS),
    systemPrompt:
      (process.env.BOT_SYSTEM_PROMPT || '').trim() ||
      'You are a helpful engineering assistant chatting inside Feishu. Keep replies concise and actionable.',
    convTtlSeconds: parseIntEnv('CONV_TTL_SECONDS', 3600),
    convMaxTurns: parseIntEnv('CONV_MAX_TURNS', 20),
  };
}

