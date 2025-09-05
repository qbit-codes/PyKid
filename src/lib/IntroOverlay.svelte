<!-- src/lib/IntroOverlay.svelte -->
<!-- Full-screen intro video overlay component -->

<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  type UserLike = { id?: string; email?: string; name?: string } | undefined | null;

  export let user: UserLike = null;
  export let introVideoSrc: string = '/videos/example.mp4';

  // Overlay state
  let introOpen = false;
  let introVideoEl: HTMLVideoElement;
  let introBoxEl: HTMLDivElement;
  let introStallTimer: ReturnType<typeof setTimeout> | null = null;

  // Configuration
  const INTRO_KEY_PREFIX = 'pysk:intro:played:v1:';
  const USE_SESSION_STORAGE = false;
  const STALL_MS = 2000;
  const ENABLE_STALL_GUARD = false;

  // Storage helper
  function storage() { 
    return USE_SESSION_STORAGE ? sessionStorage : localStorage; 
  }

  // Generate intro key based on user
  function makeIntroKey(u: UserLike) {
    const id = (u?.id || u?.email || u?.name || 'anon').toString();
    return INTRO_KEY_PREFIX + id;
  }

  // Reactive intro key
  $: INTRO_LS_KEY = makeIntroKey(user);

  // Intro video manager
  const introVideoManager = {
    async init(videoElement: HTMLVideoElement) {
      if (!videoElement) return;
      
      try {
        videoElement.muted = true;
        videoElement.setAttribute('muted', '');
        videoElement.playsInline = true;
        await videoElement.play().catch(() => {});
      } catch (error) {
        console.log('Intro video autoplay failed:', error);
      }
    },

    async playWithUnmuteAttempts(videoElement: HTMLVideoElement, startAt: number = 0) {
      if (!videoElement) return;
      
      try {
        videoElement.currentTime = Math.max(0, startAt);
      } catch {}

      videoElement.play().catch(() => {});

      // Unmute attempts
      setTimeout(() => forceUnmute(videoElement), 0);
      
      const onPlaying = () => forceUnmute(videoElement);
      videoElement.addEventListener('playing', onPlaying, { once: true });
      
      setTimeout(() => { 
        if (videoElement.muted) forceUnmute(videoElement); 
      }, 800);
    }
  };

  // Force unmute
  function forceUnmute(videoElement: HTMLVideoElement) {
    try {
      videoElement.muted = false;
      videoElement.removeAttribute('muted');
      videoElement.volume = 1;
      videoElement.play().catch(() => {});
    } catch {}
  }

  // Stall guard
  function armStallGuard() {
    if (!ENABLE_STALL_GUARD) return;
    if (introStallTimer) clearTimeout(introStallTimer);
    introStallTimer = setTimeout(() => endIntroScale(), STALL_MS);
  }

  // Check and maybe run intro
  async function maybeRunIntro() {
    const qs = new URLSearchParams(location.search);
    const force = qs.get('intro') === '1';
    if (force) storage().removeItem(INTRO_LS_KEY);

    if (user && (!storage().getItem(INTRO_LS_KEY) || force)) {
      introOpen = true;
      await tick();

      if (introVideoEl) {
        await introVideoManager.init(introVideoEl);
      }

      if (ENABLE_STALL_GUARD) {
        armStallGuard();
        introVideoEl?.addEventListener('timeupdate', armStallGuard);
      }
    }
  }

  // Finish intro
  function finishIntro() {
    introOpen = false;
    storage().setItem(INTRO_LS_KEY, '1');
    if (introStallTimer) { 
      clearTimeout(introStallTimer); 
      introStallTimer = null; 
    }
    introVideoEl?.removeEventListener('timeupdate', armStallGuard);
  }

  // End intro with animation
  function endIntroScale() {
    if (!introOpen) return;

    if (introBoxEl) {
      try {
        const anim = (introBoxEl as HTMLElement).animate(
          [
            { transform: 'scale(1)', opacity: 1 },
            { transform: 'scale(0.8)', opacity: 0 }
          ],
          { duration: 400, easing: 'ease-in-out', fill: 'forwards' }
        );

        anim.onfinish = () => {
          finishIntro();
        };
        return;
      } catch {
        // Fallback: direct finish
      }
    }

    finishIntro();
  }

  // Open intro with options
  export async function openIntro(opts: {
    grow?: boolean;
    startAt?: number;
    unmute?: boolean;
    ignoreStorage?: boolean;
  } = {}) {
    const { grow = true, startAt = 0, unmute = false, ignoreStorage = true } = opts;

    if (!ignoreStorage && storage().getItem(INTRO_LS_KEY)) return;

    introOpen = true;
    await tick();

    if (introVideoEl) {
      await introVideoManager.init(introVideoEl);
      
      if (introVideoEl.readyState >= 1) {
        introVideoManager.playWithUnmuteAttempts(introVideoEl, startAt);
      } else {
        const onMeta = () => {
          introVideoEl.removeEventListener('loadedmetadata', onMeta);
          introVideoManager.playWithUnmuteAttempts(introVideoEl, startAt);
        };
        introVideoEl.addEventListener('loadedmetadata', onMeta, { once: true });
      }

      if (ENABLE_STALL_GUARD) {
        armStallGuard();
        introVideoEl.addEventListener('timeupdate', armStallGuard);
      }
    }

    if (grow && introBoxEl) {
      try {
        (introBoxEl as HTMLElement).animate(
          [
            { transform: 'scale(0.8)', opacity: 0.8 },
            { transform: 'scale(1)', opacity: 1 }
          ],
          { duration: 400, easing: 'ease-out', fill: 'forwards' }
        );
      } catch { /* no-op */ }
    }
  }

  // Event handlers
  function onReplay(ev: Event) {
    const e = ev as CustomEvent<{ startAt?: number; unmute?: boolean }>;
    openIntro({
      grow: true,
      startAt: e.detail?.startAt ?? 0,
      unmute: e.detail?.unmute ?? false,
      ignoreStorage: true,
    });
  }

  // Lifecycle
  onMount(async () => {
    window.addEventListener('pysk:intro:replay', onReplay);
    await tick();
    maybeRunIntro();
  });

  onDestroy(() => {
    if (introStallTimer) clearTimeout(introStallTimer);
    introVideoEl?.removeEventListener('timeupdate', armStallGuard);
    window.removeEventListener('pysk:intro:replay', onReplay);
  });
</script>

{#if introOpen}
  <div
    class="fixed inset-0 z-[1000] grid place-items-center bg-black/80
           [backdrop-filter:blur(6px)] [-webkit-backdrop-filter:blur(6px)]"
    bind:this={introBoxEl}
  >
    <video
      bind:this={introVideoEl}
      src={introVideoSrc}
      class="w-[min(92vw,1200px)] h-[min(92vh,680px)] object-contain
             rounded-[0.6rem] shadow-[0_28px_80px_rgba(0,0,0,.45)]"
      autoplay
      muted
      playsinline
      on:stalled={() => { if (ENABLE_STALL_GUARD) armStallGuard(); }}
      on:ended={endIntroScale}
      on:error={() => endIntroScale()}
    ></video>

    {#if introVideoEl?.muted}
      <button
        class="absolute top-4 right-20 px-3 py-1.5 rounded-md border border-white/30
               text-white/90 bg-white/10 hover:bg-white/20"
        on:click={() => { introVideoEl && forceUnmute(introVideoEl); }}
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