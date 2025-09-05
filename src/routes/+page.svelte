<script lang="ts">
  import loader from '@monaco-editor/loader';
  import { onMount, onDestroy } from 'svelte';
  import { usePyodide } from '$lib/pyodide';
  import ChatPanel from '$lib/ChatPanel.svelte';
  import LessonNav from '$lib/LessonNav.svelte';
  import LessonContent from '$lib/LessonContent.svelte';
  import { goto } from '$app/navigation';
  import type { PageData } from './$types';
  import { tick } from 'svelte';
  import type { Lesson, LessonStep } from '$lib/lessons';
  import { LESSONS } from '$lib/lessons';
  import { attemptTracker } from '$lib/attempt-tracker';
  import { videoStorage, VideoTriggerManager, type VideoMetadata } from '$lib/video-storage';
  import ProgressDashboard from '$lib/ProgressDashboard.svelte';
  import { 
    getLessonById, 
    getStepById, 
    getNextStep, 
    getNextLesson, 
    isStepCompleted, 
    isLessonCompleted,
    markStepCompleted, 
    markLessonCompleted 
  } from '$lib/lessons';

  export let data: PageData;
  const K_FAIL_STREAK = 'pysk:failStreak';
  let shellEl: HTMLDivElement;   // dış grid
  let pageEl: HTMLDivElement;    // sağ taraftaki (editor+konsol) grid
  let editorEl: HTMLDivElement;
  let outEl: HTMLDivElement;

  // Sol iç grid: Video + Chat
  let leftPaneEl: HTMLDivElement;
  let videoEl: HTMLVideoElement;
  let isMuted = false;    // gerçek ses durumunu yansıt

  // === Stall guard ayarı ===
  const ENABLE_STALL_GUARD = false; // Video bitene kadar overlay kalsın

async function tryAutoplayWithAudio() {
  if (!videoEl) return;
  try {
    videoEl.muted = false;    // önce sesli dene
    isMuted = false;
    await videoEl.play();     // bazı tarayıcılarda burada NotAllowedError düşer
  } catch {
    // Fallback: sessiz autoplay
    videoEl.muted = true;
    isMuted = true;
    await videoEl.play().catch(() => {});

    // İsteğe bağlı: ilk kullanıcı jestinde otomatik sesi aç
    window.addEventListener('pointerdown', () => {
      if (!videoEl) return;
      videoEl.muted = false;
      isMuted = false;
      videoEl.play().catch(() => {});
    }, { once: true, passive: true });
  }
}

  let editor: any = null;
  let monacoLib: any = null;
  let output = '';
  let running = false;

  // Lesson system state
  let currentLesson: Lesson | null = null;
  let currentStep: LessonStep | null = null;
  
  // Attempt tracking
  let currentAttemptId: string | null = null;
  
  // Chat panel reference for updates
  let chatPanelComponent: any = null;

  const pyodideReady = usePyodide();

  // Başlangıç Python kodu - kişiselleştirilmiş
  const initial = `# PyKid'e Hoş geldin, ${data.user?.name || 'Kullanıcı'}!
print("Merhaba ${data.user?.name || 'Kullanıcı'}!")
print("Python öğrenmeye hazır mısın?")
`;

  // ===== Intro Overlay (tam ekran video) =====
  let introOpen = false;                         // overlay açık mı
  let introVideoEl: HTMLVideoElement;            // overlay içi video
  let introBoxEl: HTMLDivElement;                // overlay container (animasyon hedefi)
  //const INTRO_LS_KEY = 'pysk:intro:played:v1';   // tek seferlik anahtar
  // ---- Intro anahtarını kullanıcıya göre üret ----
  type UserLike = { id?: string; email?: string; name?: string } | undefined | null;

  const INTRO_KEY_PREFIX = 'pysk:intro:played:v1:';          // sürümleyebilirsin
  const USE_SESSION_STORAGE = false;                          // true yaparsan oturum bazlı olur

  function storage() { return USE_SESSION_STORAGE ? sessionStorage : localStorage; }

  function makeIntroKey(u: UserLike) {
    // Hesaba göre ayır: id > email > name > 'anon'
    const id = (u?.id || u?.email || u?.name || 'anon').toString();
    return INTRO_KEY_PREFIX + id;
  }

  // data.user değişince reactive güncelle
  let INTRO_LS_KEY = makeIntroKey(data.user);
  $: INTRO_LS_KEY = makeIntroKey(data.user);



  let introStallTimer: ReturnType<typeof setTimeout> | null = null;
  const STALL_MS = 20_00;                       // ilerleme durursa güvenli kapan
  const CONTINUE_IN_PANE = true;                 // küçük pencerede kaldığı yerden devam et

  function armStallGuard() {
    if (!ENABLE_STALL_GUARD) return; // <-- tek satır koruma
    if (introStallTimer) clearTimeout(introStallTimer);
    introStallTimer = setTimeout(() => endIntroScale(), STALL_MS);
  }

  async function maybeRunIntro() {
  // ?intro=1 ile zorla gösterme (debug/test)
  const qs = new URLSearchParams(location.search);
  const force = qs.get('intro') === '1';
  if (force) storage().removeItem(INTRO_LS_KEY);

  // Kullanıcı varsa ve bu kullanıcı için daha önce oynatılmadıysa
  if (data.user && (!storage().getItem(INTRO_LS_KEY) || force)) {
    introOpen = true;
    await tick();

    try {
      if (introVideoEl) {
        introVideoEl.muted = true;
        (introVideoEl as any).playsInline = true;
        await introVideoEl.play().catch(() => {});
      }
    } catch {}

    // Sonuna kadar oynatma: yalnızca emniyet kemeri istersen armStallGuard() çağır
    /*
    armStallGuard();                         
    introVideoEl?.addEventListener('timeupdate', armStallGuard);*/

      if (ENABLE_STALL_GUARD) {
        armStallGuard();
        introVideoEl?.addEventListener('timeupdate', armStallGuard);
      }
    }
  }
  function finishIntro() {
    introOpen = false;
    storage().setItem(INTRO_LS_KEY, '1');     // <-- burada storage() kullanıyoruz
    if (introStallTimer) { clearTimeout(introStallTimer); introStallTimer = null; }
    introVideoEl?.removeEventListener('timeupdate', armStallGuard);
  }

  function endIntroScale() {
    if (!introOpen) return;

    // Hedef: sol paneldeki kalıcı video (videoEl)
    if (introBoxEl && videoEl) {
      try {
        const t = videoEl.getBoundingClientRect();
        const sw = window.innerWidth;
        const sh = window.innerHeight;

        const dx = (t.left + t.width / 2) - (sw / 2);
        const dy = (t.top  + t.height / 2) - (sh / 2);
        const sx = t.width / sw;
        const sy = t.height / sh;

        const anim = (introBoxEl as HTMLElement).animate(
          [
            { transform: 'translate(0,0) scale(1)', opacity: 1 },
            { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.98 }
          ],
          { duration: 600, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }
        );

        anim.onfinish = async () => {
          // Kaldığı yerden devam etmeyi dene
          if (CONTINUE_IN_PANE && videoEl && introVideoEl) {
            try {
              videoEl.currentTime = introVideoEl.currentTime || 0;
              // Sessizce devam et (autoplay kısıtları)
              const wasPaused = introVideoEl.paused;
              if (!wasPaused) {
                (videoEl as any).muted = true;
                await videoEl.play().catch(() => {});
              }
            } catch {}
          }
          finishIntro();
        };
        return;
      } catch {
        // Fallback: direkt bitir
      }
    }

    finishIntro();
  }

  //************** Intro Event Handlers **************//
  // ---- Event ile tekrar oynatma: panelden TAM EKRANA büyüt, bitince panele küçült ----
