<script lang="ts">
  import loader from '@monaco-editor/loader';
  import { onMount, onDestroy } from 'svelte';
  import { usePyodide } from '$lib/pyodide';
  import ChatPanel from '$lib/ChatPanel.svelte';

  let shellEl: HTMLDivElement;   // dış grid
  let pageEl: HTMLDivElement;    // sağ taraftaki (editor+konsol) grid
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

  // ---- Split ölçüleri (persist edilir) ----
  let leftPx = 380;      // sol panel (Chat) px genişlik
  let rowTopPx = 0;      // sağ tarafta editor'ün px yüksekliği (0 -> hesapla)

  // ARIA/bounds
  let minLeft = 260;
  let maxLeft = 1200;

  let minTopPx = 160;   // editor min
  let minBotPx = 140;   // konsol min
  let maxTopPx = 0;     // height - minBotPx

  const LS_LEFT = 'pysplit:leftPx';
  const LS_ROW  = 'pysplit:rowTopPx';

  onMount(async () => {
    monacoLib = await loader.init();

    const l = Number(localStorage.getItem(LS_LEFT));
    if (!Number.isNaN(l) && l > 0) leftPx = l;

    const r = Number(localStorage.getItem(LS_ROW));
    if (!Number.isNaN(r) && r > 0) rowTopPx = r;

    requestAnimationFrame(() => {
      clampLeft();
      clampRows();
    });
  });

  onDestroy(() => {});

  $: if (editorEl && monacoLib && !editor) {
    editor = monacoLib.editor.create(editorEl, {
      value: initial,
      language: 'python',
      automaticLayout: true,
      fontSize: 14,
      minimap: { enabled: false }
    });
  }

  // Split: sol genişlik drag
  function clampLeft() {
    if (!shellEl) return;
    const { width } = shellEl.getBoundingClientRect();
    minLeft = 260;
    maxLeft = Math.max(minLeft + 160, width - 360);
    leftPx = Math.min(maxLeft, Math.max(minLeft, leftPx));
    localStorage.setItem(LS_LEFT, String(leftPx));
  }

  // Split: üst (editor) yükseklik drag
  function clampRows() {
    if (!pageEl) return;
    const { height } = pageEl.getBoundingClientRect();
    maxTopPx = height - minBotPx;

    if (rowTopPx <= 0) {
      rowTopPx = Math.max(minTopPx, height - 220);
    }
    rowTopPx = Math.min(maxTopPx, Math.max(minTopPx, rowTopPx));
    localStorage.setItem(LS_ROW, String(rowTopPx));
  }

  let dragKind: 'col' | 'row' | null = null;

  function startColDrag(e: PointerEvent) {
    if (!shellEl) return;
    dragKind = 'col';
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    document.body.classList.add('resizing-col');
  }
  function startRowDrag(e: PointerEvent) {
    if (!pageEl) return;
    dragKind = 'row';
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    document.body.classList.add('resizing-row');
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragKind) return;
    if (dragKind === 'col' && shellEl) {
      const rect = shellEl.getBoundingClientRect();
      leftPx = e.clientX - rect.left;
      clampLeft();
    } else if (dragKind === 'row' && pageEl) {
      const rect = pageEl.getBoundingClientRect();
      rowTopPx = e.clientY - rect.top;
      clampRows();
      editor?.layout?.();
    }
  }

  function endDrag(e: PointerEvent) {
    if (!dragKind) return;
    dragKind = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    document.body.classList.remove('resizing-col');
    document.body.classList.remove('resizing-row');
    clampLeft();
    clampRows();
    editor?.layout?.();
  }

  function resetCols() {
    if (!shellEl) return;
    const { width } = shellEl.getBoundingClientRect();
    leftPx = Math.max(minLeft, Math.min(width - 360, Math.round(width * 0.30)));
    clampLeft();
    editor?.layout?.();
  }

  function resetRows() {
    if (!pageEl) return;
    const { height } = pageEl.getBoundingClientRect();
    rowTopPx = Math.max(minTopPx, Math.min(height - minBotPx, height - 220));
    clampRows();
    editor?.layout?.();
  }

  async function runCode(py: Awaited<ReturnType<typeof usePyodide>>) {
    if (!editor) return;
    output = '';
    running = true;
    py.onStdout((s) => { if (s) output += s; });
    py.onStderr((s) => { if (s) output += s; });

    try { await py.run(editor.getValue()); }
    catch (e: any) { output += `\n[Hata] ${e?.message || e}`; }
    finally { running = false; }
  }
