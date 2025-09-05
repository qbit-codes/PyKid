<!-- src/routes/+page.refactored.svelte -->
<!-- Refactored main page component using extracted composables and components -->

<script lang="ts">
  import loader from '@monaco-editor/loader';
  import { onMount, onDestroy, tick } from 'svelte';
  import { usePyodide } from '$lib/pyodide';
  import ChatPanel from '$lib/ChatPanel.svelte';
  import VideoPlayer from '$lib/VideoPlayer.svelte';
  import IntroOverlay from '$lib/IntroOverlay.svelte';
  import ProgressDashboard from '$lib/ProgressDashboard.svelte';
  import { goto } from '$app/navigation';
  import type { PageData } from './$types';
  
  // Composables
  import { useVideoManager } from '$lib/composables/useVideoManager';
  import { usePanelResize } from '$lib/composables/usePanelResize';
  import { useLessonManager } from '$lib/composables/useLessonManager';
  import { useCodeExecution } from '$lib/composables/useCodeExecution';

  export let data: PageData;
  
  // Initialize composables
  const videoManager = useVideoManager();
  const lessonManager = useLessonManager();
  const codeExecution = useCodeExecution();
  
  // Monaco editor
  let editor: any = null;
  let monacoLib: any = null;
  let editorEl: HTMLDivElement;
  
  // Panel resize
  const panelResize = usePanelResize();
  let shellEl: HTMLDivElement;
  let pageEl: HTMLDivElement; 
  let leftPaneEl: HTMLDivElement;
  
  // Chat panel reference
  let chatPanelComponent: any = null;
  let introOverlayComponent: any = null;

  // Pyodide
  const pyodideReady = usePyodide();

  // Initial Python code
  const initial = `# PyKid'e Hoş geldin, ${data.user?.name || 'Kullanıcı'}!
print("Merhaba ${data.user?.name || 'Kullanıcı'}!")
print("Python öğrenmeye hazır mısın?")
`;

  // Reactive subscriptions to stores from composables
  $: currentVideoState = videoManager.videoState;
  $: currentLessonState = lessonManager.lessonState;  
  $: currentPanelSizes = panelResize.panelSizes;
  $: currentConstraints = panelResize.constraints;
  $: currentExecutionState = codeExecution.executionState;

  // Update video when lesson changes
  $: if ($currentLessonState.currentLesson && $currentLessonState.currentStep) {
    videoManager.updateVideoForLesson(
      $currentLessonState.currentLesson, 
      $currentLessonState.currentStep
    );
  }

  // Auto-generate lesson comments when lesson/step changes
  $: if ($currentLessonState.currentLesson && $currentLessonState.currentStep && editor) {
    const lessonComments = lessonManager.generateLessonComments(
      $currentLessonState.currentLesson,
      $currentLessonState.currentStep
    );
    editor.setValue(lessonComments);
    
    // Update chat for lesson change
    if (chatPanelComponent?.updateForLessonChange) {
      chatPanelComponent.updateForLessonChange();
    }
  }

  // Run code function
  async function runCode(py: Awaited<ReturnType<typeof usePyodide>>) {
    if (!editor) return;
    const code = editor.getValue();
    
    const result = await codeExecution.runCode(
      py,
      code,
      $currentLessonState.currentLesson,
      $currentLessonState.currentStep,
      lessonManager.getCurrentLessonContext
    );

    if (result.success) {
      // Handle successful execution
      handleSuccessfulExecution();
    } else {
      // Handle failed execution with the current fail streak
      await handleFailedExecution(result.failStreak);
    }
  }

  // Handle successful code execution
  async function handleSuccessfulExecution() {
    if (!$currentLessonState.currentLesson || !$currentLessonState.currentStep) return;
    
    // Reset video triggers on successful completion
    videoManager.resetVideoTriggers(
      $currentLessonState.currentLesson, 
      $currentLessonState.currentStep
    );
    
    // Show congratulations video
    const hasCongratsVideo = await videoManager.showCongratulationsVideo(
      $currentLessonState.currentLesson, 
      $currentLessonState.currentStep, 
      false
    );
    
    if (hasCongratsVideo) {
      // Set flag to handle auto progression after video ends
      videoManager.setPendingAutoProgression(true);
    } else {
      // No video, proceed immediately
      fireReplay();
      await handleAutoProgression();
    }
  }

  // Handle failed code execution
  async function handleFailedExecution(failStreak: number) {
    // Check for help video trigger at 3 failures
    if (failStreak >= 3 && $currentLessonState.currentLesson && $currentLessonState.currentStep) {
      const helpVideoTriggered = await videoManager.checkHelpVideo(
        $currentLessonState.currentLesson,
        $currentLessonState.currentStep,
        failStreak
      );
      
      // Reset the fail streak after help video logic runs
      if (helpVideoTriggered) {
        codeExecution.resetFailStreak();
      }
    }
  }

  // Handle auto progression after successful completion
  async function handleAutoProgression() {
    const result = await lessonManager.handleAutoProgression();
    
    // Add progression message to output
    codeExecution.executionState.update(state => ({
      ...state,
      output: state.output + `\n\n${result.message}\n`
    }));
    
    // Show lesson completion congratulations if needed
    if (result.nextLesson && $currentLessonState.currentLesson) {
      await videoManager.showCongratulationsVideo(
        $currentLessonState.currentLesson,
        undefined,
        true
      );
    }
  }

  // Video player event handlers
  function handleVideoPlay() {
    videoManager.handleVideoPlay();
    codeExecution.handleHelpRequest('video');
  }

  function handleVideoPlayerEnded(event: CustomEvent) {
    const shouldAutoProgress = videoManager.handleVideoEnded(event);
    if (shouldAutoProgress) {
      setTimeout(() => {
        handleAutoProgression();
      }, 500);
    }
  }

  // Chat interaction handler
  function handleChatInteraction() {
    codeExecution.handleHelpRequest('chat');
  }

  // Lesson event handlers
  function handleLessonSelect(event: CustomEvent) {
    lessonManager.handleLessonSelect(event);
    // Check for lesson start video
    if ($currentLessonState.currentLesson) {
      videoManager.checkLessonStartVideo($currentLessonState.currentLesson);
    }
  }

  function handleStepSelect(event: CustomEvent) {
    lessonManager.handleStepSelect(event);
  }

  // Get current editor content for Ada Teacher
  function getCurrentEditorContent(): string {
    if (!editor) return '';
    return editor.getValue() || '';
  }

  // Logout handler
  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('user');
      // Clear intro keys would be handled by IntroOverlay component
      goto('/login');
    }
  }

  // Keyboard shortcut handler
  function handleKeydown(event: KeyboardEvent) {
    if (event.ctrlKey && event.key === 'l') {
      event.preventDefault();
      lessonManager.toggleLessonSelector();
    }
    if (event.key === 'Escape') {
      lessonManager.closeLessonSelector();
    }
  }

  // Replay function for intro video
  function fireReplay(startAt?: number, unmute = false) {
    const detail = {
      startAt: typeof startAt === 'number' ? startAt : 0,
      unmute
    };
    window.dispatchEvent(new CustomEvent('pysk:intro:replay', { detail }));
  }

  // Lifecycle
  onMount(async () => {
    monacoLib = await loader.init();
    
    // Initialize panel resize
    panelResize.setElements(shellEl, pageEl, leftPaneEl);
    panelResize.initialize();
    
    // Auto-select lesson and step
    lessonManager.autoSelectLessonAndStep();
    
    // Delay lesson change update to ensure chat component is ready
    setTimeout(() => {
      if (chatPanelComponent?.updateForLessonChange) {
        chatPanelComponent.updateForLessonChange();
      }
    }, 1000);
  });

  // Initialize Monaco editor when ready
  $: if (editorEl && monacoLib && !editor) {
    editor = monacoLib.editor.create(editorEl, {
      value: initial,
      language: 'python',
      automaticLayout: true,
      fontSize: 14,
      minimap: { enabled: false }
    });
    
    // Set initial lesson content if available
    if ($currentLessonState.currentLesson && $currentLessonState.currentStep) {
      const lessonComments = lessonManager.generateLessonComments(
        $currentLessonState.currentLesson, 
        $currentLessonState.currentStep
      );
      editor.setValue(lessonComments);
    }
  }
