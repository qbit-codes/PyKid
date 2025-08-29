import { json } from '@sveltejs/kit';
import OpenAI from 'openai';
import { OPENAI_API_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';

const client = new OpenAI({ apiKey: OPENAI_API_KEY });

export const POST: RequestHandler = async ({ request }) => {
  const { messages } = await request.json();

  const resp = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    temperature: 0.7
  });

  const text = resp.choices?.[0]?.message?.content ?? '';
  return json({ text });
};

export const OPTIONS: RequestHandler = async () =>
  new Response(null, { status: 204 });
