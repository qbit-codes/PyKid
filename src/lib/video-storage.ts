// src/lib/video-storage.ts
// Video storage and loading mechanism for PyKid lessons

export interface VideoMetadata {
  id: string;
  lessonId: string;
  stepId?: string;
  type: 'intro' | 'help' | 'explanation' | 'exercise_demo' | 'congratulations';
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
    stepComplete?: boolean;
    lessonComplete?: boolean;
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
  videoMapping?: { [key: string]: string }; // Map expected names to actual filenames
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
    
    // Apply video mapping if available
    const actualVideoId = this.config.videoMapping?.[videoId] || videoId;
    
    // Use CDN if enabled
    if (this.config.cdn.enabled) {
      if (this.config.cdn.provider === 'bunny') {
        return this.getBunnyVideoUrl(actualVideoId, ext);
      }
      
      // Generic CDN URL
      if (this.config.cdn.baseUrl) {
        return `${this.config.cdn.baseUrl}/${actualVideoId}.${ext}`;
      }
    }
    
    // Fallback to local URL
    return `${this.config.baseUrl}${actualVideoId}.${ext}`;
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
    isStepComplete?: boolean;
    isLessonComplete?: boolean;
    manualRequest?: boolean;
  }): boolean {
    const { triggers } = metadata;
    const { isLessonStart, failedAttemptCount, isStepComplete, isLessonComplete, manualRequest } = context;

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

    // Check step completion trigger
    if (isStepComplete && triggers.stepComplete) {
      return true;
    }

    // Check lesson completion trigger
    if (isLessonComplete && triggers.lessonComplete) {
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
   * Load generic video metadata
   */
  private async loadGenericVideoMetadata(type: 'help' | 'congratulations' | 'explanation'): Promise<VideoMetadata | null> {
    console.log('🔍 loadGenericVideoMetadata called for type:', type);
    
    try {
      // Try to load from static manifest file first
      const manifestUrl = `${this.config.baseUrl}manifest.json`;
      console.log('📥 Fetching manifest from:', manifestUrl);
      
      const response = await fetch(manifestUrl);
      console.log('📡 Manifest fetch response:', response.status, response.ok);
      
      if (response.ok) {
        const manifest: VideoMetadata[] = await response.json();
        console.log('📋 Manifest loaded, total videos:', manifest.length);
        
        // First try to find a truly generic video (no lessonId)
        let video = manifest.find(v => v.type === type && !v.lessonId);
        console.log('🎯 Found generic video (no lessonId):', !!video, video?.id);
        
        if (video) {
          console.log('✅ Returning generic video:', video);
          return video;
        }
        
        // Fallback: use the first video of this type as a generic one
        video = manifest.find(v => v.type === type);
        console.log('🔄 Found first video of type:', !!video, video?.id);
        
        if (video) {
          console.log('✅ Returning first video of type:', video);
          return video;
        }
        
        console.log('❌ No videos found of type:', type);
      } else {
        console.log('❌ Manifest fetch failed:', response.status);
      }
    } catch (error) {
      console.warn('💥 Failed to load video manifest for generic video:', error);
    }

    console.log('🔧 Generating fallback metadata for type:', type);
    
    // Fallback: Generate metadata for generic videos
    const fallbackMetadata = {
      id: type,
      lessonId: '', // Generic videos don't belong to a specific lesson
      type,
      title: type === 'help' ? 'Yardım' : 
             type === 'congratulations' ? 'Tebrikler' : 
             type === 'explanation' ? 'Açıklama' : type,
      description: type === 'help' ? 'Yardım videosu' : 
                   type === 'congratulations' ? 'Tebrikler videosu' :
                   type === 'explanation' ? 'Açıklama videosu' : `${type} videosu`,
      triggers: {
        failedAttempts: type === 'help' ? 3 : undefined,
        lessonComplete: type === 'congratulations',
        lessonStart: type === 'explanation',
        manualOnly: false
      }
    };
    
    console.log('📦 Generated fallback metadata:', fallbackMetadata);
    return fallbackMetadata;
  }

  /**
   * Generate fallback metadata based on naming conventions
   */
  private generateFallbackMetadata(lessonId: string, stepId?: string, type?: VideoMetadata['type']): VideoMetadata | null {
    let videoId: string;
    
    // Help and congratulations videos are the same for all lessons/steps
    if (type === 'help') {
      videoId = 'help'; // Use generic help.mp4
    } else if (type === 'congratulations') {
      videoId = 'congratulations'; // Use generic congratulations.mp4
    } else {
      // Intro and other videos are lesson-specific
      videoId = stepId ? `intro_${lessonId}_${stepId}` : `intro_${lessonId}`;
    }

    return {
      id: videoId,
      lessonId,
      stepId,
      type: type || 'explanation',
      title: `${type === 'help' ? 'Yardım' : type === 'congratulations' ? 'Tebrikler' : lessonId} Video`,
      description: type === 'help' ? 'Yardım videosu' : 
                  type === 'congratulations' ? 'Tebrikler videosu' :
                  `Video for ${lessonId}${stepId ? ` step ${stepId}` : ''}`,
      triggers: {
        lessonStart: type === 'intro',
        failedAttempts: type === 'help' ? 3 : undefined,
        stepComplete: type === 'congratulations' && !!stepId,
        lessonComplete: type === 'congratulations' && !stepId,
        manualOnly: false
      }
    };
  }

  /**
   * Get generic video metadata (help, congratulations, explanation, etc.)
   */
  async getGenericVideo(type: 'help' | 'congratulations' | 'explanation'): Promise<VideoMetadata | null> {
    const cacheKey = `generic:${type}`;
    
    if (this.config.cacheEnabled && this.videoCache.has(cacheKey)) {
      return this.videoCache.get(cacheKey) || null;
    }

    // Check if we're already loading this video
    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey)!;
    }

    const loadPromise = this.loadGenericVideoMetadata(type);
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

// Singleton instance configured for local video files
export const videoStorage = new VideoStorageManager({
  baseUrl: '/videos/',
  videoFormat: 'mp4',
  fallbackFormats: ['webm', 'mov'],
  cacheEnabled: true,
  preloadStrategy: 'metadata',
  useAdaptiveStreaming: false,
  cdn: {
    enabled: false, // Always use local videos
    provider: 'local'
  }
});

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
   * Clear help video shown status for a specific lesson/step
   */
  static clearHelpVideoShownStatus(lessonId: string, stepId?: string): void {
    const sessionData = this.getSessionData();
    if (!sessionData.helpVideosShown) return;
    
    const key = stepId ? `${lessonId}:${stepId}` : lessonId;
    const index = sessionData.helpVideosShown.indexOf(key);
    
    if (index > -1) {
      sessionData.helpVideosShown.splice(index, 1);
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
