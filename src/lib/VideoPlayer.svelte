<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { videoStorage, VideoTriggerManager } from './video-storage';
  import { VIDEO_PLAYER_CONFIG, VIDEO_ERROR_CONFIG, videoUtils } from './video-config';
  import type { VideoMetadata } from './video-storage';
  
  const dispatch = createEventDispatcher<{
    play: { videoId: string; metadata: VideoMetadata };
    pause: { videoId: string; metadata: VideoMetadata };
    ended: { videoId: string; metadata: VideoMetadata };
    error: { videoId: string; error: string };
    loaded: { videoId: string; metadata: VideoMetadata };
    watchTime: { videoId: string; watchTime: number };
  }>();

  export let lessonId: string = '';
  export let stepId: string | undefined = undefined;
  export let videoType: VideoMetadata['type'] | undefined = undefined;
  export let autoplay = true;
  export let autoUnmute = false; // New option to unmute after autoplay starts
  export let showControls = true;
  export let className = '';
  export let requireUserInteraction = false; // Force user interaction before playing
  
  let videoElement: HTMLVideoElement;
  let videoMetadata: VideoMetadata | null = null;
  let isLoading = true;
  let hasError = false;
  let errorMessage = '';
  let isPlaying = false;
  let currentTime = 0;
  let duration = 0;
  let volume = 1;
  let isMuted = false;
  let watchStartTime = 0;
  let totalWatchTime = 0;
  let userHasInteracted = false;
  
  // Loading and error states
  let retryCount = 0;
  let loadingProgress = 0;
  
  $: if (lessonId || stepId !== undefined || videoType !== undefined) {
    console.log('🔄 VideoPlayer reactive trigger - lessonId:', lessonId, 'stepId:', stepId, 'videoType:', videoType);
    loadVideo();
  }
  
  async function loadVideo() {
    console.log('🎬 VideoPlayer.loadVideo called with:', { lessonId, stepId, videoType });
    isLoading = true;
    hasError = false;
    retryCount = 0;
    
    try {
      // For help, congratulations, and explanation videos, use generic video loader
      if (videoType === 'help' || videoType === 'congratulations' || videoType === 'explanation') {
        console.log('🔧 Using getGenericVideo for type:', videoType);
        videoMetadata = await videoStorage.getGenericVideo(videoType);
        console.log('📦 getGenericVideo returned:', videoMetadata);
      } else {
        console.log('🔧 Using getVideoForLesson for lesson:', lessonId, 'step:', stepId, 'type:', videoType);
        videoMetadata = await videoStorage.getVideoForLesson(lessonId, stepId, videoType);
        console.log('📦 getVideoForLesson returned:', videoMetadata);
      }
      
      console.log('📹 Video metadata loaded:', videoMetadata);
      
      if (!videoMetadata) {
        console.log('❌ No video metadata - throwing error');
        throw new Error('Video not found for this lesson');
      }
      
      console.log('▶️ Calling loadVideoElement...');
      await loadVideoElement();
      console.log('✅ loadVideoElement completed');
      
    } catch (error) {
      console.error('❌ Video loading error:', error);
      handleError(error as Error);
    }
  }
  
  async function loadVideoElement() {
    console.log('📺 Loading video element, metadata:', !!videoMetadata, 'element:', !!videoElement);
    if (!videoMetadata || !videoElement) return;
    
    const videoUrls = videoStorage.getVideoUrls(videoMetadata.id);
    console.log('🔗 Generated video URLs:', videoUrls);
    
    // Clear existing sources
    videoElement.innerHTML = '';
    
    // Add video sources with fallbacks
    videoUrls.forEach(({ url, type }) => {
      const source = document.createElement('source');
      source.src = url;
      source.type = type;
      console.log('➕ Adding source:', url, type);
      videoElement.appendChild(source);
    });
    
    // Add subtitles if available
    if (videoMetadata.subtitles) {
      videoMetadata.subtitles.forEach(subtitle => {
        const track = document.createElement('track');
        track.kind = 'captions';
        track.src = subtitle.url;
        track.srclang = subtitle.language;
        track.label = subtitle.language === 'tr' ? 'Türkçe' : subtitle.language;
        track.default = subtitle.language === 'tr';
        videoElement.appendChild(track);
      });
    }
    
    // Load the video
    console.log('▶️ Calling video.load()');
    videoElement.load();
  }
  
  function handleError(error: Error) {
    console.error('Video loading error:', error);
    hasError = true;
    
    if (retryCount < VIDEO_ERROR_CONFIG.retryAttempts) {
      // Retry loading
      setTimeout(() => {
        retryCount++;
        loadVideo();
      }, VIDEO_ERROR_CONFIG.retryDelay);
      return;
    }
    
    // Show user-friendly error message
    errorMessage = VIDEO_ERROR_CONFIG.errorMessages.generic;
    
    if (error.message.includes('not found')) {
      errorMessage = VIDEO_ERROR_CONFIG.errorMessages.notFound;
    } else if (error.message.includes('network')) {
      errorMessage = VIDEO_ERROR_CONFIG.errorMessages.networkError;
    } else if (error.message.includes('playback')) {
      errorMessage = VIDEO_ERROR_CONFIG.errorMessages.playbackError;
    }
    
    dispatch('error', { 
      videoId: videoMetadata?.id || 'unknown', 
      error: errorMessage 
    });
  }
  
  function onLoadedData() {
    console.log('✅ Video loaded successfully, duration:', videoElement.duration);
    console.log('🎯 Video metadata:', videoMetadata);
    console.log('🎚️ Autoplay settings:', { autoplay, configEnabled: VIDEO_PLAYER_CONFIG.autoplay.enabled });
    
    isLoading = false;
    duration = videoElement.duration;
    
    if (videoMetadata) {
      console.log('📤 Dispatching loaded event for video:', videoMetadata.id);
      dispatch('loaded', { 
        videoId: videoMetadata.id, 
        metadata: videoMetadata 
      });
    }
    
    // Autoplay if enabled and supported, but respect user interaction requirement
    if (autoplay && VIDEO_PLAYER_CONFIG.autoplay.enabled && !requireUserInteraction) {
      console.log('🚀 Auto-playing video');
      playVideo();
    } else {
      console.log('⏸️ Not auto-playing - autoplay:', autoplay, 'config enabled:', VIDEO_PLAYER_CONFIG.autoplay.enabled, 'requireUserInteraction:', requireUserInteraction);
    }
  }
  
  function onLoadStart() {
    loadingProgress = 0;
  }
  
  function onProgress() {
    if (videoElement.buffered.length > 0) {
      loadingProgress = (videoElement.buffered.end(0) / duration) * 100;
    }
  }
  
  async function playVideo() {
    console.log('▶️ playVideo called - element:', !!videoElement, 'metadata:', !!videoMetadata);
    
    if (!videoElement || !videoMetadata) {
      console.log('❌ Cannot play - missing element or metadata');
      return;
    }
    
    try {
      // Handle muting for autoplay
      if (autoplay && !autoUnmute) {
        console.log('🔇 Muting video for autoplay (autoUnmute=false)');
        videoElement.muted = true;
        isMuted = true;
      } else if (autoplay && autoUnmute) {
        console.log('🔇 Starting muted for autoplay, will unmute after play starts (autoUnmute=true)');
        videoElement.muted = true;
        isMuted = true;
      } else {
        console.log('🔊 Not muting - not autoplay or explicit unmute requested');
      }
      
      console.log('🎬 Calling videoElement.play()...');
      await videoElement.play();
      console.log('✅ Video is now playing!');
      
      // Auto-unmute after successful autoplay if requested
      if (autoplay && autoUnmute) {
        console.log('🔊 Auto-unmuting video after successful autoplay');
        setTimeout(() => {
          if (videoElement && isPlaying) {
            videoElement.muted = false;
            isMuted = false;
            console.log('🔊 Video unmuted successfully');
          }
        }, 500); // Small delay to ensure autoplay has started
      }
      
      isPlaying = true;
      watchStartTime = Date.now();
      
      console.log('📤 Dispatching play event for video:', videoMetadata.id);
      dispatch('play', { 
        videoId: videoMetadata.id, 
        metadata: videoMetadata 
      });
      
    } catch (error) {
      console.error('💥 Play error:', error);
      handleError(error as Error);
    }
  }
  
  function pauseVideo() {
    if (!videoElement || !videoMetadata) return;
    
    videoElement.pause();
    isPlaying = false;
    
    // Track watch time
    if (watchStartTime > 0) {
      totalWatchTime += Date.now() - watchStartTime;
      watchStartTime = 0;
    }
    
    dispatch('pause', { 
      videoId: videoMetadata.id, 
      metadata: videoMetadata 
    });
  }
  
  function togglePlay() {
    if (isPlaying) {
      pauseVideo();
    } else {
      if (requireUserInteraction && !userHasInteracted) {
        userHasInteracted = true;
      }
      playVideo();
    }
  }
  
  function handleUserPlay() {
    userHasInteracted = true;
    playVideo();
  }
  
  function onEnded() {
    isPlaying = false;
    
    // Track final watch time
    if (watchStartTime > 0) {
      totalWatchTime += Date.now() - watchStartTime;
      watchStartTime = 0;
    }
    
    if (videoMetadata) {
      dispatch('ended', { 
        videoId: videoMetadata.id, 
        metadata: videoMetadata 
      });
      
      dispatch('watchTime', {
        videoId: videoMetadata.id,
        watchTime: totalWatchTime
      });
    }
  }
  
  function onTimeUpdate() {
    currentTime = videoElement.currentTime;
  }
  
  function seekTo(time: number) {
    if (videoElement) {
      videoElement.currentTime = time;
    }
  }
  
  function setVolume(newVolume: number) {
    if (videoElement) {
      volume = Math.max(0, Math.min(1, newVolume));
      videoElement.volume = volume;
      isMuted = volume === 0;
    }
  }
  
  function toggleMute() {
    if (videoElement) {
      isMuted = !isMuted;
      videoElement.muted = isMuted;
    }
  }
  
  function retry() {
    retryCount = 0;
    loadVideo();
  }
  
  onMount(() => {
    // No keyboard shortcuts to avoid interfering with IDE typing
  });
  
  onDestroy(() => {
    // Track final watch time on component destroy
    if (watchStartTime > 0 && videoMetadata) {
      totalWatchTime += Date.now() - watchStartTime;
      dispatch('watchTime', {
        videoId: videoMetadata.id,
        watchTime: totalWatchTime
      });
    }
  });
