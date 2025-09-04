<script lang="ts">
  import loader from '@monaco-editor/loader';
  import { onMount, onDestroy } from 'svelte';
  import { usePyodide } from '$lib/pyodide';
  import ChatPanel from '$lib/ChatPanel.svelte';
  import LessonNav from '$lib/LessonNav.svelte';
  import LessonContent from '$lib/LessonContent.svelte';
  import { goto } from '$app/navigation';
  import type { PageData } from './$types';
  import type { Lesson, LessonStep } from '$lib/lessons';
  import { LESSONS } from '$lib/lessons';

  export let data: PageData;

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

  // Lesson system state
  let currentLesson: Lesson | null = null;
  let currentStep: LessonStep | null = null;

  const pyodideReady = usePyodide();

  // Başlangıç Python kodu - kişiselleştirilmiş
  const initial = `# PyKid'e Hoş geldin, ${data.user?.name || 'Kullanıcı'}!
print("Merhaba ${data.user?.name || 'Kullanıcı'}!")
print("Python öğrenmeye hazır mısın?")
`;

  // Logout function
  async function handleLogout() {
    try {
      // Call logout API to clear server-side cookie
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
      
      // Clear any local storage data
      localStorage.removeItem('user');
      
      // Redirect to login
      goto('/login');
    } catch (error) {
      console.error('Logout error:', error);
      // Force redirect even if API fails
      goto('/login');
    }
  }

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

  // Function to get current editor content for Ada Teacher
  function getCurrentEditorContent(): string {
    if (!editor) return '';
    return editor.getValue() || '';
  }

  // Function to get current lesson context for Ada Teacher
  function getCurrentLessonContext(): string {
    if (!currentLesson || !currentStep) return '';
    
    const lessonInfo = `Öğrenci şu anda "${currentLesson.title}" dersinde "${currentStep.title}" adımında. `;
    const objective = currentLesson.objectives.length > 0 ? `Dersin hedefleri: ${currentLesson.objectives.join(', ')}. ` : '';
    const stepContent = currentStep.exercise ? 
      `Bu adımda "${currentStep.exercise.title}" alıştırmasını yapıyor. Alıştırma: ${currentStep.exercise.description}` :
      `Bu adımda teori öğreniyor: ${currentStep.content.substring(0, 200)}...`;
    
    return lessonInfo + objective + stepContent;
  }

  // Lesson system event handlers
  function handleLessonSelect(event: CustomEvent<{ lesson: Lesson }>) {
    const { lesson } = event.detail;
    currentLesson = lesson;
    const firstStep = lesson.steps[0] || null;
    currentStep = firstStep;
    
    // Load lesson content as comments in editor
    if (firstStep && editor) {
      const lessonComments = generateLessonComments(lesson, firstStep);
      editor.setValue(lessonComments);
    }
  }

  function handleStepSelect(event: CustomEvent<{ lesson: Lesson; step: LessonStep }>) {
    const { lesson, step } = event.detail;
    currentLesson = lesson;
    currentStep = step;
    
    // Load step content as comments in editor
    if (editor) {
      const lessonComments = generateLessonComments(lesson, step);
      editor.setValue(lessonComments);
    }
  }

  function handleCodeUpdate(event: CustomEvent<{ code: string }>) {
    const { code } = event.detail;
    if (editor) {
      editor.setValue(code);
    }
  }

  function handleExerciseComplete(event: CustomEvent<{ lesson: Lesson; step: LessonStep }>) {
    // Could show success message or confetti here
    console.log('Exercise completed!', event.detail);
  }

  function handleNextStep(event: CustomEvent<{ lesson: Lesson; step: LessonStep }>) {
    const { lesson, step } = event.detail;
    currentLesson = lesson;
    currentStep = step;
  }

  function handleNextLesson(event: CustomEvent<{ lesson: Lesson }>) {
    const { lesson } = event.detail;
    currentLesson = lesson;
    currentStep = lesson.steps[0] || null;
  }

  function handleGetEditorCode(event: CustomEvent<void>) {
    // Return current editor code to lesson component
    return getCurrentEditorContent();
  }

  function handleBackToLessons() {
    // Clear current lesson/step to show lesson navigation
    currentLesson = null;
    currentStep = null;
  }

  // Generate lesson instructions as Python comments
  function generateLessonComments(lesson: Lesson, step: LessonStep): string {
    const comments = [];
    
    // Lesson and step title
    comments.push(`# ========================================`);
    comments.push(`# ${lesson.title} - ${step.title}`);
    comments.push(`# ========================================`);
    comments.push(``);
    
    // Step description (clean markdown)
    const cleanContent = step.content
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
      .replace(/\*(.*?)\*/g, '$1') // Remove italic
      .replace(/`(.*?)`/g, '$1') // Remove code backticks
      .replace(/^#+\s*/gm, '') // Remove markdown headers
      .replace(/^-\s*/gm, '• ') // Convert list items
      .split('\n')
      .filter(line => line.trim())
      .slice(0, 5); // Limit to first 5 lines
    
    comments.push(`# Konu:`);
    cleanContent.forEach(line => {
      if (line.trim()) {
        comments.push(`# ${line.trim()}`);
      }
    });
    comments.push(``);
    
    // Exercise instructions
    if (step.exercise) {
      comments.push(`# 🏋️ Alıştırma: ${step.exercise.title}`);
      comments.push(`# ${step.exercise.description}`);
      comments.push(``);
      
      // Add hints as comments
      if (step.exercise.hints && step.exercise.hints.length > 0) {
        comments.push(`# 💡 İpuçları:`);
        step.exercise.hints.slice(0, 3).forEach((hint, index) => {
          comments.push(`# ${index + 1}. ${hint}`);
        });
        comments.push(``);
      }
    }
    
    comments.push(`# Buraya kodunu yaz:`);
    comments.push(``);
    
    // Add starter code if available
    if (step.exercise?.starterCode && step.exercise.starterCode.trim()) {
      const starterLines = step.exercise.starterCode.split('\n');
      starterLines.forEach(line => {
        comments.push(line);
      });
    } else if (step.codeExample) {
      comments.push(`# Örnek:`);
      const exampleLines = step.codeExample.split('\n');
      exampleLines.forEach(line => {
        comments.push(`# ${line}`);
      });
      comments.push(``);
    }
    
    return comments.join('\n');
  }

  // Lesson selector state
  let showLessonSelector = false;

  // Start with lesson navigation (no lesson pre-selected)
  onMount(() => {
    // Don't auto-select a lesson, let user choose
    currentLesson = null;
    currentStep = null;
  });

  // Keyboard shortcut to open lesson selector
  function handleKeydown(event: KeyboardEvent) {
    if (event.ctrlKey && event.key === 'l') {
      event.preventDefault();
      showLessonSelector = !showLessonSelector;
    }
    if (event.key === 'Escape') {
      showLessonSelector = false;
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

<!-- === STIL (Tokenlar + küçük global override; layout Tailwind) === -->
<style>
  /* ==== Tokenlar ==== */
  :global(:root){
    --bg: #c9c8c5;
    --text: #0f172a;
    --line: #e8edf5;

    --accent: #6f757e;
    --accent-weak: #eaf2ff;

    --radius: .3rem; /* köşeler */
    --glass-bg: rgba(255,255,255,.45);
    --glass-border: rgba(255,255,255,.36);
    --glass-blur: 14px;
  }

  /* ==== Arkaplan ==== */
  :global(html, body){
    height:100%; margin:0; overflow:hidden; color:var(--text);
    background:
      radial-gradient(1100px 700px at 8% -10%, #99b9da 0%, rgba(207,230,255,0) 40%),
      radial-gradient(900px 700px at 100% -5%, #b8a0a9 0%, rgba(255,228,239,0) 45%),
      var(--bg);
  }

  /* --- ChatPanel içi (global) --- */
  :global(.chat){ background: transparent; }
  :global(.chat .row){ background: transparent; }
  :global(.chat .msgs){ max-width:70ch; margin-inline:auto; padding:.9rem; }
  :global(.chat .bubble){ padding:.7rem 1rem; border-radius:1.1rem; box-shadow: 0 12px 32px rgba(130,135,146,.10); }
  :global(.chat .user){ background: var(--accent-weak); }
  :global(.chat .assistant){ background:#f3faf6; border:1px solid #ddefe5; }

  /* --- Monaco'yu şeffaf yap + focus çizgisini kaldır --- */
  :global(.monaco-editor),
  :global(.monaco-editor .overflow-guard),
  :global(.monaco-editor .margin),
  :global(.monaco-editor-background),
  :global(.monaco-scrollable-element){ background: transparent !important; }
  :global(:root){ --vscode-focusBorder: transparent; }
  /* Monaco: focus outline'ını kökten kapat */
  /* === Monaco: kenardaki mavi çerçeveyi her durumda kapat === */
  :global(.monaco-editor),
  :global(.monaco-editor .overflow-guard),
  :global(.monaco-editor .monaco-editor-background),
  :global(.monaco-editor .margin){
    outline: 0 !important;
    border: 0 !important;
    box-shadow: none !important;
  }


</style>

<!-- Keyboard event handler -->
<svelte:window on:keydown={handleKeydown} />

{#await pyodideReady}
  <div>Pyodide yükleniyor…</div>
{:then py}
  <!-- SHELL -->
  <div
    class="grid h-screen min-h-0 box-border gap-[0.9rem] p-[0.9rem]"
    bind:this={shellEl}
    style={`grid-template-columns:${leftPx}px 8px 1fr;`}
    on:pointermove={onPointerMove}
    on:pointerup={endDrag}
    on:pointercancel={endDrag}
  >
    <!-- SOL SÜTUN: Video + Chat -->
    <div
      class="grid min-h-0 h-full"
      bind:this={leftPaneEl}
      style={`grid-template-rows:${videoPx}px 8px 1fr;`}
      on:pointermove={onPointerMoveLeft}
      on:pointerup={endLeftDrag}
      on:pointercancel={endLeftDrag}
    >
      <!-- VIDEO KART (GLASS) -->
      <div
        class="relative h-full rounded-[var(--radius)] border border-[var(--glass-border)]
               bg-[var(--glass-bg)] shadow-[0_12px_32px_rgba(130,135,146,.10)]
               [backdrop-filter:saturate(160%)_blur(var(--glass-blur))]
               [-webkit-backdrop-filter:saturate(160%)_blur(var(--glass-blur))]
               overflow-hidden"
      >
        <!-- cam parıltı overlay -->
        <div
          class="pointer-events-none absolute inset-0 [border-radius:inherit] mix-blend-soft-light z-0"
          style="background:
            linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,0) 42%) top/100% 50% no-repeat,
            linear-gradient(0deg,  rgba(0,0,0,.06),       rgba(0,0,0,0) 42%) bottom/100% 50% no-repeat;"
        ></div>
        <div class="relative z-[1] p-2 h-full">
          <video
            bind:this={videoEl}
            controls
            playsinline
            class="w-full h-full object-contain bg-black rounded-[0.5rem]"
            aria-label="PyKid tanıtım videosu"
          >
            <source src="/videos/example.mp4" type="video/mp4" />
            <track kind="captions" src="/videos/example.tr.vtt" srclang="tr" label="Türkçe" default />
            Tarayıcınız video etiketini desteklemiyor.
          </video>
        </div>
      </div>

      <!-- GUTTER (Yatay: Video ↔ Chat) bg-[repeating-linear-gradient(to_right,#d9e1f1,#d9e1f1_2px,transparent_2px,transparent_8px)]-->
      <div
        class="h-[8px] shrink-0 z-10 rounded-full
               
               cursor-row-resize focus:outline-[3px] focus:outline-[var(--accent)] focus:outline-offset-2"
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
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); resetVideo(); }
          if (e.key === 'ArrowUp') { videoPx -= 16; clampVideo(); }
          if (e.key === 'ArrowDown') { videoPx += 16; clampVideo(); }
        }}
      ></div>

      <!-- CHAT PANEL (ADA TEACHER) -->
      <div
        class="relative h-full rounded-[var(--radius)] border border-[var(--glass-border)]
               bg-[var(--glass-bg)] shadow-[0_12px_32px_rgba(130,135,146,.10)]
               [backdrop-filter:saturate(160%)_blur(var(--glass-blur))]
               [-webkit-backdrop-filter:saturate(160%)_blur(var(--glass-blur))]
               overflow-hidden p-2"
      >
        <div
          class="pointer-events-none absolute inset-0 [border-radius:inherit] mix-blend-soft-light z-0"
          style="background:
            linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,0) 42%) top/100% 50% no-repeat,
            linear-gradient(0deg,  rgba(0,0,0,.06),       rgba(0,0,0,0) 42%) bottom/100% 50% no-repeat;"
        ></div>
        <div class="relative z-[1] h-full">
          <ChatPanel {getCurrentEditorContent} {getCurrentLessonContext} />
        </div>
      </div>
    </div>

    <!-- GUTTER (Dikey: Sol sütun ↔ IDE) bg-[repeating-linear-gradient(to_right,#d9e1f1,#d9e1f1_2px,transparent_2px,transparent_8px)] -->
    <div
      class="w-[8px] shrink-0 z-10 rounded-full
             
             cursor-col-resize focus:outline-[3px] focus:outline-[var(--accent)] focus:outline-offset-2"
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
        if (e.key === 'ArrowLeft') { leftPx -= 16; clampLeft(); editor?.layout?.(); }
        if (e.key === 'ArrowRight') { leftPx += 16; clampLeft(); editor?.layout?.(); }
      }}
    ></div>

    <!-- SAG: IDE + Konsol -->
    <div
      class="grid h-full min-h-0"
      bind:this={pageEl}
      style={`grid-template-rows:${rowTopPx ? `${rowTopPx}px` : '1fr'} 8px 1fr;`}
    >
      <!-- EDITOR KART (GLASS) -->
      <div
        class="relative h-full rounded-[var(--radius)] border border-[var(--glass-border)]
               bg-[var(--glass-bg)] shadow-[0_12px_32px_rgba(130,135,146,.10)]
               [backdrop-filter:saturate(160%)_blur(var(--glass-blur))]
               [-webkit-backdrop-filter:saturate(160%)_blur(var(--glass-blur))]
               overflow-hidden p-2"
        bind:this={editorEl}
      >
        <div
          class="pointer-events-none absolute inset-0 [border-radius:inherit] mix-blend-soft-light z-0"
          style="background:
            linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,0) 42%) top/100% 50% no-repeat,
            linear-gradient(0deg,  rgba(0,0,0,.06),       rgba(0,0,0,0) 42%) bottom/100% 50% no-repeat;"
        ></div>
        
      </div>

      <!-- GUTTER (Yatay: Editor ↔ Konsol) deleted-> bg-[repeating-linear-gradient(to_right,#d9e1f1,#d9e1f1_2px,transparent_2px,transparent_8px)] -->
      <div
        class="h-[8px] shrink-0 z-10 rounded-full
              
               cursor-row-resize focus:outline-[3px] focus:outline-[var(--accent)] focus:outline-offset-2"
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
          if (e.key === 'ArrowUp') { rowTopPx -= 16; clampRows(); editor?.layout?.(); }
          if (e.key === 'ArrowDown') { rowTopPx += 16; clampRows(); editor?.layout?.(); }
        }}
      ></div>

      <!-- KONSOL KART (GLASS) -->
      <div
        class="relative h-full rounded-[var(--radius)] border border-[var(--glass-border)]
               bg-[var(--glass-bg)] shadow-[0_12px_32px_rgba(130,135,146,.10)]
               [backdrop-filter:saturate(160%)_blur(var(--glass-blur))]
               [-webkit-backdrop-filter:saturate(160%)_blur(var(--glass-blur))]
               overflow-hidden"
        bind:this={outEl}
      >
        <div
          class="pointer-events-none absolute inset-0 [border-radius:inherit] mix-blend-soft-light z-0"
          style="background:
            linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,0) 42%) top/100% 50% no-repeat,
            linear-gradient(0deg,  rgba(0,0,0,.06),       rgba(0,0,0,0) 42%) bottom/100% 50% no-repeat;"
        ></div>
        <div class="relative z-[1]">
          <div
            class="flex items-center gap-2 px-[0.9rem] py-[0.55rem]
                   border-b border-[var(--line)]
                   bg-gradient-to-b from-[var(--accent-weak)] to-white
                   rounded-t-[var(--radius)]"
          >
            <button
              class="px-3 py-1.5 rounded-md bg-[var(--accent)] text-white border-0
                     shadow-[0_8px_18px_rgba(37,99,235,.28)] disabled:opacity-60"
              on:click={() => runCode(py)}
              disabled={running || !editor}
            >
              ▶ Çalıştır
            </button>
            <button
              class="px-3 py-1.5 rounded-md border border-[var(--line)] bg-white/70 hover:bg-white"
              on:click={() => (output='')}
            >
              Temizle
            </button>
            <button
              class="px-3 py-1.5 rounded-md border border-[var(--line)] bg-white/70 hover:bg-white"
              on:click={() => showLessonSelector = !showLessonSelector}
              title="Ders seç (Ctrl+L)"
            >
              📚 Dersler
            </button>
            
            <!-- User info and logout -->
            <div class="ml-auto flex items-center gap-2">
              <span class="text-sm text-[var(--accent)] hidden sm:inline">
                Merhaba, {data.user?.name || 'Kullanıcı'}!
              </span>
              <button
                class="px-2 py-1 text-xs rounded border border-[var(--line)] bg-white/50 hover:bg-white/70 text-[var(--accent)]"
                on:click={handleLogout}
                title="Çıkış yap"
              >
                Çıkış
              </button>
            </div>
          </div>
          <div class="p-4 overflow-auto font-mono text-[14px]" style="white-space: pre-line">
            {output || 'Çıktı burada görünecek.'}
          </div>

        </div>
      </div>
    </div>
  </div>

  <!-- Lesson Selector Modal -->
  {#if showLessonSelector}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" on:click={() => showLessonSelector = false}>
      <div class="bg-white rounded-lg p-6 max-w-2xl max-h-[80vh] overflow-auto" on:click|stopPropagation>
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold text-gray-800">📚 Ders Seçin</h2>
          <button 
            class="text-gray-500 hover:text-gray-700 text-xl"
            on:click={() => showLessonSelector = false}
          >
            ✕
          </button>
        </div>
        
        <div class="space-y-4">
          {#each LESSONS as lesson}
            <div class="border border-gray-200 rounded-lg p-4">
              <h3 class="font-semibold text-gray-800 mb-2">{lesson.title}</h3>
              <p class="text-sm text-gray-600 mb-3">{lesson.description}</p>
              
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {#each lesson.steps as step, index}
                  <button
                    class="text-left p-2 rounded border border-gray-200 hover:bg-gray-50 transition-colors text-sm"
                    on:click={() => {
                      handleStepSelect({ detail: { lesson, step } });
                      showLessonSelector = false;
                    }}
                  >
                    <span class="text-xs text-gray-500">Adım {index + 1}:</span>
                    <br>
                    {step.title}
                  </button>
                {/each}
                
                {#if lesson.finalProject}
                  <button
                    class="text-left p-2 rounded border border-purple-200 bg-purple-50 hover:bg-purple-100 transition-colors text-sm"
                    on:click={() => {
                      handleStepSelect({ detail: { 
                        lesson, 
                        step: { 
                          id: 'final-project', 
                          title: lesson.finalProject?.title || 'Final Project', 
                          content: lesson.finalProject?.description || '',
                          exercise: lesson.finalProject 
                        } 
                      } });
                      showLessonSelector = false;
                    }}
                  >
                    <span class="text-xs text-purple-600">Final Proje:</span>
                    <br>
                    🎯 {lesson.finalProject.title}
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
        
        <div class="mt-4 text-sm text-gray-500 text-center">
          <kbd class="px-2 py-1 bg-gray-100 rounded">Ctrl+L</kbd> ile açabilirsin
        </div>
      </div>
    </div>
  {/if}

{:catch err}
  <div class="text-[#b00]">Pyodide başlatılamadı: {String(err)}</div>
{/await}
