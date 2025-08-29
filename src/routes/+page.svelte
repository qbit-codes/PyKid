<script lang="ts">
  import loader from '@monaco-editor/loader';
  import { onMount, onDestroy } from 'svelte';
  import { usePyodide } from '$lib/pyodide';

  let editorEl: HTMLDivElement;
  let editor: any = null;
  let monacoLib: any = null;

  let output = '';
  let running = false;

  // Pyodide hazırlandığında içinde run metodu olan bir obje döner
  let pyodideReady = usePyodide();

  const initial = `# PyKid'e Hoş geldin!
print("Merhaba!")
`;

  onMount(async () => { monacoLib = await loader.init(); });
  $: if (editorEl && monacoLib && !editor) {
    editor = monacoLib.editor.create(editorEl, {
      value: initial, language: 'python', automaticLayout: true,
      fontSize: 14, minimap: { enabled: false }
    });
  }

  // >>> Sadece burada çağıracağız: py.run(editor.getValue())
  async function runCode(py: Awaited<ReturnType<typeof usePyodide>>) {
    if (!editor) return;
    output = ''; running = true;
    py.onStdout((s) => (output += s));
    py.onStderr((s) => (output += s));
    try { await py.run(editor.getValue()); }
    catch (e: any) { output += `\n[Hata] ${e?.message || e}`; }
    finally { running = false; }
  }
</script>
<style>
  .page { display: grid; grid-template-rows: 1fr 200px; height: 100vh; gap: .6rem; padding: .6rem; box-sizing: border-box; }
  .editor, .out { border: 1px solid #ddd; border-radius: .5rem; }
  .editor { height: 100%; width: 100%; overflow: hidden; } /* KRİTİK */
  .out { padding: .75rem; overflow: auto; white-space: pre-wrap; font-family: ui-monospace, Menlo, Consolas, monospace; }
  .toolbar { display:flex; gap:.5rem; align-items:center; padding:.5rem; border-bottom:1px solid #eee; }
</style>

{#await pyodideReady}
  <div>Pyodide yükleniyor…</div>
{:then py}
  <div class="page">
    <div class="editor" bind:this={editorEl}></div>
    <div class="out">
      <div class="toolbar">
        <button on:click={() => runCode(py)} disabled={running || !editor}>▶ Çalıştır</button>
        <button on:click={() => (output='')}>Temizle</button>
      </div>
      <div>{output || 'Çıktı burada görünecek.'}</div>
    </div>
  </div>
{:catch err}
  <div style="color:#b00">Pyodide başlatılamadı: {String(err)}</div>
{/await}