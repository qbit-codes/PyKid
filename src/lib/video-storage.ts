// src/lib/video-storage.ts
// Video storage and loading mechanism for PyKid lessons

export interface VideoMetadata {
  id: string;
  lessonId: string;
  stepId?: string;
  type: 'intro' | 'help' | 'explanation' | 'exercise_demo';
  title: string;
  description: string;
  duration?: number; // seconds
  thumbnail?: string;
  subtitles?: {
    language: string;
    url: string;
  }[];
  triggers: {
    lessonStart?: boolean;
    failedAttempts?: number;
    manualOnly?: boolean;
  };
}

export interface VideoStorageConfig {
  baseUrl: string;
  cdnUrl?: string; // bunny.net or other CDN URL
  videoFormat: 'mp4' | 'webm';
  fallbackFormats: string[];
  cacheEnabled: boolean;
  preloadStrategy: 'none' | 'metadata' | 'auto';
  useAdaptiveStreaming?: boolean; // For bunny.net adaptive streaming
  cdn: {
    enabled: boolean;
    provider: 'bunny' | 'local';
    baseUrl?: string;
    pullZone?: string;
    apiKey?: string;
  };
}

export class VideoStorageManager {
  private config: VideoStorageConfig;
  private videoCache = new Map<string, VideoMetadata>();
  private loadingPromises = new Map<string, Promise<VideoMetadata | null>>();

  constructor(config?: Partial<VideoStorageConfig>) {
    this.config = {
      baseUrl: '/videos/',
      videoFormat: 'mp4',
      fallbackFormats: ['webm', 'mov'],
      cacheEnabled: true,
      preloadStrategy: 'metadata',
      useAdaptiveStreaming: false,
      cdn: {
        enabled: false,
        provider: 'local'
      },
      ...config
    };
  }

