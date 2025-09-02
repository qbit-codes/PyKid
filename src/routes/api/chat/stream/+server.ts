// src/routes/api/chat/stream/+server.ts
import OpenAI from 'openai';
import { OPENAI_API_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';
import { ADA_TEACHER_PROMPT } from '$lib/prompts/adaTeacher';

const client = new OpenAI({ apiKey: OPENAI_API_KEY });

export const POST: RequestHandler = async ({ request }) => {
  const { messages, model = 'gpt-4o-mini', temperature = 0.7 } = await request.json();

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response('Bad Request: messages[] gerekli', { status: 400 });
  }
  if (!messages.some((m: any) => m?.role === 'system')) {
    messages.unshift({ role: 'system', content: ADA_TEACHER_PROMPT });
  }
  
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // (opsiyonel) otomatik reconnect için tavsiye
      controller.enqueue(enc.encode('retry: 500\n\n'));

      try {
        const ai = await client.chat.completions.create({
          model,
          messages,
          temperature,
          stream: true
        });

        for await (const part of ai) {
          const delta = part.choices?.[0]?.delta?.content;
          if (delta) {
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ delta })}\n\n`));
          }
        }

        controller.enqueue(enc.encode('event: done\ndata: {}\n\n'));
      } catch (e: any) {
        controller.enqueue(
          enc.encode(`event: error\ndata: ${JSON.stringify({ message: String(e?.message || e) })}\n\n`)
        );
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    }
  });
};
