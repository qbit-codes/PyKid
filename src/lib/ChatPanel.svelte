<script lang="ts">
  let input = '';
  let systemPrompt = 'Kısa ve net yardımcı ol.';
  let history: { role: 'user' | 'assistant'; content: string }[] = [];
  let sending = false;

  async function ask() {
    const q = input.trim();
    if (!q || sending) return;
    sending = true;
    input = '';

    // Kullanıcı mesajını ayrı tut
    const userMsg = { role: 'user' as const, content: q };

    // >>> İSTEDİĞİN FETCH GÖVDESİ BURADA <<<
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: 'Kısa ve net yardımcı ol.' },
          ...history,          // önceki konuşma
          userMsg              // o anki giriş
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

    // Ekrana yaz: önce user, sonra assistant
    history = [...history, userMsg, aiMsg];
    sending = false;
  }
</script>

<style>
  .chat { display:flex; flex-direction:column; height:100%; border-left:1px solid #eee; }
  .msgs { flex:1; overflow:auto; padding:.75rem; display:flex; flex-direction:column; gap:.5rem; }
  .bubble { padding:.5rem .75rem; border-radius:.5rem; max-width:90%; }
  .user { align-self:flex-end; background:#eef; }
  .assistant { align-self:flex-start; background:#efe; }
  .row { display:flex; gap:.5rem; padding:.5rem; border-top:1px solid #eee; }
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
    <input
      placeholder="Model'e sor…"
      bind:value={input}
      on:keydown={(e) => e.key === 'Enter' && ask()}
      disabled={sending}
    />
    <button on:click={ask} disabled={sending}>Gönder</button>
  </div>
</div>