type OpenIntroOpts = { grow?: boolean; startAt?: number; unmute?: boolean; ignoreStorage?: boolean };
/*
async function openIntro(opts: OpenIntroOpts = {}) {
  // grow: panelden tam ekrana büyüt
  // startAt: saniye cinsinden başlat
  // unmute: sesi açmayı dener (tarayıcı gesture isteyebilir)
  // ignoreStorage: true ise localStorage "bir kere oynatıldı" kontrolünü yok say
  const { grow = true, startAt = 0, unmute = false, ignoreStorage = true } = opts;

  // İlk girişteki tek-sefer kontrolünü bypass edelim (replay için)
  if (!ignoreStorage && storage().getItem(INTRO_LS_KEY)) return;

  introOpen = true;
  await tick(); // DOM hazır olsun

  try {
    if (introVideoEl) {
      introVideoEl.currentTime = Math.max(0, startAt);
      introVideoEl.muted = !unmute;          // autoplay gereği varsayılan sessiz
      (introVideoEl as any).playsInline = true;
    }
  } catch {}

  // Panel videosunun boyutundan TAM ekrana büyüterek başla
  if (grow && introBoxEl && videoEl) {
    try {
      const t = videoEl.getBoundingClientRect();
      const sw = window.innerWidth;
      const sh = window.innerHeight;
      const dx = (t.left + t.width / 2) - (sw / 2);
      const dy = (t.top  + t.height / 2) - (sh / 2);
      const sx = t.width / sw;
      const sy = t.height / sh;

      (introBoxEl as HTMLElement).animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.98 },
          { transform: 'translate(0,0) scale(1)', opacity: 1 }
        ],
        { duration: 600, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }
      );
    } catch {  }
  }

  // Videoyu başlat
  try { await introVideoEl?.play(); } catch { }

  // Sonuna kadar oynat, ama takılırsa emniyet kemeri dursun
  //armStallGuard();
  //introVideoEl?.addEventListener('timeupdate', armStallGuard);

  if (ENABLE_STALL_GUARD) {
  armStallGuard();
  introVideoEl?.addEventListener('timeupdate', armStallGuard);
}
}*/
async function openIntro(opts: OpenIntroOpts = {}) {
  // grow: panelden tam ekrana büyüt
  // startAt: saniye cinsinden başlangıç
  // unmute: sesi açmayı dener (tarayıcı gesture isteyebilir)
  // ignoreStorage: true ise LS "oynatıldı" kontrolünü yok say
  const { grow = true, startAt = 0, unmute = false, ignoreStorage = true } = opts;

  // Tek-sefer kontrolü (replay değilse)
  if (!ignoreStorage && storage().getItem(INTRO_LS_KEY)) return;

  // Panel videosu oynuyorsa sustur/durdur (iki ses karışmasın)
  try { videoEl?.pause(); } catch {}

  introOpen = true;
  await tick(); // DOM hazır

  const v = introVideoEl;
  if (v) {
    // --- ÖNEMLİ: Daima sessiz başlat (autoplay policy için güvenli yol) ---
    v.muted = true;
    v.setAttribute('muted', '');  // iOS Safari için gerekli
    (v as any).playsInline = true;

    const applyStartAndPlay = () => {
      try { v.currentTime = Math.max(0, startAt); } catch {}

      v.play().catch(() => {}); // mobilde gesture gerekebilir

      // --- Buradan itibaren: programatik unmute denemeleri (Chromium ağırlıklı) ---
      // 1) Microtask/next tick (play çağrısının hemen ardından)
      setTimeout(() => tryForceUnmute(v), 0);

      // 2) playing event'inde (bazı motorlar burada sesi açmaya izin veriyor)
      const onPlaying = () => tryForceUnmute(v);
      v.addEventListener('playing', onPlaying, { once: true });

      // 3) Küçük gecikmeyle yedek deneme (ör. codec init gecikirse)
      setTimeout(() => { if (v.muted) tryForceUnmute(v); }, 800);

      if (ENABLE_STALL_GUARD) {
        armStallGuard();
        v.addEventListener('timeupdate', armStallGuard);
      }
    };

    // Metadata hazırsa hemen seek; değilse hazır olunca yap
    if (v.readyState >= 1) {
      applyStartAndPlay();
    } else {
      const onMeta = () => {
        v.removeEventListener('loadedmetadata', onMeta);
        applyStartAndPlay();
      };
      v.addEventListener('loadedmetadata', onMeta, { once: true });
    }
  }

  // Panel videosunun boyutundan TAM ekrana büyütme animasyonu (opsiyonel)
  if (grow && introBoxEl && videoEl) {
    try {
      const t  = videoEl.getBoundingClientRect();
      const sw = window.innerWidth;
      const sh = window.innerHeight;
      const dx = (t.left + t.width  / 2) - (sw / 2);
      const dy = (t.top  + t.height / 2) - (sh / 2);
      const sx = t.width  / sw;
      const sy = t.height / sh;

      (introBoxEl as HTMLElement).animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.98 },
          { transform: 'translate(0,0) scale(1)', opacity: 1 }
        ],
        { duration: 600, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }
      );
    } catch { /* no-op */ }
  }
}

