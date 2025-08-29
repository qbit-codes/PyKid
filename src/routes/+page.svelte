<script lang="ts">
  import loader from '@monaco-editor/loader';
  import { onMount } from 'svelte';
  import { usePyodide } from '$lib/pyodide';
  import ChatPanel from '$lib/ChatPanel.svelte';

  let editorEl: HTMLDivElement;
  let outEl: HTMLDivElement;
  let editor: any = null;
  let monacoLib: any = null;

  let output = '';
  let running = false;

  const pyodideReady = usePyodide();

  const initial = `# PyKid'e Hoş geldin!
print("Merhaba!")
`;

  onMount(async () => {
    monacoLib = await loader.init();
  });

  $: if (editorEl && monacoLib && !editor) {
    editor = monacoLib.editor.create(editorEl, {
      value: initial,
      language: 'python',
      automaticLayout: true,
      fontSize: 14,
      minimap: { enabled: false }
    });
  }

  async function runCode(py: Awaited<ReturnType<typeof usePyodide>>) {
    if (!editor) return;
    output = '';
    running = true;

    // sadece metni ekle — AUTOSCROLL YOK
    py.onStdout((s) => { if (s) output += s; });
    py.onStderr((s) => { if (s) output += s; });

    try { await py.run(editor.getValue()); }
    catch (e: any) { output += `\n[Hata] ${e?.message || e}`; }
    finally { running = false; }
  }
</script>

<style>
  /* Sayfa scroll'unu kilitle, sadece paneller kayar */
  :global(html, body) { height: 100%; margin: 0; overflow: hidden; }

  /* 2 kolon: sol %30 chat, sağ %70 IDE */
  .shell {
    display: grid;
    grid-template-columns: minmax(260px, 30%) 1fr; /* sol min 260px */
    gap: .75rem;
    height: 100vh;
    padding: .6rem;
    box-sizing: border-box;
  }

  /* Sol panel (Chat) */
  .chatPane {
    height: 100%;
    border: 1px solid #eee;
    border-radius: .5rem;
    overflow: hidden;      /* ChatPanel kendi içinde scroll yapsın */
    min-height: 0;
  }

  /* Sağ panel (IDE+Konsol) */
  .page {
    display: grid;
    grid-template-rows: 1fr 220px;  /* editor + sabit 220px konsol */
    height: 100%;
    gap: .6rem;
    min-height: 0;                  /* grid child'ı taşmasın */
  }

  .editor, .out {
    border: 1px solid #ddd;
    border-radius: .5rem;
    min-height: 0;
  }

  .editor { height: 100%; overflow: hidden; }

  .out {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .toolbar {
    display: flex;
    gap: .5rem;
    align-items: center;
    padding: .5rem;
    border-bottom: 1px solid #eee;
    flex: 0 0 auto;
  }

  .log {
    flex: 1 1 auto;
    padding: .75rem;
    overflow: auto;              /* sadece bu kutu scroll */
    white-space: pre-wrap;
    font-family: ui-monospace, Menlo, Consolas, monospace;
    overflow-anchor: none;       /* tarayıcı “aşağıyı takip” etmesin */
  }
</style>

{#await pyodideReady}
  <div>Pyodide yükleniyor…</div>
{:then py}
  <div class="shell">
    <!-- SOL %30: ChatGPT -->
    <div class="chatPane">
      <ChatPanel />
    </div>

    <!-- SAĞ %70: IDE + Konsol -->
    <div class="page">
      <div class="editor" bind:this={editorEl}></div>

      <div class="out" bind:this={outEl}>
        <div class="toolbar">
          <button on:click={() => runCode(py)} disabled={running || !editor}>▶ Çalıştır</button>
          <button on:click={() => (output='')}>Temizle</button>
        </div>
        <div class="log">{output || 'Çıktı burada görünecek.'}</div>
      </div>
    </div>
  </div>
{:catch err}
  <div style="color:#b00">Pyodide başlatılamadı: {String(err)}</div>
{/await}