</script>

<style>
  :global(html, body) { height: 100%; margin: 0; overflow: hidden; }
  :global(body.resizing-col) { cursor: col-resize; user-select: none; }
  :global(body.resizing-row) { cursor: row-resize; user-select: none; }

  .shell {
    display: grid;
    grid-template-columns: minmax(260px, 30%) 8px 1fr; /* JS inline override */
    gap: .75rem;
    height: 100vh;
    padding: .6rem;
    box-sizing: border-box;
  }

  .chatPane {
    height: 100%;
    border: 1px solid #eee;
    border-radius: .5rem;
    overflow: hidden;
    min-height: 0;
  }

  .gutter-v {
    cursor: col-resize;
    background: repeating-linear-gradient(
      to bottom,
      #ddd, #ddd 2px,
      transparent 2px, transparent 6px
    );
    border-radius: .5rem;
  }

  .page {
    display: grid;
    grid-template-rows: 1fr 8px 220px; /* JS inline override */
    height: 100%;
    gap: .6rem;
    min-height: 0;
  }

  .gutter-h {
    cursor: row-resize;
    background: repeating-linear-gradient(
      to right,
      #ddd, #ddd 2px,
      transparent 2px, transparent 6px
    );
    border-radius: .5rem;
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
    overflow: auto;
    white-space: pre-wrap;
    font-family: ui-monospace, Menlo, Consolas, monospace;
    overflow-anchor: none;
  }

  /* Odak belirtimi — a11y */
  .gutter-v:focus, .gutter-h:focus {
    outline: 2px solid #6aa1ff;
    outline-offset: 2px;
  }
</style>

{#await pyodideReady}
  <div>Pyodide yükleniyor…</div>
{:then py}
  <div
    class="shell"
    bind:this={shellEl}
    style={`grid-template-columns:${leftPx}px 8px 1fr;`}
    on:pointermove={onPointerMove}
    on:pointerup={endDrag}
    on:pointercancel={endDrag}
  >
    <!-- SOL: Chat -->
    <div class="chatPane">
      <ChatPanel />
    </div>

    <!-- DİKEY GUTTER (Chat ↔ IDE) -->
    <div
      class="gutter-v"
      role="slider"
      aria-orientation="vertical"
      aria-label="Panel boyutlandırma"
      aria-valuemin={minLeft}
      aria-valuemax={maxLeft}
      aria-valuenow={leftPx}
      tabindex="0"
      on:pointerdown={startColDrag}
      on:dblclick={resetCols}
      on:keydown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); resetCols(); }
        if (e.key === 'ArrowLeft')  { leftPx -= 16; clampLeft(); editor?.layout?.(); }
        if (e.key === 'ArrowRight') { leftPx += 16; clampLeft(); editor?.layout?.(); }
      }}
    ></div>

    <!-- SAĞ: IDE + Konsol -->
    <div
      class="page"
      bind:this={pageEl}
      style={`grid-template-rows:${rowTopPx ? `${rowTopPx}px` : '1fr'} 8px 1fr;`}
    >
      <div class="editor" bind:this={editorEl}></div>

      <!-- YATAY GUTTER (Editor ↔ Konsol) -->
      <div
        class="gutter-h"
        role="slider"
        aria-orientation="horizontal"
        aria-label="Panel boyutlandırma"
        aria-valuemin={minTopPx}
        aria-valuemax={maxTopPx}
        aria-valuenow={rowTopPx}
        tabindex="0"
        on:pointerdown={startRowDrag}
        on:dblclick={resetRows}
        on:keydown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); resetRows(); }
          if (e.key === 'ArrowUp')   { rowTopPx -= 16; clampRows(); editor?.layout?.(); }
          if (e.key === 'ArrowDown') { rowTopPx += 16; clampRows(); editor?.layout?.(); }
        }}
      ></div>

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