// Pencereden tetiklenecek event handler
type ReplayDetail = { startAt?: number; unmute?: boolean };
function onReplay(ev: Event) {
  const e = ev as CustomEvent<ReplayDetail>;
  openIntro({
    grow: true,
    startAt: e.detail?.startAt ?? 0,
    unmute: e.detail?.unmute ?? false,
    ignoreStorage: true, // replay'de LS’i yok say
  });
}
//************** Intro Event Handlers **************//



  // ===== /Intro Overlay =====

  function clearAllIntroKeys() {
    const s = storage();
    const toDelete: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith(INTRO_KEY_PREFIX)) toDelete.push(k);
    }
    toDelete.forEach(k => s.removeItem(k));
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Lokal verileri temizle
      localStorage.removeItem('user');
      clearAllIntroKeys();           // <-- tüm hesaplara ait intro izlerini sil
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

    window.addEventListener('pysk:intro:replay', onReplay);// intro replay event ekleme tarihi 19:28

    autoSelectLessonAndStep();

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

    // Intro overlay'i girişte tetikle
    await tick();

    ensureAutoplay();
    maybeRunIntro();
  });

  onDestroy(() => {
    if (introStallTimer) clearTimeout(introStallTimer);
    introVideoEl?.removeEventListener('timeupdate', armStallGuard);

    window.removeEventListener('pysk:intro:replay', onReplay);
  });

  $: if (editorEl && monacoLib && !editor) {
    editor = monacoLib.editor.create(editorEl, {
      value: initial,
      language: 'python',
      automaticLayout: true,
      fontSize: 14,
      minimap: { enabled: false }
    });
    
    // Auto-select lesson after editor is ready
    if (currentLesson && currentStep) {
      const lessonComments = generateLessonComments(currentLesson, currentStep);
      editor.setValue(lessonComments);
    }
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

  async function validateCode(code: string, lessonContext?: any) {
    try {
      const response = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          code, 
          lessonContext: lessonContext || getCurrentLessonContext() 
        })
      });

      if (!response.ok) {
        throw new Error(`Validation failed: ${response.status}`);
      }

      const result = await response.json();
      return result.validation;
    } catch (err) {
      console.error('Code validation error:', err);
      // Fallback to allow execution if validation fails
      return {
        isValid: true,
        confidence: 0.1,
        feedback: 'Doğrulama yapılamadı, kod çalıştırılıyor.',
        suggestions: [],
        errorType: null,
        educationalNotes: ''
      };
    }
  }

  async function runCode(py: Awaited<ReturnType<typeof usePyodide>>) {
    if (!editor) return;
    const code = editor.getValue();
    output = '';
    running = true;

    // Start tracking attempt if we have lesson context
    let attemptId: string | null = null;
    if (currentLesson && currentStep) {
      const exerciseId = currentStep.exercise?.id;
      attemptId = attemptTracker.startAttempt(currentLesson.id, currentStep.id, exerciseId);
      currentAttemptId = attemptId;
      attemptTracker.updateCode(code);
    }

    py.onStdout((s) => { if (s) output += s; });
    py.onStderr((s) => { if (s) output += s; });

    let executionSuccess = false;
    let executionError: string | undefined;
    let errorType: string | undefined;
    let validationResult: any;

    try {
      // Step 1: Validate code with OpenAI
      output += '🔍 Kod kontrol ediliyor...\n';
      validationResult = await validateCode(code);
      
      // Record validation result
      if (attemptId) {
        attemptTracker.recordValidation(validationResult);
      }
      
      // Step 2: Show validation feedback
      output += `\n📝 ${validationResult.feedback}\n`;
      
      if (validationResult.suggestions && validationResult.suggestions.length > 0) {
        output += '\n💡 Öneriler:\n';
        validationResult.suggestions.forEach((suggestion: string, i: number) => {
          output += `   ${i + 1}. ${suggestion}\n`;
        });
      }
      
      if (validationResult.educationalNotes) {
        output += `\n🎓 ${validationResult.educationalNotes}\n`;
      }
      
      output += '\n' + '='.repeat(40) + '\n';
      
      // Step 3: Run code in Pyodide (always run, validation is for feedback only)
      output += '🚀 Kod çalıştırılıyor...\n\n';
      await py.run(code);
      executionSuccess = true;
      
    } catch (e: any) {
      executionSuccess = false;
      executionError = e?.message || String(e);
      
      // Categorize error type
      if (executionError && executionError.includes('SyntaxError')) {
        errorType = 'syntax';
      } else if (executionError && (executionError.includes('NameError') || executionError.includes('AttributeError'))) {
        errorType = 'logic';
      } else if (executionError && executionError.includes('TimeoutError')) {
        errorType = 'timeout';
      } else {
        errorType = 'runtime';
      }
      
      output += `\n[Hata] ${executionError}`;
    } finally {
      running = false;
      
      // Record execution results and finish attempt
      if (attemptId) {
        attemptTracker.recordExecution(executionSuccess, output, executionError, errorType);
        
        // Determine if attempt was successful based on validation and execution
        const isSuccessful = executionSuccess && 
          (validationResult?.isValid || validationResult?.confidence > 0.7);
        
        attemptTracker.finishAttempt(isSuccessful);
        currentAttemptId = null;
        
        // Auto-progress to next step/lesson if successful
        if (isSuccessful) {
          localStorage.setItem(K_FAIL_STREAK, '0');

          failReplayTriggeredForThisStreak = false;          // yeni bir seriye başlıyoruz
          
          // Reset video triggers on successful completion
          if (currentLesson && currentStep) {
            resetVideoTriggers(currentLesson, currentStep);
            
            // Show congratulations video for successful step completion
            showCongratulationsVideo(currentLesson, currentStep, false);
          }
          
          fireReplay(); 
          await handleAutoProgression();
        }
        else
        {
          // Başarısızlık: ardışık fail say
          const s = (parseInt(localStorage.getItem(K_FAIL_STREAK) || '0', 10) || 0) + 1;
          localStorage.setItem(K_FAIL_STREAK, String(s));
          
          // Video trigger manager ile failed attempt sayısını artır
          if (currentLesson && currentStep) {
            VideoTriggerManager.incrementFailedAttempts(currentLesson.id, currentStep.id);
          }

          // 3'e ulaşınca tetikle ve sıfırla
          if (s >= 3) {
            // Check for help video trigger
            if (currentLesson && currentStep) {
              checkHelpVideo(currentLesson, currentStep, s);
            }
            
            fireReplay(); // sadece event
            localStorage.setItem(K_FAIL_STREAK, '0'); // yeni seri başlar
          }
        }
      }
    }
  }
  
  // Handle automatic progression after successful completion
  async function handleAutoProgression() {
    if (!currentLesson || !currentStep) return;
    
    // Mark current step as completed
    markStepCompleted(currentLesson.id, currentStep.id);
    
    // Check if it's an exercise step and was successful
    if (currentStep.exercise) {
      // Wait a bit for user to see success message
      setTimeout(() => {
        // Capture current values to avoid null checks
        const lesson = currentLesson;
        const step = currentStep;
        if (!lesson || !step) return;
        
        // Try to progress to next step
        const nextStep = getNextStep(lesson.id, step.id);
        
        if (nextStep) {
          // Move to next step in same lesson
          currentStep = nextStep;
          
          if (editor) {
            const lessonComments = generateLessonComments(lesson, nextStep);
            editor.setValue(lessonComments);
          }
          
          // Update chat for lesson change
          if (chatPanelComponent?.updateForLessonChange) {
            chatPanelComponent.updateForLessonChange();
          }
          
          // Show progression message
          output += `\n\n🎉 Harika! Bir sonraki adıma geçiyoruz: "${nextStep.title}"\n`;
        } else {
          // No more steps, check for final project
          if (lesson.finalProject && !isStepCompleted(lesson.id, 'final-project')) {
            // Move to final project
            currentStep = {
              id: 'final-project',
              title: lesson.finalProject.title,
              content: lesson.finalProject.description,
              exercise: lesson.finalProject
            };
            
            if (editor) {
              const lessonComments = generateLessonComments(lesson, currentStep);
              editor.setValue(lessonComments);
            }
            
            // Update chat for lesson change
            if (chatPanelComponent?.updateForLessonChange) {
              chatPanelComponent.updateForLessonChange();
            }
            
            output += `\n\n🎯 Tüm adımları tamamladın! Final projesine geçiyoruz: "${lesson.finalProject.title}"\n`;
          } else {
            // Mark lesson as completed and move to next lesson
            markLessonCompleted(lesson.id);
            
            // Show congratulations video for lesson completion
            showCongratulationsVideo(lesson, undefined, true);
            
            const nextLesson = getNextLesson(lesson.id);
            if (nextLesson) {
              currentLesson = nextLesson;
              currentStep = nextLesson.steps[0];
              
              if (editor) {
                const lessonComments = generateLessonComments(nextLesson, nextLesson.steps[0]);
                editor.setValue(lessonComments);
              }
              
              // Update chat for lesson change
              if (chatPanelComponent?.updateForLessonChange) {
                chatPanelComponent.updateForLessonChange();
              }
              
              output += `\n\n🌟 Dersi tamamladın! Bir sonraki derse geçiyoruz: "${nextLesson.title}"\n`;
            } else {
              // All lessons completed!
              output += `\n\n🎉🎉🎉 TEBRİKLER! Tüm dersleri tamamladın! Python öğrenme serüvenin harika geçti! 🎉🎉🎉\n`;
            }
          }
        }
      }, 2000); // 2 second delay to let user read success message
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

  // Track chat interaction
  function handleChatInteraction() {
    if (currentAttemptId) {
      attemptTracker.recordHelpRequest('chat');
    }
  }

  // Track video watching
  function handleVideoPlay() {
    if (currentAttemptId) {
      attemptTracker.recordHelpRequest('video');
    }
  }

  // Lesson system event handlers
  function handleLessonSelect(event: CustomEvent<{ lesson: Lesson }>) {
    const { lesson } = event.detail;
    currentLesson = lesson;
    
    // Find first uncompleted step in selected lesson
    const firstUncompletedStep = lesson.steps.find(step => 
      !isStepCompleted(lesson.id, step.id)
    );
    
    // Use first uncompleted step or first step if all completed
    currentStep = firstUncompletedStep || lesson.steps[0] || null;
    
    // Load lesson content as comments in editor
    if (currentStep && editor) {
      const lessonComments = generateLessonComments(lesson, currentStep);
      editor.setValue(lessonComments);
    }
    
    // Update chat for lesson change
    if (chatPanelComponent?.updateForLessonChange) {
      chatPanelComponent.updateForLessonChange();
    }
    
    // Check for lesson start video trigger
    checkLessonStartVideo(lesson);
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
    
    // Update chat for lesson change
    if (chatPanelComponent?.updateForLessonChange) {
      chatPanelComponent.updateForLessonChange();
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
    // Auto-select appropriate lesson instead of clearing
    autoSelectLessonAndStep();
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
  
  // Progress dashboard state
  let showProgressDashboard = false;

  // Auto-select lesson and step on app start
  /*
  onMount(() => {
    autoSelectLessonAndStep();
  });*/

  // Function to automatically select appropriate lesson and step
  function autoSelectLessonAndStep() {
    // Find first uncompleted lesson
    const firstUncompletedLesson = LESSONS.find(lesson => !isLessonCompleted(lesson.id));
    
    if (firstUncompletedLesson) {
      // Find first uncompleted step in the lesson
      const firstUncompletedStep = firstUncompletedLesson.steps.find(step => 
        !isStepCompleted(firstUncompletedLesson.id, step.id)
      );
      
      if (firstUncompletedStep) {
        // Set current lesson and step
        currentLesson = firstUncompletedLesson;
        currentStep = firstUncompletedStep;
        
        // Load lesson content in editor
        if (editor) {
          const lessonComments = generateLessonComments(firstUncompletedLesson, firstUncompletedStep);
          editor.setValue(lessonComments);
        }
      } else {
        // All steps completed, show final project if exists
        if (firstUncompletedLesson.finalProject) {
          currentLesson = firstUncompletedLesson;
          currentStep = {
            id: 'final-project',
            title: firstUncompletedLesson.finalProject.title,
            content: firstUncompletedLesson.finalProject.description,
            exercise: firstUncompletedLesson.finalProject
          };
          
          if (editor) {
            const lessonComments = generateLessonComments(firstUncompletedLesson, currentStep);
            editor.setValue(lessonComments);
          }
        }
      }
    } else {
      // All lessons completed - start from first lesson for review
      const firstLesson = LESSONS[0];
      if (firstLesson) {
        currentLesson = firstLesson;
        currentStep = firstLesson.steps[0];
        
        if (editor) {
          const lessonComments = generateLessonComments(firstLesson, firstLesson.steps[0]);
          editor.setValue(lessonComments);
        }
      }
    }
    
    // Update chat for lesson change (delayed to ensure chat component is ready)
    setTimeout(() => {
      if (chatPanelComponent?.updateForLessonChange) {
        chatPanelComponent.updateForLessonChange();
      }
    }, 1000);
  }

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


    // ---- Video kontrol durumu ---- 19:47
  let showVideoControls = false;   // <-- bool: true iken custom kontroller görünsün
  let isPlaying = false;
  let showNativeControls = false;

  function playVideo() {
    if (!videoEl) return;
    // Autoplay kısıtlarına takılmamak için muted başlat, sonra aç istersen
    (videoEl as HTMLVideoElement).play().catch(() => {});
  }
  function pauseVideo() {
    videoEl?.pause();
  }
  function togglePlay() {
    if (!videoEl) return;
    videoEl.paused ? playVideo() : pauseVideo();
  }


 

let triedAutoOnce = false;
let autoplayMutedFallback = false;
let unmutedOnce = false;

async function ensureAutoplay() {
  if (!videoEl || triedAutoOnce) return;
  triedAutoOnce = true;
  autoplayMutedFallback = false;

  try {
    // 1) SESLİ dene
    videoEl.muted = false;
    videoEl.removeAttribute('muted');   // iOS için önemli
    await videoEl.play();
  } catch {
    // 2) Sessiz autoplay’e düş
    autoplayMutedFallback = true;
    videoEl.muted = true;
    videoEl.setAttribute('muted', '');  // iOS Safari'de şart
    await videoEl.play().catch(() => {});
    armUnmuteOnce();                    // ilk jestte sadece unmute et
  }
}

// Kullanıcı ilk jestinde sadece sesi aç (play() çağırma!)
function armUnmuteOnce() {
  if (unmutedOnce) return;
  const handler = () => {
    if (!videoEl) return;
    if (autoplayMutedFallback) {
      videoEl.muted = false;
      videoEl.removeAttribute('muted'); // yoksa iOS yine sessiz kalabilir
      unmutedOnce = true;
    }
    window.removeEventListener('pointerdown', handler);
    window.removeEventListener('keydown', handler);
    videoEl?.removeEventListener('click', handler);
  };
  window.addEventListener('pointerdown', handler, { once: true, passive: true });
  window.addEventListener('keydown', handler, { once: true, passive: true });
  // iOS’ta native UI window event’i tüketirse garanti olsun diye:
  videoEl?.addEventListener('click', handler, { once: true, passive: true });
}

// --- Replay test ayarları --- 20:51
const REPLAY_ON_SUCCESS =
  new URLSearchParams(location.search).get('replay') === '1'; // ?replay=1 ise başarıda otomatik tetikle
// 3 fail sonrası da denemek için: ?replayfail=1
const REPLAY_ON_FAIL3   = new URLSearchParams(location.search).get('replayfail') === '1';
// Fail serisi için tek seferlik tetikleme koruması
let failReplayTriggeredForThisStreak = false;

function fireReplay(startAt?: number, unmute = false) {
  const detail = {
    // "ilk defa gibi" => default 0’dan başlat
    startAt: typeof startAt === 'number' ? startAt : 0,
    unmute
  };
  window.dispatchEvent(new CustomEvent('pysk:intro:replay', { detail }));

  const K = 'pysk:replay:fireCount';
  const n = Number(localStorage.getItem(K) || '0') + 1;
  localStorage.setItem(K, String(n));
  console.debug('[pysk] replay fired', detail, 'count=', n);
}

function tryForceUnmute(v: HTMLVideoElement) {
  try {
    v.muted = false;
    v.removeAttribute('muted');
    v.volume = 1;
    // Bazı motorlarda unmute sonrası play tekrar gerekebilir:
    v.play().catch(() => {});
  } catch {}
}

// Video trigger functions
async function checkLessonStartVideo(lesson: Lesson) {
  if (!lesson) return;
  
  // Check if lesson start video has already been shown
  if (VideoTriggerManager.hasShownLessonStartVideo(lesson.id)) {
    return;
  }
  
  try {
    // Get intro video for this lesson
    const videoMetadata = await videoStorage.getVideoForLesson(lesson.id, undefined, 'intro');
    
    if (videoMetadata && videoStorage.shouldTriggerVideo(videoMetadata, { isLessonStart: true })) {
      // Mark as shown to prevent duplicate triggers
      VideoTriggerManager.markLessonStartVideoShown(lesson.id);
      
      // Update main video player to show intro
      if (videoEl) {
        const videoUrl = videoStorage.getVideoUrl(videoMetadata.id);
        videoEl.src = videoUrl;
        
        // Add visual indicator that this is a lesson intro
        output += `\n🎬 ${lesson.title} dersine hoş geldin! Tanıtım videosu oynatılıyor...\n\n`;
        
        // Auto-play intro video
        try {
          await videoEl.play();
          handleVideoPlay();
        } catch (error) {
          console.log('Auto-play prevented, user interaction required');
        }
      }
    }
  } catch (error) {
    console.error('Error loading lesson start video:', error);
  }
}

async function checkHelpVideo(lesson: Lesson, step: LessonStep, failedAttempts: number) {
  if (!lesson || !step) return;
  
  // Check if help video has already been shown for this streak
  if (VideoTriggerManager.hasShownHelpVideoForStreak(lesson.id, step.id)) {
    return;
  }
  
  try {
    // Get help video for this lesson
    const videoMetadata = await videoStorage.getVideoForLesson(lesson.id, step.id, 'help');
    
    if (videoMetadata && videoStorage.shouldTriggerVideo(videoMetadata, { 
      failedAttemptCount: failedAttempts 
    })) {
      // Mark as shown for this streak
      VideoTriggerManager.markHelpVideoShown(lesson.id, step.id);
      
      // Update main video player to show help video and play directly
      if (videoEl) {
        const videoUrl = videoStorage.getVideoUrl(videoMetadata.id);
        videoEl.src = videoUrl;
        
        // Play help video directly since it contains interactive "do you need help?" content
        try {
          await videoEl.play();
          handleVideoPlay(); // Track video interaction
        } catch (error) {
          console.log('Auto-play prevented, user interaction required');
        }
      }
    }
  } catch (error) {
    console.error('Error loading help video:', error);
  }
}

// Show congratulations video after successful step/lesson completion
async function showCongratulationsVideo(lesson: Lesson, step?: LessonStep, isLessonComplete: boolean = false) {
  if (!lesson) return;
  
  try {
    // Determine video type based on completion type
    const videoType: VideoMetadata['type'] = 'congratulations';
    const videoMetadata = await videoStorage.getVideoForLesson(
      lesson.id, 
      isLessonComplete ? undefined : step?.id, 
      videoType
    );
    
    if (videoMetadata && videoStorage.shouldTriggerVideo(videoMetadata, { 
      isStepComplete: !isLessonComplete && !!step,
      isLessonComplete: isLessonComplete
    })) {
      
      // Add congratulations message to output
      if (isLessonComplete) {
        output += `\n🎉 Tebrikler! "${lesson.title}" dersini tamamladın! 🎊\n`;
        output += `\n🌟 Harika bir iş çıkardın! Kutlama videosu oynatılıyor...\n\n`;
      } else if (step) {
        output += `\n✨ Aferin! "${step.title}" adımını başarıyla tamamladın! 👏\n`;
        output += `\n🎯 Kutlama videosu oynatılıyor...\n\n`;
      }
      
      // Update main video player to show congratulations video
      if (videoEl) {
        const videoUrl = videoStorage.getVideoUrl(videoMetadata.id);
        videoEl.src = videoUrl;
        
        // Play congratulations video with a short delay for better UX
        setTimeout(async () => {
          try {
            await videoEl.play();
            handleVideoPlay(); // Track video interaction
          } catch (error) {
            console.log('Auto-play prevented, user interaction required');
          }
        }, 1000); // 1 second delay
      }
    }
  } catch (error) {
    console.error('Error loading congratulations video:', error);
  }
}

// Reset failed attempts and video triggers on successful completion
function resetVideoTriggers(lesson: Lesson, step: LessonStep) {
  if (lesson && step) {
    VideoTriggerManager.resetFailedAttempts(lesson.id, step.id);
  }
}



</script>

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
  :global(.monaco-editor),
  :global(.monaco-editor .overflow-guard),
  :global(.monaco-editor .monaco-editor-background),
  :global(.monaco-editor .margin){
    outline: 0 !important;
    border: 0 !important;
    box-shadow: none !important;
  }

  /* Reduced motion saygısı (opsiyonel ama iyi pratik) */
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

  <!-- ===== Intro Overlay (tam ekran) ===== -->
  <!-- ===== Intro Overlay (tam ekran) ===== -->
{#if introOpen}
  <div
    class="fixed inset-0 z-[1000] grid place-items-center bg-black/80
           [backdrop-filter:blur(6px)] [-webkit-backdrop-filter:blur(6px)]"
    bind:this={introBoxEl}
  >
    <video
      bind:this={introVideoEl}
      src="/videos/example.mp4"
      class="w-[min(92vw,1200px)] h-[min(92vh,680px)] object-contain
             rounded-[0.6rem] shadow-[0_28px_80px_rgba(0,0,0,.45)]"
      autoplay
      on:stalled={() => { if (ENABLE_STALL_GUARD) armStallGuard(); }}
      playsinline
      on:ended={endIntroScale}
      on:error={() => endIntroScale()}
      on:loadedmetadata={() => introVideoEl?.play().catch(()=>{})}
    ></video>

    {#if introVideoEl?.muted}
      <!-- 🔊 SES AÇ butonu: video muted ise görünür -->
      <button
        class="absolute top-4 right-20 px-3 py-1.5 rounded-md border border-white/30
               text-white/90 bg-white/10 hover:bg-white/20"
        on:click={() => { introVideoEl && tryForceUnmute(introVideoEl); }}
        aria-label="Sesli oynat"
        title="Sesli oynat"
      >
        🔊 Ses Aç
      </button>
    {/if}

    <button
      class="absolute top-4 right-4 px-3 py-1.5 rounded-md border border-white/30
             text-white/90 bg-white/10 hover:bg-white/20"
      on:click={endIntroScale}
      aria-label="Geç"
      title="Geç"
    >
      Geç
    </button>
  </div>
{/if}

  <!-- ===== /Intro Overlay ===== -->

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
          <!-- Video başlık ve custom kontroller 
          <video
            bind:this={videoEl}
            controls
            playsinline
            class="w-full h-full object-contain bg-black rounded-[0.5rem]"
            aria-label="PyKid tanıtım videosu"
            on:play={handleVideoPlay}
          >
            <source src="/videos/example.mp4" type="video/mp4" />
            <track kind="captions" src="/videos/example.tr.vtt" srclang="tr" label="Türkçe" default />
            Tarayıcınız video etiketini desteklemiyor.
          </video>-->
          <video
            bind:this={videoEl}
            controls={showNativeControls}  
            playsinline
            autoplay
            preload="auto"
            class="w-full h-full object-contain bg-black rounded-[0.5rem]"
            aria-label="PyKid tanıtım videosu"
            on:loadedmetadata={ensureAutoplay}
            on:play={() => { handleVideoPlay(); isPlaying = true; }}
            on:pause={() => { isPlaying = false; }}
            on:ended={() => { isPlaying = false; }}
            on:click={() => { if (!showNativeControls) togglePlay(); }}  
          >
            <source src="/videos/example.mp4" type="video/mp4" />
            <track kind="captions" src="/videos/example.tr.vtt" srclang="tr" label="Türkçe" default />
            Tarayıcınız video etiketini desteklemiyor.
          </video>

          {#if showVideoControls}
            <div
              class="absolute bottom-3 left-3 z-[2] flex items-center gap-2 pointer-events-auto"
            >
              <button
                class="px-3 py-1.5 rounded-md bg-[var(--accent)] text-white border-0 shadow
                       hover:brightness-110 active:scale-[.98]"
                on:click={togglePlay}
                aria-label={isPlaying ? 'Durdur' : 'Oynat'}
                title={isPlaying ? 'Durdur' : 'Oynat'}
              >
                {isPlaying ? '⏸ Durdur' : '▶ Oynat'}
              </button>

              <button
                class="px-3 py-1.5 rounded-md border border-[var(--line)] bg-white/70 hover:bg-white"
                on:click={() => { if (videoEl) { videoEl.currentTime = 0; playVideo(); } }}
                title="Baştan Oynat"
              >
                ⟲ Baştan
              </button>
            </div>
          {/if}


        </div>
      </div>

      <!-- GUTTER (Yatay: Video ↔ Chat) -->
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
          <ChatPanel 
            bind:this={chatPanelComponent}
            {getCurrentEditorContent} 
            {getCurrentLessonContext} 
            onChatInteraction={handleChatInteraction} 
          />
        </div>
      </div>
    </div>

    <!-- GUTTER (Dikey: Sol sütun ↔ IDE) -->
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

      <!-- GUTTER (Yatay: Editor ↔ Konsol) -->
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
            <button
              class="px-3 py-1.5 rounded-md border border-[var(--line)] bg-white/70 hover:bg-white"
              on:click={() => showProgressDashboard = !showProgressDashboard}
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
            {output || 'Çıktı burada görünecek.'}
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Progress Dashboard Modal -->
  {#if showProgressDashboard}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" on:click={() => showProgressDashboard = false}>
      <div class="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] m-4" on:click|stopPropagation>
        <div class="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 class="text-xl font-bold text-gray-800">📊 İlerleme Panosu</h2>
          <button 
            class="text-gray-500 hover:text-gray-700 text-xl"
            on:click={() => showProgressDashboard = false}
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
                  {@const isCompleted = isStepCompleted(lesson.id, step.id)}
                  <button
                    class="text-left p-2 rounded border transition-colors text-sm {
                      isCompleted 
                        ? 'border-green-200 bg-green-50 hover:bg-green-100' 
                        : 'border-gray-200 hover:bg-gray-50'
                    }"
                    on:click={() => {
                      handleStepSelect(new CustomEvent('stepselect', { detail: { lesson, step } }));
                      showLessonSelector = false;
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
                  {@const isFinalProjectCompleted = isStepCompleted(lesson.id, 'final-project')}
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
                      showLessonSelector = false;
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

<!-- Replay Intro Button
<button
  class="px-3 py-1.5 rounded-md border border-[var(--line)] bg-white/70 hover:bg-white"
  title="Tanıtımı tekrar izle"
  on:click={() => {
    const start = (videoEl?.currentTime ?? 0);
    window.dispatchEvent(new CustomEvent('pysk:intro:replay', { detail: { startAt: start, unmute: false } }));
  }}
>
  🔁 Tanıtım
</button>-->