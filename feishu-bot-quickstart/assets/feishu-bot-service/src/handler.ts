import type { TurnContext } from './types';
import { OpenAICompatibleLLM } from './llm/openai_compatible';

// Replace this with your business logic. Keep it deterministic and fast.
export async function handleTurn(ctx: TurnContext): Promise<{ text: string }> {
  const llm = OpenAICompatibleLLM.fromEnv();
  if (!llm) {
    return { text: `echo: ${ctx.text}` };
  }
  const text = await llm.chat({
    system: ctx.systemPrompt,
    messages: ctx.history,
    userText: ctx.text,
  });
  return { text };
}