</script>

<!-- Global Styles -->
<style>
  :global(:root){
    --bg: #c9c8c5;
    --text: #0f172a;
    --line: #e8edf5;
    --accent: #6f757e;
    --accent-weak: #eaf2ff;
    --radius: .3rem;
    --glass-bg: rgba(255,255,255,.45);
    --glass-border: rgba(255,255,255,.36);
    --glass-blur: 14px;
  }

  :global(html, body){
    height:100%; margin:0; overflow:hidden; color:var(--text);
    background:
      radial-gradient(1100px 700px at 8% -10%, #99b9da 0%, rgba(207,230,255,0) 40%),
      radial-gradient(900px 700px at 100% -5%, #b8a0a9 0%, rgba(255,228,239,0) 45%),
      var(--bg);
  }

  :global(.chat){ background: transparent; }
  :global(.chat .row){ background: transparent; }
  :global(.chat .msgs){ max-width:70ch; margin-inline:auto; padding:.9rem; }
  :global(.chat .bubble){ padding:.7rem 1rem; border-radius:1.1rem; box-shadow: 0 12px 32px rgba(130,135,146,.10); }
  :global(.chat .user){ background: var(--accent-weak); }
  :global(.chat .assistant){ background:#f3faf6; border:1px solid #ddefe5; }

  :global(.monaco-editor),
  :global(.monaco-editor .overflow-guard),
  :global(.monaco-editor .margin),
  :global(.monaco-editor-background),
  :global(.monaco-scrollable-element){ background: transparent !important; }
  :global(:root){ --vscode-focusBorder: transparent; }
  :global(.monaco-editor),
  :global(.monaco-editor .overflow-guard),
  :global(.monaco-editor .monaco-editor-background),
  :global(.monaco-editor .margin){
    outline: 0 !important;
    border: 0 !important;
    box-shadow: none !important;
  }

  @media (prefers-reduced-motion: reduce) {
    :global(*) {
      animation-duration: .01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: .01ms !important;
      scroll-behavior: auto !important;
    }
  }
</style>

<!-- Keyboard event handler -->
<svelte:window on:keydown={handleKeydown} />

{#await pyodideReady}
  <div>Pyodide yükleniyor…</div>
{:then py}

  <!-- Intro Overlay -->
  <IntroOverlay 
    bind:this={introOverlayComponent}
    user={data.user}
    introVideoSrc="/videos/intro_lesson-1.mp4"
  />

  <!-- Main Shell -->
  <div
    class="grid h-screen min-h-0 box-border gap-[0.9rem] p-[0.9rem]"
    bind:this={shellEl}
    style={`grid-template-columns:${$currentPanelSizes.leftPx}px 8px 1fr;`}
    on:pointermove={panelResize.onPointerMove}
    on:pointerup={panelResize.endDrag}
    on:pointercancel={panelResize.endDrag}
  >
    <!-- Left Column: Video + Chat -->
    <div
      class="grid min-h-0 h-full"
      bind:this={leftPaneEl}
      style={`grid-template-rows:${$currentPanelSizes.videoPx}px 8px 1fr;`}
      on:pointermove={panelResize.onPointerMoveLeft}
      on:pointerup={panelResize.endLeftDrag}
      on:pointercancel={panelResize.endLeftDrag}
    >
      <!-- Video Card -->
      <div
        class="relative h-full rounded-[var(--radius)] border border-[var(--glass-border)]
               bg-[var(--glass-bg)] shadow-[0_12px_32px_rgba(130,135,146,.10)]
               [backdrop-filter:saturate(160%)_blur(var(--glass-blur))]
               [-webkit-backdrop-filter:saturate(160%)_blur(var(--glass-blur))]
               overflow-hidden"
      >
        <div
          class="pointer-events-none absolute inset-0 [border-radius:inherit] mix-blend-soft-light z-0"
          style="background:
            linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,0) 42%) top/100% 50% no-repeat,
            linear-gradient(0deg,  rgba(0,0,0,.06),       rgba(0,0,0,0) 42%) bottom/100% 50% no-repeat;"
        ></div>
        <div class="relative z-[1] p-2 h-full">
          <VideoPlayer
            lessonId={$currentVideoState.currentVideoLessonId}
            stepId={$currentVideoState.currentVideoStepId}
            videoType={$currentVideoState.currentVideoType}
            autoplay={true}
            showControls={true}
            className="w-full h-full rounded-[0.5rem]"
            on:play={handleVideoPlay}
            on:ended={handleVideoPlayerEnded}
          />
        </div>
      </div>

      <!-- Video Resize Gutter -->
      <div
        class="h-[8px] shrink-0 z-10 rounded-full
               cursor-row-resize focus:outline-[3px] focus:outline-[var(--accent)] focus:outline-offset-2"
        role="slider"
        aria-orientation="horizontal"
        aria-label="Video panel boyutlandırma"
        aria-valuemin={$currentConstraints.minVideoPx}
        aria-valuemax={$currentConstraints.maxVideoPx}
        aria-valuenow={$currentPanelSizes.videoPx}
        tabindex="0"
        on:pointerdown={panelResize.startLeftRowDrag}
        on:dblclick={panelResize.resetVideo}
        on:keydown={panelResize.handleVideoKeydown}
      ></div>

      <!-- Chat Panel -->
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
          <ChatPanel 
            bind:this={chatPanelComponent}
            {getCurrentEditorContent} 
            getCurrentLessonContext={lessonManager.getCurrentLessonContext}
            onChatInteraction={handleChatInteraction} 
          />
        </div>
      </div>
    </div>

    <!-- Column Resize Gutter -->
    <div
      class="w-[8px] shrink-0 z-10 rounded-full
             cursor-col-resize focus:outline-[3px] focus:outline-[var(--accent)] focus:outline-offset-2"
      role="slider"
      aria-orientation="vertical"
      aria-label="Panel boyutlandırma"
      aria-valuemin={$currentConstraints.minLeft}
      aria-valuemax={$currentConstraints.maxLeft}
      aria-valuenow={$currentPanelSizes.leftPx}
      tabindex="0"
      on:pointerdown={panelResize.startColDrag}
      on:dblclick={panelResize.resetCols}
      on:keydown={panelResize.handleColKeydown}
    ></div>

    <!-- Right: Editor + Console -->
    <div
      class="grid h-full min-h-0"
      bind:this={pageEl}
      style={`grid-template-rows:${$currentPanelSizes.rowTopPx ? `${$currentPanelSizes.rowTopPx}px` : '1fr'} 8px 1fr;`}
    >
      <!-- Editor Card -->
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

      <!-- Row Resize Gutter -->
      <div
        class="h-[8px] shrink-0 z-10 rounded-full
               cursor-row-resize focus:outline-[3px] focus:outline-[var(--accent)] focus:outline-offset-2"
        role="slider"
        aria-orientation="horizontal"
        aria-label="Panel boyutlandırma"
        aria-valuemin={$currentConstraints.minTopPx}
        aria-valuemax={$currentConstraints.maxTopPx}
        aria-valuenow={$currentPanelSizes.rowTopPx}
        tabindex="0"
        on:pointerdown={panelResize.startRowDrag}
        on:dblclick={panelResize.resetRows}
        on:keydown={panelResize.handleRowKeydown}
      ></div>

      <!-- Console Card -->
      <div
        class="relative h-full rounded-[var(--radius)] border border-[var(--glass-border)]
               bg-[var(--glass-bg)] shadow-[0_12px_32px_rgba(130,135,146,.10)]
               [backdrop-filter:saturate(160%)_blur(var(--glass-blur))]
               [-webkit-backdrop-filter:saturate(160%)_blur(var(--glass-blur))]
               overflow-hidden"
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
              disabled={$currentExecutionState.running || !editor}
            >
              ▶ Çalıştır
            </button>
            <button
              class="px-3 py-1.5 rounded-md border border-[var(--line)] bg-white/70 hover:bg-white"
              on:click={codeExecution.clearOutput}
            >
              Temizle
            </button>
            <button
              class="px-3 py-1.5 rounded-md border border-[var(--line)] bg-white/70 hover:bg-white"
              on:click={lessonManager.toggleLessonSelector}
              title="Ders seç (Ctrl+L)"
            >
              📚 Dersler
            </button>
            <button
              class="px-3 py-1.5 rounded-md border border-[var(--line)] bg-white/70 hover:bg-white"
              on:click={lessonManager.toggleProgressDashboard}
              title="İlerleme paneli"
            >
              📊 İlerleme
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
            {$currentExecutionState.output || 'Çıktı burada görünecek.'}
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Progress Dashboard Modal -->
  {#if currentLessonState.showProgressDashboard}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" 
         on:click={lessonManager.closeProgressDashboard}>
      <div class="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] m-4" on:click|stopPropagation>
        <div class="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 class="text-xl font-bold text-gray-800">📊 İlerleme Panosu</h2>
          <button 
            class="text-gray-500 hover:text-gray-700 text-xl"
            on:click={lessonManager.closeProgressDashboard}
          >
            ✕
          </button>
        </div>
        
        <div class="overflow-auto max-h-[80vh]">
          <ProgressDashboard />
        </div>
      </div>
    </div>
  {/if}

  <!-- Lesson Selector Modal -->
  {#if currentLessonState.showLessonSelector}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" 
         on:click={lessonManager.closeLessonSelector}>
      <div class="bg-white rounded-lg p-6 max-w-2xl max-h-[80vh] overflow-auto" on:click|stopPropagation>
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold text-gray-800">📚 Ders Seçin</h2>
          <button 
            class="text-gray-500 hover:text-gray-700 text-xl"
            on:click={lessonManager.closeLessonSelector}
          >
            ✕
          </button>
        </div>
        
        <div class="space-y-4">
          {#each lessonManager.LESSONS as lesson}
            <div class="border border-gray-200 rounded-lg p-4">
              <h3 class="font-semibold text-gray-800 mb-2">{lesson.title}</h3>
              <p class="text-sm text-gray-600 mb-3">{lesson.description}</p>
              
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {#each lesson.steps as step, index}
                  {@const isCompleted = lessonManager.isStepCompleted(lesson.id, step.id)}
                  <button
                    class="text-left p-2 rounded border transition-colors text-sm {
                      isCompleted 
                        ? 'border-green-200 bg-green-50 hover:bg-green-100' 
                        : 'border-gray-200 hover:bg-gray-50'
                    }"
                    on:click={() => {
                      handleStepSelect(new CustomEvent('stepselect', { detail: { lesson, step } }));
                      lessonManager.closeLessonSelector();
                    }}
                  >
                    <span class="text-xs text-gray-500">Adım {index + 1}:</span>
                    {#if isCompleted}
                      <span class="text-green-600 text-xs ml-1">✓</span>
                    {/if}
                    <br>
                    {step.title}
                  </button>
                {/each}
                
                {#if lesson.finalProject}
                  {@const isFinalProjectCompleted = lessonManager.isStepCompleted(lesson.id, 'final-project')}
                  <button
                    class="text-left p-2 rounded border transition-colors text-sm {
                      isFinalProjectCompleted
                        ? 'border-green-200 bg-green-50 hover:bg-green-100'
                        : 'border-purple-200 bg-purple-50 hover:bg-purple-100'
                    }"
                    on:click={() => {
                      handleStepSelect(new CustomEvent('stepselect', { detail: { 
                        lesson, 
                        step: { 
                          id: 'final-project', 
                          title: lesson.finalProject?.title || 'Final Project', 
                          content: lesson.finalProject?.description || '',
                          exercise: lesson.finalProject 
                        } 
                      } }));
                      lessonManager.closeLessonSelector();
                    }}
                  >
                    <span class="text-xs {isFinalProjectCompleted ? 'text-green-600' : 'text-purple-600'}">Final Proje:</span>
                    {#if isFinalProjectCompleted}
                      <span class="text-green-600 text-xs ml-1">✓</span>
                    {/if}
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
