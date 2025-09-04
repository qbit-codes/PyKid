// ...existing code...
import { json } from '@sveltejs/kit';
import OpenAI from 'openai';
import { ADA_TEACHER_PROMPT } from '$lib/prompts/adaTeacher';
import { OPENAI_API_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';
import { pickPraiseFor} from '$lib/praise';
import { LESSON_FUNCTION_TOOLS, LessonContextManager } from '$lib/lesson-context';

const client = new OpenAI({ apiKey: OPENAI_API_KEY });

// Global context manager - In production, this should be session-based
let contextManager = new LessonContextManager();

// Function call handlers
const handleFunctionCall = (name: string, args: any) => {
  switch (name) {
    case 'get_lesson_progress':
      return contextManager.getLessonProgress();
    
    case 'analyze_student_code':
      return contextManager.analyzeStudentCode(args.code, args.context);
    
    case 'update_skill_assessment':
      contextManager.updateSkillAssessment(args.concept, args.status, args.evidence);
      return { success: true, message: `${args.concept} konsepti ${args.status} olarak güncellendi` };
    
    case 'suggest_practice_exercise':
      return { exercise: contextManager.suggestPracticeExercise(args.targetConcept, args.difficulty) };
    
    case 'track_session_activity':
      contextManager.trackSessionActivity(args.activity, args.duration);
      return { success: true, message: 'Aktivite kaydedildi' };
    
    case 'detect_current_lesson_topic':
      return contextManager.detectCurrentLessonTopic(args.editorContent || '');
    
    case 'set_lesson_context':
      contextManager.setLessonContext(args.topic, args.objective, args.lessonName);
      return { success: true, message: `Ders konusu ${args.topic} olarak belirlendi` };
    
    default:
      return { error: 'Unknown function' };
  }
};

// ...existing code...
export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (!messages.some((m: any) => m?.role === 'system')) {
    messages.unshift({ role: 'system', content: ADA_TEACHER_PROMPT });
  }
  // Basit doğrulama
  if (!messages.length) return json({ error: 'messages required' }, { status: 400 });
  if (messages.join(' ').length > 50_000) return json({ error: 'messages too long' }, { status: 400 });

  try {
    const resp = await client.chat.completions.create({
      model: body.model ?? 'gpt-4o-mini',   // istekten model param kontrolü
      messages,
      temperature: typeof body.temperature === 'number' ? body.temperature : 0.5,//0.7 idi
      max_tokens: typeof body.max_tokens === 'number' ? body.max_tokens : 800,
      tools: LESSON_FUNCTION_TOOLS,
      tool_choice: 'auto'
    });

    const message = resp.choices?.[0]?.message;
    let finalText = message?.content ?? '';

    // Handle function calls if present
    if (message?.tool_calls) {
      const functionResults = [];
      
      for (const toolCall of message.tool_calls) {
        if (toolCall.type === 'function') {
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments);
          
          console.log(`Ada Teacher calling function: ${functionName}`, functionArgs);
          
          const result = handleFunctionCall(functionName, functionArgs);
          functionResults.push({
            tool_call_id: toolCall.id,
            role: 'tool' as const,
            content: JSON.stringify(result)
          });
        }
      }

      // If there were function calls, make another request to get the final response
      if (functionResults.length > 0) {
        const followupMessages = [
          ...messages,
          message,
          ...functionResults
        ];

        const followupResp = await client.chat.completions.create({
          model: body.model ?? 'gpt-4o-mini',
          messages: followupMessages,
          temperature: typeof body.temperature === 'number' ? body.temperature : 0.5,
          max_tokens: typeof body.max_tokens === 'number' ? body.max_tokens : 800
        });

        finalText = followupResp.choices?.[0]?.message?.content ?? finalText;
      }
    }

    // 🔽 Eklenen 2 satır
    const praise = pickPraiseFor(messages, { rate: 0.6, lookback: 6, cooldownTurns: 1 });
    const usePraise = Math.random() < 0.7;
    const final = usePraise ? `${praise}\n\n${finalText}` : finalText;

    return json({ text: finalText});
    //return json({ text, usage: resp.usage ?? null });
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