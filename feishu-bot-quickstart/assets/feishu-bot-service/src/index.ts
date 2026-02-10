import readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';

import { loadEnv, readConfigFromEnv, type BotConfig } from './config';
import { startFeishuLongConnBot } from './feishu';

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    return await new Promise<string>((resolve) => rl.question(question, resolve));
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  loadEnv();

  const base = readConfigFromEnv();

  let appId = base.feishuAppId || '';
  let appSecret = base.feishuAppSecret || '';

  if ((!appId || !appSecret) && process.stdin.isTTY) {
    if (!appId) appId = (await prompt('FEISHU_APP_ID: ')).trim();
    if (!appSecret) appSecret = (await prompt('FEISHU_APP_SECRET: ')).trim();
  }

  if (!appId || !appSecret) {
    throw new Error(
      'FEISHU_APP_ID / FEISHU_APP_SECRET are required (set env vars or run in an interactive terminal).'
    );
  }

  const cfg: BotConfig = {
    feishuAppId: appId,
    feishuAppSecret: appSecret,
    feishuMode: 'longconn',
    replyPolicy: base.replyPolicy,
    botOpenId: base.botOpenId,
    allowUserOpenIds: base.allowUserOpenIds,
    allowChatIds: base.allowChatIds,
    systemPrompt: base.systemPrompt,
    convTtlSeconds: base.convTtlSeconds,
    convMaxTurns: base.convMaxTurns,
  };

  if (cfg.replyPolicy === 'mention_or_dm' && !cfg.botOpenId) {
    // eslint-disable-next-line no-console
    console.warn(
      '[warn] FEISHU_REPLY_POLICY=mention_or_dm set but FEISHU_BOT_OPEN_ID is not set. Group replies will be skipped.'
    );
  }

  // eslint-disable-next-line no-console
  console.log('[feishu] starting long-connection bot...');
  startFeishuLongConnBot(cfg);
  // eslint-disable-next-line no-console
  console.log('[feishu] started. Send a DM to the bot in Feishu to test.');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});

