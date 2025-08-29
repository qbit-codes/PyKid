import OpenAI from 'openai';
import { json } from '@sveltejs/kit';
import { PRIVATE_OPENAI_API_KEY } from '$env/static/private';

const client = new OpenAI({ apiKey: PRIVATE_OPENAI_API_KEY });

import type { RequestEvent } from '@sveltejs/kit';

export const POST = async ({ request }: RequestEvent) => {
  const { messages } = await request.json();
  // messages: [{role:'system'|'user'|'assistant', content:string}, ...]

  const resp = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    temperature: 0.7
  });

  const text = resp.choices?.[0]?.message?.content ?? '';
  return json({ text });
};
