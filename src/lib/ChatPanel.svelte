<script lang="ts">
  import { ADA_TEACHER_PROMPT } from '$lib/prompts/adaTeacher';
  
  // Props for getting current lesson context
  export let getCurrentEditorContent: () => string = () => '';

  let input = '';
  
  let systemPrompt = ADA_TEACHER_PROMPT; // Using enhanced Ada Teacher prompt
 
  let history: { role: 'user' | 'assistant'; content: string }[] = [];
  let sending = false;
  let hasInitialized = false;

  // Streaming mode selection checkbox
  let useStream = true;

  // Ada Teacher's proactive conversation starter with lesson context awareness
  async function initializeConversation() {
    if (hasInitialized || sending) return;
    hasInitialized = true;
    sending = true;

    try {
      // Get current editor content to understand lesson context
      const editorContent = getCurrentEditorContent();
      
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'system', content: `The student conversation is starting now. They haven't asked any questions yet. You should start the conversation! 
            
            IMPORTANT: First, detect what lesson topic the student is working on by looking at their code editor content. Then introduce yourself warmly and reference their current lesson topic. Be encouraging and let them know you're here to help with their specific lesson.
            
            Current editor content: "${editorContent || 'Empty - student just started'}"
            
            Use your detect_current_lesson_topic function to understand what they're working on, then greet them with context about their lesson.` },
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

    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
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

    try {
      const resp = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt },
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
