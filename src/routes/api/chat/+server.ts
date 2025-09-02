// ...existing code...
import { json } from '@sveltejs/kit';
import OpenAI from 'openai';
import { OPENAI_API_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';

const client = new OpenAI({ apiKey: OPENAI_API_KEY });

// ...existing code...
export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const messages = Array.isArray(body.messages) ? body.messages : [];

  // Basit doğrulama
  if (!messages.length) return json({ error: 'messages required' }, { status: 400 });
  if (messages.join(' ').length > 50_000) return json({ error: 'messages too long' }, { status: 400 });

  try {
    const resp = await client.chat.completions.create({
      model: body.model ?? 'gpt-4o-mini',   // istekten model param kontrolü
      messages,
      temperature: typeof body.temperature === 'number' ? body.temperature : 0.7,
      max_tokens: typeof body.max_tokens === 'number' ? body.max_tokens : 800
    });

    const text = resp.choices?.[0]?.message?.content ?? '';
    return json({ text, usage: resp.usage ?? null });
  } catch (err: any) {
    console.error('OpenAI error', err);
    return json({ error: err?.message ?? String(err) }, { status: 502 });
  }
};
// ...existing code...
export const OPTIONS: RequestHandler = async () =>
  new Response(null, { status: 204 });
/*
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
*/