// src/routes/api/chat/stream/+server.ts
import OpenAI from 'openai';
import { OPENAI_API_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';
import { ADA_TEACHER_PROMPT } from '$lib/prompts/adaTeacher';
import { pickPraiseFor} from '$lib/praise';
import { LESSON_FUNCTION_TOOLS, LessonContextManager } from '$lib/lesson-context';

const client = new OpenAI({ apiKey: OPENAI_API_KEY });

// Global context manager - In production, this should be session-based
let streamContextManager = new LessonContextManager();

// Function call handlers (same as non-streaming)
const handleStreamFunctionCall = (name: string, args: any) => {
  switch (name) {
    case 'get_lesson_progress':
      return streamContextManager.getLessonProgress();
    
    case 'analyze_student_code':
      return streamContextManager.analyzeStudentCode(args.code, args.context);
    
    case 'update_skill_assessment':
      streamContextManager.updateSkillAssessment(args.concept, args.status, args.evidence);
      return { success: true, message: `${args.concept} konsepti ${args.status} olarak güncellendi` };
    
    case 'suggest_practice_exercise':
      return { exercise: streamContextManager.suggestPracticeExercise(args.targetConcept, args.difficulty) };
    
    case 'track_session_activity':
      streamContextManager.trackSessionActivity(args.activity, args.duration);
      return { success: true, message: 'Aktivite kaydedildi' };
    
    case 'detect_current_lesson_topic':
      return streamContextManager.detectCurrentLessonTopic(args.editorContent || '');
    
    case 'set_lesson_context':
      streamContextManager.setLessonContext(args.topic, args.objective, args.lessonName);
      return { success: true, message: `Ders konusu ${args.topic} olarak belirlendi` };
    
    default:
      return { error: 'Unknown function' };
  }
};

export const POST: RequestHandler = async ({ request }) => {
  const { messages, model = 'gpt-4o-mini', temperature = 0.5 } = await request.json();

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

     // --- ÖVGÜ ENJEKSİYONU (ilk chunk olarak) ---
     /*
    const usePraise = Math.random() < 0.7;
    if (usePraise) {
      const praise = pickPraiseFor(messages, { rate: 0.6, lookback: 6, cooldownTurns: 1 });
      if (praise) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ delta: praise + '\n\n' })}\n\n`));
      }
    }*/
    // -------------------------------------------
      try {
        // First, make a non-streaming request to check for function calls
        const initialResponse = await client.chat.completions.create({
          model,
          messages,
          temperature,
          tools: LESSON_FUNCTION_TOOLS,
          tool_choice: 'auto',
          stream: false
        });

        const initialMessage = initialResponse.choices?.[0]?.message;
        let finalMessages = messages;

        // Handle function calls if present
        if (initialMessage?.tool_calls) {
          const functionResults = [];
          
          for (const toolCall of initialMessage.tool_calls) {
            if (toolCall.type === 'function') {
              const functionName = toolCall.function.name;
              const functionArgs = JSON.parse(toolCall.function.arguments);
              
              console.log(`Ada Teacher (stream) calling function: ${functionName}`, functionArgs);
              
              const result = handleStreamFunctionCall(functionName, functionArgs);
              functionResults.push({
                tool_call_id: toolCall.id,
                role: 'tool' as const,
                content: JSON.stringify(result)
              });
            }
          }

          // Prepare messages for the streaming response
          finalMessages = [
            ...messages,
            initialMessage,
            ...functionResults
          ];
        } else if (initialMessage?.content) {
          // If no function calls, stream the initial response
          const content = initialMessage.content;
          for (let i = 0; i < content.length; i += 10) {
            const chunk = content.slice(i, i + 10);
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ delta: chunk })}\n\n`));
            // Small delay for streaming effect
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          controller.enqueue(enc.encode('event: done\ndata: {}\n\n'));
          return;
        }

        // Stream the final response (after function calls if any)
        const ai = await client.chat.completions.create({
          model,
          messages: finalMessages,
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
