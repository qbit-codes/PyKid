// src/lib/video-config.ts
// Video configuration for PyKid with Bunny.net CDN support

import { VideoStorageManager, type VideoStorageConfig } from './video-storage';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';

// Bunny.net configuration from environment
const BUNNY_PULL_ZONE = env.BUNNY_PULL_ZONE || 'pykid-videos';
const BUNNY_API_KEY = env.BUNNY_API_KEY;
const BUNNY_BASE_URL = env.BUNNY_BASE_URL;

// Video storage configuration based on environment
const videoConfig: VideoStorageConfig = {
  baseUrl: '/videos/',
  videoFormat: 'mp4',
  fallbackFormats: ['webm'],
  cacheEnabled: true,
  preloadStrategy: !dev ? 'metadata' : 'none',
  useAdaptiveStreaming: !dev, // Only use adaptive streaming in production
  
  cdn: {
    enabled: !dev && !!BUNNY_PULL_ZONE, // Only use CDN in production
    provider: 'bunny',
    pullZone: BUNNY_PULL_ZONE,
    apiKey: BUNNY_API_KEY,
    baseUrl: BUNNY_BASE_URL
  }
};

// Development configuration (local files)
const devVideoConfig: VideoStorageConfig = {
  baseUrl: '/videos/',
  videoFormat: 'mp4',
  fallbackFormats: ['webm'],
  cacheEnabled: false, // Disable caching in development for easier testing
  preloadStrategy: 'none',
  useAdaptiveStreaming: false,
  
  cdn: {
    enabled: false,
    provider: 'local'
  }
};

// Video quality configurations for Bunny.net
export const VIDEO_QUALITIES = {
  mobile: {
    width: 640,
    height: 360,
    bitrate: '500k',
    suffix: '_360p'
  },
  tablet: {
    width: 1280,
    height: 720,
    bitrate: '1500k',
    suffix: '_720p'
  },
  desktop: {
    width: 1920,
    height: 1080,
    bitrate: '3000k',
    suffix: '_1080p'
  }
} as const;

// Video preloading configuration
export const PRELOAD_CONFIG = {
  // Preload videos for next 2 lessons
  lessonsAhead: 2,
  
  // Only preload intro and help videos by default
  types: ['intro', 'help'] as const,
  
  // Maximum cache size (number of videos)
  maxCacheSize: 10,
  
  // Cache expiration time (ms)
  cacheExpiration: 30 * 60 * 1000 // 30 minutes
};

// Export configured video storage manager
export const videoStorage = new VideoStorageManager(
  dev ? devVideoConfig : videoConfig
);

// Video player configuration
export const VIDEO_PLAYER_CONFIG = {
  // Autoplay settings
  autoplay: {
    enabled: true,
    muted: true, // Required for autoplay in most browsers
    playsinline: true // Required for mobile autoplay
  },
  
  // Controls settings
  controls: {
    showNative: false, // Use custom controls
    showProgress: true,
    showVolume: true,
    showFullscreen: true,
    showPlaybackSpeed: false // Skip for kids to avoid confusion
  },
  
  // Video quality settings
  quality: {
    adaptive: !dev, // Use adaptive quality in production
    defaultQuality: 'tablet', // Default to 720p
    allowQualityChange: false // Keep it simple for kids
  },
  
  // Accessibility settings
  accessibility: {
    enableKeyboard: true,
    enableTouch: true,
    showCaptions: true,
    captionsLanguage: 'tr'
  },
  
  // Analytics settings
  analytics: {
    enabled: true,
    trackWatchTime: true,
    trackEngagement: true,
    trackErrors: true
  }
};

// Video error handling configuration
export const VIDEO_ERROR_CONFIG = {
  retryAttempts: 3,
  retryDelay: 2000, // 2 seconds
  fallbackToLocal: true, // Fallback to local videos if CDN fails
  showFriendlyErrors: true, // Show user-friendly error messages
  errorMessages: {
    networkError: 'İnternet bağlantısı sorunu. Lütfen tekrar deneyin.',
    notFound: 'Video bulunamadı. Lütfen sayfayı yenileyin.',
    playbackError: 'Video oynatılamıyor. Lütfen tarayıcınızı güncelleyin.',
    generic: 'Video yüklenirken bir sorun oluştu. Lütfen tekrar deneyin.'
  }
};

// Video loading optimization
export const VIDEO_LOADING_CONFIG = {
  // Preconnect to bunny.net for faster loading
  preconnectUrls: [
    `https://${BUNNY_PULL_ZONE}.b-cdn.net`,
    'https://b-cdn.net'
  ],
  
  // Resource hints
  resourceHints: {
    prefetch: true, // Prefetch next video
    preload: false // Don't preload unless explicitly needed
  },
  
  // Loading states
  loadingStates: {
    showSpinner: true,
    showProgress: true,
    showThumbnail: true,
    minimumLoadTime: 500 // Minimum loading time to prevent flashing
  }
};

// Export utility functions for video configuration
export const videoUtils = {
  /**
   * Get optimal video quality based on device
   */
  getOptimalQuality(): keyof typeof VIDEO_QUALITIES {
    if (typeof window === 'undefined') return 'tablet';
    
    const width = window.innerWidth;
    
    if (width < 768) return 'mobile';
    if (width < 1200) return 'tablet';
    return 'desktop';
  },
  
  /**
   * Check if device supports video autoplay
   */
  async canAutoplay(): Promise<boolean> {
    if (typeof document === 'undefined') return false;
    
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    
    try {
      await video.play();
      video.pause();
      return true;
    } catch {
      return false;
    }
  },
  
  /**
   * Get video analytics event
   */
  createAnalyticsEvent(videoId: string, event: string, data?: any) {
    return {
      type: 'video_analytics',
      videoId,
      event,
      timestamp: Date.now(),
      data: {
        userAgent: navigator.userAgent,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        ...data
      }
    };
  }
};

// Development helper functions
if (dev) {
  // Add development-only utilities
  Object.assign(videoUtils, {
    switchToBunny: () => {
      const newConfig = { ...videoConfig };
      newConfig.cdn.enabled = true;
      return new VideoStorageManager(newConfig);
    },
    
    switchToLocal: () => {
      return new VideoStorageManager(devVideoConfig);
    },
    
    testVideoLoad: async (videoId: string) => {
      const video = document.createElement('video');
      const url = videoStorage.getVideoUrl(videoId);
      
      return new Promise((resolve, reject) => {
        video.onloadeddata = () => resolve(url);
        video.onerror = () => reject(new Error(`Failed to load video: ${url}`));
        video.src = url;
      });
    }
  });
}