</script>

<div class="video-player {className}">
  {#if isLoading}
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <div class="loading-text">Video yükleniyor...</div>
      {#if loadingProgress > 0}
        <div class="loading-progress">
          <div class="progress-bar" style="width: {loadingProgress}%"></div>
        </div>
      {/if}
    </div>
  {/if}
  
  {#if hasError}
    <div class="error-state">
      <div class="error-icon">⚠️</div>
      <div class="error-message">{errorMessage}</div>
      <button class="retry-button" on:click={retry}>
        🔄 Tekrar Dene
      </button>
    </div>
  {/if}
  
  <!-- Video element - always present for proper event handling -->
  <video
    bind:this={videoElement}
    class="video-element"
    class:hidden={isLoading || hasError}
    playsinline
    preload="metadata"
    on:loadeddata={onLoadedData}
    on:loadstart={onLoadStart}
    on:progress={onProgress}
    on:play={() => { isPlaying = true; }}
    on:pause={() => { isPlaying = false; }}
    on:ended={onEnded}
    on:timeupdate={onTimeUpdate}
    on:error={(e) => handleError(new Error('Video playback error'))}
  >
    <!-- Sources and tracks are added dynamically -->
    <!-- Default empty track for accessibility compliance -->
    <track kind="captions" src="" srclang="tr" label="Türkçe" />
  </video>
    
  <!-- Play button overlay for user interaction requirement -->
  {#if requireUserInteraction && !userHasInteracted && !isLoading && !hasError}
    <div class="play-overlay">
      <button 
        class="play-button" 
        on:click={handleUserPlay}
        aria-label="Videoyu oynat"
      >
        <div class="play-icon">▶️</div>
        <div class="play-text">Açıklama Videosunu İzle</div>
      </button>
    </div>
  {/if}

  <!-- Auto-unmute button when video is muted due to autoplay -->
  {#if isPlaying && isMuted && autoplay && !autoUnmute}
    <div class="auto-unmute-overlay">
      <button 
        class="unmute-button" 
        on:click={() => {
          if (videoElement) {
            videoElement.muted = false;
            isMuted = false;
          }
        }}
        aria-label="Sesi aç"
      >
        🔊 Sesi Aç
      </button>
    </div>
  {/if}

</div>

<style>
  .video-player {
    position: relative;
    width: 100%;
    height: 100%;
    background: #000;
    border-radius: 8px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .video-element {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  
  .video-element.hidden {
    opacity: 0;
    pointer-events: none;
  }
  
  /* Loading State */
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: white;
    gap: 1rem;
  }

  
  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-top: 3px solid white;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  .loading-text {
    font-size: 14px;
    opacity: 0.8;
  }
  
  .loading-progress {
    width: 200px;
    height: 4px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
    overflow: hidden;
  }
  
  .progress-bar {
    height: 100%;
    background: white;
    transition: width 0.3s ease;
  }
  
  /* Error State */
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: white;
    gap: 1rem;
    padding: 2rem;
    text-align: center;
  }
  
  .error-icon {
    font-size: 3rem;
  }
  
  .error-message {
    font-size: 14px;
    opacity: 0.9;
    max-width: 300px;
  }
  
  .retry-button {
    background: rgba(255, 255, 255, 0.2);
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.3);
    padding: 0.5rem 1rem;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: background 0.2s ease;
  }
  
  .retry-button:hover {
    background: rgba(255, 255, 255, 0.3);
  }
  
  
  /* Play overlay for user interaction */
  .play-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.7);
    z-index: 30;
  }
  
  .play-button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    background: rgba(255, 255, 255, 0.95);
    color: #333;
    border: none;
    padding: 2rem 3rem;
    border-radius: 1rem;
    cursor: pointer;
    font-size: 1rem;
    font-weight: 600;
    transition: all 0.3s ease;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }
  
  .play-button:hover {
    background: white;
    transform: scale(1.05);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
  }
  
  .play-icon {
    font-size: 3rem;
    line-height: 1;
  }
  
  .play-text {
    font-size: 1.1rem;
    text-align: center;
  }

  /* Auto-unmute overlay */
  .auto-unmute-overlay {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 20;
  }
  
  .unmute-button {
    background: rgba(0, 0, 0, 0.8);
    color: white;
    border: 2px solid rgba(255, 255, 255, 0.8);
    padding: 1rem 1.5rem;
    border-radius: 2rem;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    animation: pulse 2s infinite;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  }
  
  .unmute-button:hover {
    background: rgba(0, 0, 0, 0.9);
    border-color: white;
    transform: scale(1.05);
  }
  
  @keyframes pulse {
    0% { box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3); }
    50% { box-shadow: 0 4px 30px rgba(255, 255, 255, 0.3); }
    100% { box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3); }
  }
  
  /* Responsive adjustments */
  @media (max-width: 768px) {
    .unmute-button {
      padding: 0.8rem 1.2rem;
      font-size: 0.9rem;
    }
  }
</style>