<script lang="ts">
  import { ADA_TEACHER_PROMPT } from '$lib/prompts/adaTeacher';
  
  // Props for getting current lesson context
  export let getCurrentEditorContent: () => string = () => '';
  export let getCurrentLessonContext: () => string = () => '';
  export let onChatInteraction: () => void = () => {};
  export let onLessonStepChange: () => void = () => {};

  let input = '';
  
  let systemPrompt = ADA_TEACHER_PROMPT; // Using enhanced Ada Teacher prompt
 
  let history: { role: 'user' | 'assistant'; content: string }[] = [];
  let sending = false;
  let hasInitialized = false;

  // Streaming mode selection checkbox
  let useStream = true;

  // Function to update chat on lesson/step change
  export function updateForLessonChange() {
    if (!hasInitialized || sending) return;
    
    const lessonContext = getCurrentLessonContext();
    const editorContent = getCurrentEditorContent();
    
    if (lessonContext) {
      // Extract lesson and step info from context
      const contextParts = lessonContext.split(' ');
      let lessonTitle = 'yeni bir konuya';
      let stepTitle = '';
      
      // Try to extract meaningful lesson/step names
      const titleMatch = lessonContext.match(/"([^"]+)"/g);
      if (titleMatch && titleMatch.length >= 2) {
        lessonTitle = titleMatch[0].replace(/"/g, '');
        stepTitle = titleMatch[1].replace(/"/g, '');
      }
      
      // Create contextual welcome message
      let welcomeMessage = `🎯 Yeni adıma hoş geldin! `;
      
      if (stepTitle) {
        welcomeMessage += `Şimdi "${stepTitle}" konusunda çalışıyoruz. `;
      }
      
      // Add specific help based on content
      if (lessonContext.includes('alıştırma')) {
        welcomeMessage += `Bu alıştırmada takıldığın bir yer olursa, çekinmeden sor! Kodunu adım adım inceler ve ipuçları veririm. 💡`;
      } else if (lessonContext.includes('teori')) {
        welcomeMessage += `Bu konuyu anlamana yardım edebilirim. Merak ettiğin bir şey var mı? 🤔`;
      } else {
        welcomeMessage += `Bu konuda sana nasıl yardımcı olabilirim? Sorularını bekliyorum! 😊`;
      }
      
      // Add the lesson change notification to history
      history = [...history, {
        role: 'assistant',
        content: welcomeMessage
      }];
    }
  }

  // Ada Teacher's proactive conversation starter with lesson context awareness
  async function initializeConversation() {
    if (hasInitialized || sending) return;
    hasInitialized = true;
    sending = true;

    try {
      // Get current editor content and lesson context
      const editorContent = getCurrentEditorContent();
      const lessonContext = getCurrentLessonContext();
      
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'system', content: `The student conversation is starting now. They haven't asked any questions yet. You should start the conversation! 
            
            IMPORTANT: The student is currently working on a structured lesson. Use the lesson context provided to give personalized, relevant guidance.
            
            Current lesson context: "${lessonContext || 'No specific lesson selected'}"
            Current editor content: "${editorContent || 'Empty - student just started'}"
            
            Introduce yourself warmly and reference their current lesson. Be encouraging and let them know you're here to help with their specific lesson step.` },
            { role: 'user', content: 'Hello Ada' }
          ]
        })
      });

      if (resp.ok) {
        const result = await resp.json();
        history = [
          { role: 'assistant', content: result.text ?? 'Merhaba! Ben Ada, senin Python öğretmenin! 👋' }
        ];
      } else {
        // Fallback message if API call fails
        history = [
          { role: 'assistant', content: 'Merhaba! Ben Ada, senin Python öğretmenin! Seninle Python öğrenmeyi sabırsızlıkla bekliyorum! 🐍✨' }
        ];
      }
    } catch (error) {
      // Fallback message on error
      history = [
        { role: 'assistant', content: 'Merhaba! Ben Ada, senin Python öğretmenin! Seninle Python öğrenmeyi sabırsızlıkla bekliyorum! 🐍✨' }
      ];
    } finally {
      sending = false;
    }
  }

  // Initialize conversation when component mounts
  import { onMount } from 'svelte';
  onMount(() => {
    // Start Ada's initial message after a short delay
    setTimeout(initializeConversation, 500);
  });

  // Standard non-streaming chat request
  async function ask() {
    const q = input.trim();
    if (!q || sending) return;
    sending = true;
    input = '';

    const userMsg = { role: 'user' as const, content: q };
    
    // Include current lesson context in system message
    const lessonContext = getCurrentLessonContext();
    const editorContent = getCurrentEditorContent();
    const contextMessage = lessonContext ? 
      `\n\nCurrent lesson context: ${lessonContext}\nCurrent editor content: ${editorContent}` : '';

    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt + contextMessage },
          ...history,
          userMsg
        ]
      })
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      history = [
        ...history,
        userMsg,
        { role: 'assistant', content: `Üzgünüm, sunucu hatası (${r.status}). ${errText}` }
      ];
      sending = false;
      return;
    }

    const j = await r.json();
    const aiMsg = { role: 'assistant' as const, content: j.text ?? '' };
    history = [...history, userMsg, aiMsg];
    sending = false;
  }

  // Streaming version of chat request (tokens arrive incrementally)
  async function askStream() {
    const q = input.trim();
    if (!q || sending) return;
    sending = true;
    input = '';

    const userMsg = { role: 'user' as const, content: q };
    // Add empty assistant message that will be filled during streaming
    history = [...history, userMsg, { role: 'assistant', content: '' }];
    const aiIndex = history.length - 1;

    // Include current lesson context in system message
    const lessonContext = getCurrentLessonContext();
    const editorContent = getCurrentEditorContent();
    const contextMessage = lessonContext ? 
      `\n\nCurrent lesson context: ${lessonContext}\nCurrent editor content: ${editorContent}` : '';

    try {
      const resp = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt + contextMessage },
            ...history.slice(0, -1) // Don't send the empty assistant message
          ]
        })
      });

      if (!resp.ok || !resp.body) {
        const text = !resp.ok ? `HTTP ${resp.status}` : 'Empty stream body';
        history[aiIndex].content = `Stream failed to start: ${text}`;
        history = [...history];
        sending = false;
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const evt of events) {
          if (!evt) continue;
          if (evt.startsWith('event: done')) continue;

          const dataLine = evt.split('\n').find((l) => l.startsWith('data: '));
          if (!dataLine) continue;

          try {
            const { delta } = JSON.parse(dataLine.slice(6));
            if (delta) {
              history[aiIndex].content += delta;
              history = [...history]; // Trigger re-render
            }
          } catch { /* Ignore parsing errors */ }
        }
      }
    } catch (e: any) {
      history[aiIndex].content = `Stream error: ${e?.message || e}`;
      history = [...history];
    } finally {
      sending = false;
    }
  }

  // Single submit function - routes to streaming or non-streaming based on checkbox
  function submit() {
    // Track chat interaction
    onChatInteraction();
    
    return useStream ? askStream() : ask();
  }