  /**
   * Get video metadata for a specific lesson/step
   */
  async getVideoForLesson(lessonId: string, stepId?: string, type?: VideoMetadata['type']): Promise<VideoMetadata | null> {
    const cacheKey = `${lessonId}:${stepId || 'lesson'}:${type || 'any'}`;
    
    if (this.config.cacheEnabled && this.videoCache.has(cacheKey)) {
      return this.videoCache.get(cacheKey) || null;
    }

    // Check if we're already loading this video
    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey)!;
    }

    const loadPromise = this.loadVideoMetadata(lessonId, stepId, type);
    this.loadingPromises.set(cacheKey, loadPromise);

    try {
      const metadata = await loadPromise;
      if (metadata && this.config.cacheEnabled) {
        this.videoCache.set(cacheKey, metadata);
      }
      return metadata;
    } finally {
      this.loadingPromises.delete(cacheKey);
    }
  }

  /**
   * Get video URL with fallback support and CDN integration
   */
  getVideoUrl(videoId: string, format?: string): string {
    const ext = format || this.config.videoFormat;
    
    // Use CDN if enabled
    if (this.config.cdn.enabled) {
      if (this.config.cdn.provider === 'bunny') {
        return this.getBunnyVideoUrl(videoId, ext);
      }
      
      // Generic CDN URL
      if (this.config.cdn.baseUrl) {
        return `${this.config.cdn.baseUrl}/${videoId}.${ext}`;
      }
    }
    
    // Fallback to local URL
    return `${this.config.baseUrl}${videoId}.${ext}`;
  }

  /**
   * Get Bunny.net optimized video URL
   */
  private getBunnyVideoUrl(videoId: string, format: string): string {
    const { pullZone } = this.config.cdn;
    
    if (!pullZone) {
      throw new Error('Bunny.net pull zone is required for CDN integration');
    }
    
    // Bunny.net supports adaptive streaming
    if (this.config.useAdaptiveStreaming && format === 'mp4') {
      return `https://${pullZone}.b-cdn.net/${videoId}/playlist.m3u8`;
    }
    
    // Standard video URL with Bunny.net optimizations
    return `https://${pullZone}.b-cdn.net/${videoId}.${format}`;
  }

  /**
   * Get video URLs with all fallback formats
   */
  getVideoUrls(videoId: string): { url: string; type: string }[] {
    const urls = [];
    
    // Primary format
    urls.push({
      url: this.getVideoUrl(videoId, this.config.videoFormat),
      type: `video/${this.config.videoFormat}`
    });

    // Fallback formats
    for (const format of this.config.fallbackFormats) {
      urls.push({
        url: this.getVideoUrl(videoId, format),
        type: `video/${format}`
      });
    }

    return urls;
  }

  /**
   * Check if video should be triggered based on conditions
   */
  shouldTriggerVideo(metadata: VideoMetadata, context: {
    isLessonStart?: boolean;
    failedAttemptCount?: number;
    manualRequest?: boolean;
  }): boolean {
    const { triggers } = metadata;
    const { isLessonStart, failedAttemptCount, manualRequest } = context;

    // Manual requests always allowed unless explicitly disabled
    if (manualRequest && !triggers.manualOnly) {
      return true;
    }

    // Check lesson start trigger
    if (isLessonStart && triggers.lessonStart) {
      return true;
    }

    // Check failed attempts trigger
    if (failedAttemptCount && triggers.failedAttempts && 
        failedAttemptCount >= triggers.failedAttempts) {
      return true;
    }

    return false;
  }

  /**
   * Preload video metadata for upcoming lessons
   */
  async preloadVideos(lessonIds: string[]): Promise<void> {
    if (this.config.preloadStrategy === 'none') {
      return;
    }

    const preloadPromises = lessonIds.map(lessonId => 
      this.getVideoForLesson(lessonId)
    );

    await Promise.allSettled(preloadPromises);
  }

  /**
   * Clear video cache
   */
  clearCache(): void {
    this.videoCache.clear();
    this.loadingPromises.clear();
  }

  /**
   * Get cached video metadata without loading
   */
  getCachedVideo(lessonId: string, stepId?: string, type?: VideoMetadata['type']): VideoMetadata | null {
    const cacheKey = `${lessonId}:${stepId || 'lesson'}:${type || 'any'}`;
    return this.videoCache.get(cacheKey) || null;
  }

  /**
   * Load video metadata from storage/API
   */
  private async loadVideoMetadata(lessonId: string, stepId?: string, type?: VideoMetadata['type']): Promise<VideoMetadata | null> {
    try {
      // First, try to load from static manifest file
      const manifestUrl = `${this.config.baseUrl}manifest.json`;
      const response = await fetch(manifestUrl);
      
      if (response.ok) {
        const manifest: VideoMetadata[] = await response.json();
        return this.findVideoInManifest(manifest, lessonId, stepId, type);
      }
    } catch (error) {
      console.warn('Failed to load video manifest:', error);
    }

    // Fallback: Generate metadata based on conventions
    return this.generateFallbackMetadata(lessonId, stepId, type);
  }

  /**
   * Find video in manifest based on criteria
   */
  private findVideoInManifest(
    manifest: VideoMetadata[], 
    lessonId: string, 
    stepId?: string, 
    type?: VideoMetadata['type']
  ): VideoMetadata | null {
    // First, try exact match
    let video = manifest.find(v => 
      v.lessonId === lessonId && 
      v.stepId === stepId && 
      (type ? v.type === type : true)
    );

    if (video) return video;

    // Then, try lesson-level video
    video = manifest.find(v => 
      v.lessonId === lessonId && 
      !v.stepId && 
      (type ? v.type === type : true)
    );

    if (video) return video;

    // Finally, try any video for the lesson
    video = manifest.find(v => v.lessonId === lessonId);

    return video || null;
  }

  /**
   * Generate fallback metadata based on naming conventions
   */
  private generateFallbackMetadata(lessonId: string, stepId?: string, type?: VideoMetadata['type']): VideoMetadata | null {
    // Check if video file exists using conventional naming
    const videoId = stepId ? `${lessonId}_${stepId}` : lessonId;
    const typePrefix = type ? `${type}_` : '';
    const fullVideoId = `${typePrefix}${videoId}`;

    return {
      id: fullVideoId,
      lessonId,
      stepId,
      type: type || 'explanation',
      title: `${lessonId} ${stepId ? `- ${stepId}` : ''} Video`,
      description: `Video for ${lessonId}${stepId ? ` step ${stepId}` : ''}`,
      triggers: {
        lessonStart: type === 'intro',
        failedAttempts: type === 'help' ? 3 : undefined,
        manualOnly: false
      }
    };
  }

  /**
   * Check if video file exists
   */
  async videoExists(videoId: string): Promise<boolean> {
    try {
      const response = await fetch(this.getVideoUrl(videoId), { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get video analytics data
   */
  getVideoAnalytics(): {
    totalVideos: number;
    cacheSize: number;
    loadedLessons: string[];
  } {
    const loadedLessons = Array.from(new Set(
      Array.from(this.videoCache.values()).map(v => v.lessonId)
    ));

    return {
      totalVideos: this.videoCache.size,
      cacheSize: this.videoCache.size,
      loadedLessons
    };
  }
}

// Singleton instance
export const videoStorage = new VideoStorageManager();

// Video trigger utilities
export class VideoTriggerManager {
  private static readonly STORAGE_KEY = 'pykid:video:triggers';
  private static readonly SESSION_KEY = 'pykid:video:session';

  /**
   * Check if lesson start video has been shown for this lesson
   */
  static hasShownLessonStartVideo(lessonId: string): boolean {
    const data = this.getStoredData();
    return data.lessonStartVideos?.includes(lessonId) || false;
  }

  /**
   * Mark lesson start video as shown
   */
  static markLessonStartVideoShown(lessonId: string): void {
    const data = this.getStoredData();
    data.lessonStartVideos = data.lessonStartVideos || [];
    
    if (!data.lessonStartVideos.includes(lessonId)) {
      data.lessonStartVideos.push(lessonId);
      this.saveStoredData(data);
    }
  }

  /**
   * Get failed attempt count for current lesson/step
   */
  static getFailedAttemptCount(lessonId: string, stepId?: string): number {
    const sessionData = this.getSessionData();
    const key = stepId ? `${lessonId}:${stepId}` : lessonId;
    return sessionData.failedAttempts?.[key] || 0;
  }

  /**
   * Increment failed attempt count
   */
  static incrementFailedAttempts(lessonId: string, stepId?: string): number {
    const sessionData = this.getSessionData();
    sessionData.failedAttempts = sessionData.failedAttempts || {};
    
    const key = stepId ? `${lessonId}:${stepId}` : lessonId;
    sessionData.failedAttempts[key] = (sessionData.failedAttempts[key] || 0) + 1;
    
    this.saveSessionData(sessionData);
    return sessionData.failedAttempts[key];
  }

  /**
   * Reset failed attempt count (called on successful attempt)
   */
  static resetFailedAttempts(lessonId: string, stepId?: string): void {
    const sessionData = this.getSessionData();
    if (!sessionData.failedAttempts) return;

    const key = stepId ? `${lessonId}:${stepId}` : lessonId;
    delete sessionData.failedAttempts[key];
    
    this.saveSessionData(sessionData);
  }

  /**
   * Check if help video has been shown for current failed attempt streak
   */
  static hasShownHelpVideoForStreak(lessonId: string, stepId?: string): boolean {
    const sessionData = this.getSessionData();
    const key = stepId ? `${lessonId}:${stepId}` : lessonId;
    return sessionData.helpVideosShown?.includes(key) || false;
  }

  /**
   * Mark help video as shown for current streak
   */
  static markHelpVideoShown(lessonId: string, stepId?: string): void {
    const sessionData = this.getSessionData();
    sessionData.helpVideosShown = sessionData.helpVideosShown || [];
    
    const key = stepId ? `${lessonId}:${stepId}` : lessonId;
    if (!sessionData.helpVideosShown.includes(key)) {
      sessionData.helpVideosShown.push(key);
      this.saveSessionData(sessionData);
    }
  }

  /**
   * Clear session data (call on lesson/step change)
   */
  static clearSession(): void {
    sessionStorage.removeItem(this.SESSION_KEY);
  }

  private static getStoredData(): any {
    try {
      return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  private static saveStoredData(data: any): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
  }

  private static getSessionData(): any {
    try {
      return JSON.parse(sessionStorage.getItem(this.SESSION_KEY) || '{}');
    } catch {
      return {};
    }
  }

  private static saveSessionData(data: any): void {
    sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(data));
  }
}