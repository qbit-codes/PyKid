<script lang="ts">
  import loader from '@monaco-editor/loader';
  import { onMount, onDestroy } from 'svelte';
  import { usePyodide } from '$lib/pyodide';
  import ChatPanel from '$lib/ChatPanel.svelte';

  let shellEl: HTMLDivElement;   // dış grid
  let pageEl: HTMLDivElement;    // sağ taraftaki (editor+konsol) grid
  let editorEl: HTMLDivElement;
  let outEl: HTMLDivElement;

  // Sol iç grid: Video + Chat
  let leftPaneEl: HTMLDivElement;
  let videoEl: HTMLVideoElement;

  let editor: any = null;
  let monacoLib: any = null;
  let output = '';
  let running = false;

  const pyodideReady = usePyodide();

  // Başlangıç Python kodu
  const initial = `# PyKid'e Hoş geldin!
print("Merhaba!")
`;

  // ---- Split ölçüleri (persist edilir) ----
  let leftPx = 380;   // sol panel (Video+Chat sütunu) px genişlik
  let rowTopPx = 0;   // sağ tarafta editor'ün px yüksekliği (0 -> hesapla)

  // ARIA/bounds
  let minLeft = 260;
  let maxLeft = 1200;

  let minTopPx = 160;   // sağ: editor min
  let minBotPx = 140;   // sağ: konsol min
  let maxTopPx = 0;     // height - minBotPx

  // Sol iç grid: Video yüksekliği
  let videoPx = 180;
  const minVideoPx = 120;
  let maxVideoPx = 600;

  const LS_LEFT  = 'pysplit:leftPx';
  const LS_ROW   = 'pysplit:rowTopPx';
  const LS_VIDEO = 'pysplit:videoPx';

  onMount(async () => {
    monacoLib = await loader.init();

    const l = Number(localStorage.getItem(LS_LEFT));
    if (!Number.isNaN(l) && l > 0) leftPx = l;

    const r = Number(localStorage.getItem(LS_ROW));
    if (!Number.isNaN(r) && r > 0) rowTopPx = r;

    const v = Number(localStorage.getItem(LS_VIDEO));
    if (!Number.isNaN(v) && v > 0) videoPx = v;

    requestAnimationFrame(() => {
      clampLeft();
      clampRows();
      clampVideo();
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

  // --- Dış sütun: sol genişlik drag ---
  function clampLeft() {
    if (!shellEl) return;
    const { width } = shellEl.getBoundingClientRect();
    minLeft = 260;
    maxLeft = Math.max(minLeft + 160, width - 360);
    leftPx = Math.min(maxLeft, Math.max(minLeft, leftPx));
    localStorage.setItem(LS_LEFT, String(leftPx));
  }

  // --- Sağ taraf: üst (editor) yükseklik drag ---
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

  // --- Sol iç grid: video yüksekliği drag ---
  function clampVideo() {
    if (!leftPaneEl) return;
    const { height } = leftPaneEl.getBoundingClientRect();
    const minChatPx = 240; // altta chat'e nefes
    maxVideoPx = Math.max(minVideoPx, height - 8 /*gutter*/ - minChatPx);
    videoPx = Math.min(maxVideoPx, Math.max(minVideoPx, videoPx));
    localStorage.setItem(LS_VIDEO, String(videoPx));
  }

  // Dış drag state
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

  // Sol iç grid (Video) drag state
  let dragKindLeft: 'left-row' | null = null;

  function startLeftRowDrag(e: PointerEvent) {
    if (!leftPaneEl) return;
    dragKindLeft = 'left-row';
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    document.body.classList.add('resizing-row');
  }

  function onPointerMoveLeft(e: PointerEvent) {
    if (dragKindLeft !== 'left-row' || !leftPaneEl) return;
    const rect = leftPaneEl.getBoundingClientRect();
    videoPx = e.clientY - rect.top;
    clampVideo();
  }

  function endLeftDrag(e: PointerEvent) {
    if (!dragKindLeft) return;
    dragKindLeft = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    document.body.classList.remove('resizing-row');
    clampVideo();
  }

  function resetVideo() {
    videoPx = 180;
    clampVideo();
  }

  async function runCode(py: Awaited<ReturnType<typeof usePyodide>>) {
    if (!editor) return;
    output = '';
    running = true;

    py.onStdout((s) => { if (s) output += s; });
    py.onStderr((s) => { if (s) output += s; });

    try {
      await py.run(editor.getValue());
    } catch (e: any) {
      output += `\n[Hata] ${e?.message || e}`;
    } finally {
      running = false;
    }
  }
</script>
<!--
<style>
  :global(html, body) {
    height: 100%;
    margin: 0;
    overflow: hidden;
  }
  :global(body.resizing-col) {
    cursor: col-resize;
    user-select: none;
  }
  :global(body.resizing-row) {
    cursor: row-resize;
    user-select: none;
  }

  .shell {
    display: grid;
    grid-template-columns: minmax(260px, 30%) 8px 1fr; /* JS ile override */
    gap: .75rem;
    height: 100vh;
    padding: .6rem;
    box-sizing: border-box;
  }

  /* Sol iç grid: Video + Gutter + Chat */
  .leftPane {
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-rows: 180px 8px 1fr; /* JS ile override */
    gap: .6rem;
  }

  .chatPane {
    height: 100%;
    border: 1px solid #eee;
    border-radius: .5rem;
    overflow: hidden;
    min-height: 0;
  }

  .videoPane {
    border: 1px solid #eee;
    border-radius: .5rem;
    overflow: hidden;
    min-height: 0;
    background: #000;
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
    grid-template-rows: 1fr 8px 220px; /* JS ile override */
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

  .editor {
    height: 100%;
    overflow: hidden;
  }

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

  button {
    padding: .4rem .7rem;
    border-radius: .4rem;
    border: 1px solid #ddd;
    background: #f7f7f7;
    cursor: pointer;
  }
  button:disabled {
    opacity: .6;
    cursor: not-allowed;
  }
</style>-->
<style>
  /* ==== Tokenlar ==== */
  :global(:root){
    --bg: #c9c8c5;
    --panel: #ffffff;
    --line: #e8edf5;
    --text: #0f172a;

    --accent: #b4bcca;
    --accent-weak: #eaf2ff;

    --radius: 16px;
    --shadow: 0 12px 32px rgba(130, 135, 146, 0.1);

    /* glass */
    --glass-bg: rgba(255,255,255,.45);
    --glass-border: rgba(255,255,255,.36);
    --glass-blur: 18px;
  }

  /* ==== Arkaplan (blur’un arkasında renk) ==== */
  :global(html, body){
    height:100%; margin:0; overflow:hidden; color:var(--text);
    background:
      radial-gradient(1100px 700px at 8% -10%, #cfe6ff 0%, rgba(207,230,255,0) 40%),
      radial-gradient(900px 700px at 100% -5%, #ffe4ef 0%, rgba(255,228,239,0) 45%),
      var(--bg);
  }

  /* ==== Grid yerleşimi ==== */
  .shell{
    display:grid;
    grid-template-columns:minmax(260px,32%) 10px 1fr; /* JS override */
    gap:.9rem; height:100vh; padding:.9rem; box-sizing:border-box;
  }
  .leftPane{
    height:100%; min-height:0; display:grid;
    grid-template-rows:200px 10px 1fr; /* JS override */
    gap:.9rem;
  }
  .page{
    display:grid;
    grid-template-rows:1fr 10px 260px; /* JS override */
    height:100%; gap:.9rem; min-height:0;
  }

  /* ==== Glass Kartlar ==== */
  :is(.chatPane, .editor, .out, .videoWrap){
    position: relative;
    border-radius: var(--radius);
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    box-shadow: var(--shadow),
                inset 0 .5px 0 rgba(255,255,255,.55),
                inset 0 -1px 0 rgba(15,23,42,.08);
    backdrop-filter: saturate(160%) blur(var(--glass-blur));
    -webkit-backdrop-filter: saturate(160%) blur(var(--glass-blur));
    min-height:0; overflow: clip;
  }
  :is(.chatPane, .editor, .out, .videoWrap)::after{
    content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
    background:
      linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,0) 42%) top/100% 50% no-repeat,
      linear-gradient(0deg,  rgba(0,0,0,.06),       rgba(0,0,0,0) 42%) bottom/100% 50% no-repeat;
    mix-blend-mode: soft-light;
  }
  @supports not (backdrop-filter: blur(1px)){
    :is(.chatPane, .editor, .out, .videoWrap){
      background:#fff; border:1px solid var(--line); box-shadow: var(--shadow);
    }
  }

  /* ==== İçerikler camı kapatmasın diye: padding + şeffaf alt katmanlar ==== */
  .chatPane{ padding:8px; }
  .editor{ padding:8px; overflow:hidden; }
  .out{ overflow:hidden; }

  /* ChatPanel içi şeffaf olsun (cam görünsün) */
  .chatPane :global(.chat){ background: transparent; }
  .chatPane :global(.row){ background: transparent; }

  /* Monaco arka planlarını tamamen şeffaf yap */
  .editor :global(.monaco-editor),
  .editor :global(.monaco-editor .overflow-guard),
  .editor :global(.monaco-editor .margin),
  .editor :global(.monaco-editor-background),
  .editor :global(.monaco-scrollable-element){
    background: transparent !important;
  }

  /* Video alanı (cam çerçeve için sarmalayıcı) */
  .videoWrap{ padding:8px; }
  video{ width:100%; height:100%; object-fit:contain; background:#000; border-radius:12px; }

  /* ==== Gutter’lar ==== */
  .gutter-v, .gutter-h{
    border-radius:999px;
    background:
      repeating-linear-gradient(to right,#d9e1f1,#d9e1f1 2px,transparent 2px,transparent 8px);
  }
  .gutter-v{ cursor: col-resize; width:10px; }
  .gutter-h{ cursor: row-resize; height:10px; }
  .gutter-v:focus, .gutter-h:focus{ outline:3px solid var(--accent); outline-offset:2px; }

  /* ==== Konsol ==== */
  .toolbar{
    display:flex; gap:.5rem; align-items:center;
    padding:.55rem .9rem; border-bottom:1px solid var(--line);
    background: linear-gradient(180deg, var(--accent-weak), #fff);
    border-top-left-radius: var(--radius);
    border-top-right-radius: var(--radius);
  }
  .toolbar button:first-child{
    background: var(--accent); color:#fff; border: none;
    box-shadow: 0 8px 18px rgba(37,99,235,.28);
  }
  .log{
    flex:1 1 auto; padding:1rem;
    overflow:auto; white-space:pre-wrap;
    font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size:14px;
    background: transparent;
  }

  /* ==== Chat okunabilirliği ==== */
  :global(.chat .msgs){ max-width:70ch; margin-inline:auto; padding:.9rem; }
  :global(.chat .bubble){ padding:.7rem 1rem; border-radius:1.1rem; box-shadow: var(--shadow); }
  :global(.chat .user){ background: var(--accent-weak); }
  :global(.chat .assistant){ background:#f3faf6; border:1px solid #ddefe5; }

  /* === IDE (Monaco) odak kenarını kapat === */
  .editor, .editor:focus, .editor:focus-within {
    outline: none !important;
  }

  /* Monaco’nun kendi focus/outline/box-shadow'u */
  .editor :global(.monaco-editor),
  .editor :global(.monaco-editor:focus),
  .editor :global(.monaco-editor.focused),
  .editor :global(.monaco-editor .inputarea:focus) {
    outline: none !important;
    box-shadow: none !important;
  }

  /* Monaco’nun kenar çizgileri (margin/overflow-guard) */
  .editor :global(.monaco-editor .margin),
  .editor :global(.monaco-editor .overflow-guard) {
    border: none !important;
  }

  /* VSCode/Monaco teması odak rengi değişkeni */
  :global(:root) {
    --vscode-focusBorder: transparent;
  }

  /* (Opsiyonel) Editör cam çerçeve sınırını da tamamen kaldırmak istersen: */
  /* .editor { border: none !important; } */

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
    <!-- SOL: Video + Chat (iç grid) -->
    <div
      class="leftPane"
      bind:this={leftPaneEl}
      style={`grid-template-rows:${videoPx}px 8px 1fr;`}
      on:pointermove={onPointerMoveLeft}
      on:pointerup={endLeftDrag}
      on:pointercancel={endLeftDrag}
    >
      <!-- Video Panel (cam/blur kart) -->
      <div >
        <video
          bind:this={videoEl}
          controls
          playsinline
          style="width:100%; height:100%; object-fit:contain; background:#000; border-radius:12px;"
          aria-label="PyKid tanıtım videosu"
        >
          <source src="/videos/example.mp4" type="video/mp4" />
          <track
            kind="captions"
            src="/videos/example.tr.vtt"
            srclang="tr"
            label="Türkçe"
            default
          />
          Tarayıcınız video etiketini desteklemiyor.
        </video>
      </div>

      <!-- YATAY GUTTER (Video ↔ Chat) -->
      <div
        class="gutter-h"
        role="slider"
        aria-orientation="horizontal"
        aria-label="Video panel boyutlandırma"
        aria-valuemin={minVideoPx}
        aria-valuemax={maxVideoPx}
        aria-valuenow={videoPx}
        tabindex="0"
        on:pointerdown={startLeftRowDrag}
        on:dblclick={resetVideo}
        on:keydown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            resetVideo();
          }
          if (e.key === 'ArrowUp') {
            videoPx -= 16; clampVideo();
          }
          if (e.key === 'ArrowDown') {
            videoPx += 16; clampVideo();
          }
        }}
      ></div>

      <!-- Chat Panel (glass) -->
      <div class="chatPane">
        <ChatPanel />
      </div>
    </div>

    <!-- DİKEY GUTTER (Sol sütun ↔ IDE) -->
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
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          resetCols();
        }
        if (e.key === 'ArrowLeft') {
          leftPx -= 16; clampLeft(); editor?.layout?.();
        }
        if (e.key === 'ArrowRight') {
          leftPx += 16; clampLeft(); editor?.layout?.();
        }
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
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            resetRows();
          }
          if (e.key === 'ArrowUp') {
            rowTopPx -= 16; clampRows(); editor?.layout?.();
          }
          if (e.key === 'ArrowDown') {
            rowTopPx += 16; clampRows(); editor?.layout?.();
          }
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
