import { json } from '@sveltejs/kit';
import OpenAI from 'openai';
import { OPENAI_API_KEY } from '$env/static/private';
import { CODE_VALIDATION_PROMPT } from '$lib/prompts/adaTeacher';
import type { RequestHandler } from './$types';

const client = new OpenAI({ apiKey: OPENAI_API_KEY });

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const { code, lessonContext } = body;

    if (!code || typeof code !== 'string') {
      return json({ error: 'Code is required' }, { status: 400 });
    }

    if (code.length > 5000) {
      return json({ error: 'Code too long' }, { status: 400 });
    }

    const contextInfo = lessonContext ? 
      `\n\nDERS BAĞLAMI: ${JSON.stringify(lessonContext)}` : '';

    const validationPrompt = `${CODE_VALIDATION_PROMPT}${contextInfo}

DEĞERLENDIRILECEK KOD:
\`\`\`python
${code}
\`\`\``;

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: validationPrompt }
      ],
      temperature: 0.3,
      max_tokens: 800,
      response_format: { type: 'json_object' }
    });

    const validationResult = response.choices?.[0]?.message?.content;
    
    if (!validationResult) {
      throw new Error('No validation result received');
    }

    const parsedResult = JSON.parse(validationResult);
    
    // Ensure required fields exist and validate them
    const result = {
      isValid: Boolean(parsedResult.isValid),
      confidence: Math.max(0, Math.min(1, Number(parsedResult.confidence) || 0.5)),
      feedback: parsedResult.feedback || 'Kod analiz edildi.',
      suggestions: Array.isArray(parsedResult.suggestions) ? parsedResult.suggestions : [],
      errorType: ['syntax', 'logic', 'style', 'concept', 'none'].includes(parsedResult.errorType) 
        ? parsedResult.errorType 
        : null,
      educationalNotes: parsedResult.educationalNotes || ''
    };

    return json({ 
      validation: result,
      usage: response.usage ?? null 
    });

  } catch (err: any) {
    console.error('Code validation error:', err);
    
    // Fallback response for errors
    return json({ 
      validation: {
        isValid: false,
        confidence: 0.1,
        feedback: 'Kod doğrulama sırasında bir hata oluştu. Kodu çalıştırmayı deneyebilirsin.',
        suggestions: ['Kodu tekrar kontrol et ve çalıştırmayı dene'],
        errorType: 'system',
        educationalNotes: 'Sistem hatası nedeniyle doğrulama yapılamadı.'
      },
      error: err?.message ?? String(err)
    }, { status: 200 }); // Return 200 with fallback validation
  }
};

export const OPTIONS: RequestHandler = async () =>
  new Response(null, { status: 204 });