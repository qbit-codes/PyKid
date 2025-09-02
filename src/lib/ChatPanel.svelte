<script lang="ts">
  let input = '';
  let systemPrompt = 'Kısa ve net yardımcı ol.';
  let history: { role: 'user' | 'assistant'; content: string }[] = [];
  let sending = false;

  // ✅ Sadece bu: checkbox ile streaming seçimi
  let useStream = false;

  // --- Mevcut klasik istek ---
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
          { role: 'system', content: 'Kısa ve net yardımcı ol.' },
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

  // --- Streaming sürümü (tek fark: token token akar) ---
  async function askStream() {
    const q = input.trim();
    if (!q || sending) return;
    sending = true;
    input = '';

    const userMsg = { role: 'user' as const, content: q };
    // boş assistant mesajını ekleyip akışta dolduracağız
    history = [...history, userMsg, { role: 'assistant', content: '' }];
    const aiIndex = history.length - 1;

    try {
      const resp = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'Kısa ve net yardımcı ol.' },
            ...history.slice(0, -1) // son boş assistant'ı gönderme
          ]
        })
      });

      if (!resp.ok || !resp.body) {
        const text = !resp.ok ? `HTTP ${resp.status}` : 'Boş akış gövdesi';
        history[aiIndex].content = `Akış başlatılamadı: ${text}`;
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
              history = [...history]; // re-render
            }
          } catch { /* yut */ }
        }
      }
    } catch (e: any) {
      history[aiIndex].content = `Akış hatası: ${e?.message || e}`;
      history = [...history];
    } finally {
      sending = false;
    }
  }

  // ✅ Tek buton / Enter hep buradan çalışır, checkbox'a göre yönlendirir
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
    <!-- ✅ Sadece bir checkbox eklendi -->
    <label><input type="checkbox" bind:checked={useStream} /> Streaming</label>

    <input
      placeholder="Model'e sor…"
      bind:value={input}
      on:keydown={(e) => e.key === 'Enter' && submit()}
      disabled={sending}
    />
    <!-- ✅ Tek buton: checkbox’a göre ask() veya askStream() -->
    <button on:click={submit} disabled={sending}>Gönder</button>
  </div>
</div>