</script>

<style>
  .chat { display:flex; flex-direction:column; height:100%; border-left:1px solid #eee; }
  .msgs { flex:1; overflow:auto; padding:.75rem; display:flex; flex-direction:column; gap:.5rem; }
  .bubble { padding:.5rem .75rem; border-radius:.5rem; max-width:90%; }
  .user { align-self:flex-end; background:#eef; }
  .assistant { align-self:flex-start; background:#efe; }
  .row { display:flex; gap:.5rem; padding:.5rem; border-top:1px solid #eee; align-items:center; }
  input { flex:1; padding:.5rem .6rem; border:1px solid #ddd; border-radius:.5rem; }
  button { padding:.45rem .75rem; }
</style>

<div class="chat">

  <div class="msgs">
    {#each history as m}
      <div class="bubble {m.role}">{m.content}</div>
    {/each}
  </div>
  <div class="row">
    <!-- Streaming checkbox (commented out for now) -->
    <!-- <label><input type="checkbox" bind:checked={useStream} /> Streaming</label> -->

    <input
      placeholder="Ada'ya sor…"
      bind:value={input}
      on:keydown={(e) => e.key === 'Enter' && submit()}
      disabled={sending}
    />
    <!-- Single submit button - uses streaming or non-streaming based on useStream -->
    <button on:click={submit} disabled={sending}>Gönder</button>
  </div>
</div>
