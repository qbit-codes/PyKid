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
  export let showControls = true;
  export let className = '';
  
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
  
  // Loading and error states
  let retryCount = 0;
  let loadingProgress = 0;
  
  $: if (lessonId) {
    loadVideo();
  }
  
  async function loadVideo() {
    isLoading = true;
    hasError = false;
    retryCount = 0;
    
    try {
      videoMetadata = await videoStorage.getVideoForLesson(lessonId, stepId, videoType);
      
      if (!videoMetadata) {
        throw new Error('Video not found for this lesson');
      }
      
      await loadVideoElement();
      
    } catch (error) {
      handleError(error as Error);
    }
  }
  
  async function loadVideoElement() {
    if (!videoMetadata || !videoElement) return;
    
    const videoUrls = videoStorage.getVideoUrls(videoMetadata.id);
    
    // Clear existing sources
    videoElement.innerHTML = '';
    
    // Add video sources with fallbacks
    videoUrls.forEach(({ url, type }) => {
      const source = document.createElement('source');
      source.src = url;
      source.type = type;
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
    isLoading = false;
    duration = videoElement.duration;
    
    if (videoMetadata) {
      dispatch('loaded', { 
        videoId: videoMetadata.id, 
        metadata: videoMetadata 
      });
    }
    
    // Autoplay if enabled and supported
    if (autoplay && VIDEO_PLAYER_CONFIG.autoplay.enabled) {
      playVideo();
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
    if (!videoElement || !videoMetadata) return;
    
    try {
      // Ensure video is muted for autoplay
      if (autoplay) {
        videoElement.muted = true;
        isMuted = true;
      }
      
      await videoElement.play();
      isPlaying = true;
      watchStartTime = Date.now();
      
      dispatch('play', { 
        videoId: videoMetadata.id, 
        metadata: videoMetadata 
      });
      
    } catch (error) {
      console.error('Play error:', error);
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
      playVideo();
    }
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
  
  // Keyboard shortcuts
  function handleKeydown(event: KeyboardEvent) {
    if (!showControls) return;
    
    switch (event.key) {
      case ' ':
      case 'k':
        event.preventDefault();
        togglePlay();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        seekTo(currentTime - 10);
        break;
      case 'ArrowRight':
        event.preventDefault();
        seekTo(currentTime + 10);
        break;
      case 'm':
        event.preventDefault();
        toggleMute();
        break;
      case 'ArrowUp':
        event.preventDefault();
        setVolume(volume + 0.1);
        break;
      case 'ArrowDown':
        event.preventDefault();
        setVolume(volume - 0.1);
        break;
    }
  }
  
  onMount(() => {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeydown);
    }
  });
  
  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', handleKeydown);
    }
    
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
  
  {#if !isLoading && !hasError}
    <video
      bind:this={videoElement}
      class="video-element"
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
    
    <!-- Custom Controls -->
    {#if showControls && videoMetadata}
      <div class="video-controls">
        <div class="progress-container">
          <div 
            class="progress-track" 
            role="button"
            tabindex="0"
            aria-label="Video ilerleme çubuğu - tıklayarak konuma gidebilirsiniz"
            on:click={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const clickRatio = clickX / rect.width;
              seekTo(duration * clickRatio);
            }}
            on:keydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                const centerX = rect.width / 2;
                const clickRatio = centerX / rect.width;
                seekTo(duration * clickRatio);
              }
            }}
          >
            <div class="progress-played" style="width: {(currentTime / duration) * 100}%"></div>
            <div class="progress-buffered" style="width: {loadingProgress}%"></div>
          </div>
        </div>
        
        <div class="controls-row">
          <button class="control-button play-pause" on:click={togglePlay}>
            {#if isPlaying}
              ⏸️
            {:else}
              ▶️
            {/if}
          </button>
          
          <div class="time-display">
            {Math.floor(currentTime / 60)}:{(Math.floor(currentTime % 60)).toString().padStart(2, '0')} / 
            {Math.floor(duration / 60)}:{(Math.floor(duration % 60)).toString().padStart(2, '0')}
          </div>
          
          <div class="volume-control">
            <button class="control-button" on:click={toggleMute}>
              {#if isMuted || volume === 0}
                🔇
              {:else if volume < 0.5}
                🔉
              {:else}
                🔊
              {/if}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              bind:value={volume}
              on:input={(e) => setVolume(parseFloat(e.currentTarget.value))}
              class="volume-slider"
            />
          </div>
          
          <div class="video-title">
            {videoMetadata.title}
          </div>
        </div>
      </div>
    {/if}
    
    <!-- Thumbnail overlay when paused -->
    {#if !isPlaying && videoMetadata?.thumbnail}
      <div 
        class="thumbnail-overlay" 
        role="button"
        tabindex="0"
        aria-label="Videoyu oynatmak için tıklayın"
        on:click={playVideo}
        on:keydown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            playVideo();
          }
        }}
      >
        <img src={videoMetadata.thumbnail} alt="Video thumbnail" class="thumbnail-image" />
        <div class="play-overlay">
          <div class="play-button-large">▶️</div>
        </div>
      </div>
    {/if}
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
  
  /* Controls */
  .video-controls {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
    padding: 1rem;
    transform: translateY(100%);
    transition: transform 0.3s ease;
  }
  
  .video-player:hover .video-controls {
    transform: translateY(0);
  }
  
  .progress-container {
    margin-bottom: 0.5rem;
  }
  
  .progress-track {
    height: 4px;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
    position: relative;
    cursor: pointer;
  }
  
  .progress-played {
    height: 100%;
    background: #4f46e5;
    border-radius: 2px;
    transition: width 0.1s ease;
  }
  
  .progress-buffered {
    position: absolute;
    top: 0;
    height: 100%;
    background: rgba(255, 255, 255, 0.5);
    border-radius: 2px;
  }
  
  .controls-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: white;
  }
  
  .control-button {
    background: none;
    border: none;
    color: white;
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
    transition: background 0.2s ease;
  }
  
  .control-button:hover {
    background: rgba(255, 255, 255, 0.2);
  }
  
  .play-pause {
    font-size: 1.5rem;
  }
  
  .time-display {
    font-size: 0.875rem;
    font-family: monospace;
    min-width: 100px;
  }
  
  .volume-control {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  
  .volume-slider {
    width: 60px;
    height: 4px;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
    appearance: none;
    cursor: pointer;
  }
  
  .volume-slider::-webkit-slider-thumb {
    appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: white;
    cursor: pointer;
  }
  
  .video-title {
    flex: 1;
    text-align: right;
    font-size: 0.875rem;
    opacity: 0.8;
    truncate: true;
  }
  
  /* Thumbnail Overlay */
  .thumbnail-overlay {
    position: absolute;
    inset: 0;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .thumbnail-image {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  
  .play-overlay {
    z-index: 1;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 50%;
    padding: 1rem;
    transition: background 0.2s ease;
  }
  
  .play-overlay:hover {
    background: rgba(0, 0, 0, 0.7);
  }
  
  .play-button-large {
    font-size: 2rem;
    color: white;
  }
  
  /* Responsive adjustments */
  @media (max-width: 768px) {
    .controls-row {
      gap: 0.25rem;
    }
    
    .time-display {
      font-size: 0.75rem;
      min-width: 80px;
    }
    
    .video-title {
      display: none;
    }
    
    .volume-control {
      display: none;
    }
  }
</style>