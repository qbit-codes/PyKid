// src/lib/composables/useVideoManager.ts
// Video management composable for PyKid

import { writable, derived, type Writable } from 'svelte/store';
import { videoStorage, VideoTriggerManager, type VideoMetadata } from '$lib/video-storage';
import type { Lesson, LessonStep } from '$lib/lessons';

export interface VideoState {
  currentVideoLessonId: string;
  currentVideoStepId: string | undefined;
  currentVideoType: VideoMetadata['type'] | undefined;
  isPlaying: boolean;
  pendingAutoProgression: boolean;
}

export function useVideoManager() {
  // Video state stores
  const videoState: Writable<VideoState> = writable({
    currentVideoLessonId: '',
    currentVideoStepId: undefined,
    currentVideoType: undefined,
    isPlaying: false,
    pendingAutoProgression: false
  });

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
        
        // Update video state
        videoState.update(state => ({
          ...state,
          currentVideoLessonId: lesson.id,
          currentVideoStepId: undefined,
          currentVideoType: 'intro'
        }));
        
        return true; // Video was triggered
      }
    } catch (error) {
      console.error('Error loading lesson start video:', error);
    }
    
    return false;
  }

  async function checkHelpVideo(lesson: Lesson, step: LessonStep, failedAttempts: number) {
    if (!lesson || !step) return false;
    
    // Check if help video has already been shown for this streak
    if (VideoTriggerManager.hasShownHelpVideoForStreak(lesson.id, step.id)) {
      return false;
    }
    
    try {
      // Get help video for this lesson
      const videoMetadata = await videoStorage.getVideoForLesson(lesson.id, step.id, 'help');
      
      if (videoMetadata && videoStorage.shouldTriggerVideo(videoMetadata, { 
        failedAttemptCount: failedAttempts 
      })) {
        // Mark as shown for this streak
        VideoTriggerManager.markHelpVideoShown(lesson.id, step.id);
        
        // Update video state
        videoState.update(state => ({
          ...state,
          currentVideoLessonId: lesson.id,
          currentVideoStepId: step.id,
          currentVideoType: 'help'
        }));
        
        return true; // Video was triggered
      }
    } catch (error) {
      console.error('Error loading help video:', error);
    }
    
    return false;
  }

  // Show congratulations video after successful step/lesson completion
  async function showCongratulationsVideo(
    lesson: Lesson, 
    step?: LessonStep, 
    isLessonComplete: boolean = false
  ): Promise<boolean> {
    if (!lesson) return false;
    
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
        
        // Update video state
        videoState.update(state => ({
          ...state,
          currentVideoLessonId: lesson.id,
          currentVideoStepId: isLessonComplete ? undefined : step?.id,
          currentVideoType: 'congratulations'
        }));
        
        return true; // Video was shown
      }
      
      return false; // No video available or shouldn't trigger
    } catch (error) {
      console.error('Error loading congratulations video:', error);
      return false;
    }
  }

  // Reset failed attempts and video triggers on successful completion
  function resetVideoTriggers(lesson: Lesson, step: LessonStep) {
    if (lesson && step) {
      VideoTriggerManager.resetFailedAttempts(lesson.id, step.id);
    }
  }

  // Handle video player events
  function handleVideoPlay() {
    videoState.update(state => ({
      ...state,
      isPlaying: true
    }));
  }

  function handleVideoEnded(event: CustomEvent<{ videoId: string; metadata: VideoMetadata }>) {
    videoState.update(state => ({
      ...state,
      isPlaying: false
    }));

    // Handle pending auto progression for congratulations videos
    const { pendingAutoProgression } = videoState;
    if (pendingAutoProgression && event.detail.metadata.type === 'congratulations') {
      videoState.update(state => ({
        ...state,
        pendingAutoProgression: false
      }));
      
      // Return indication that auto progression should happen
      return true;
    }
    
    return false;
  }

  // Set pending auto progression flag
  function setPendingAutoProgression(pending: boolean) {
    videoState.update(state => ({
      ...state,
      pendingAutoProgression: pending
    }));
  }

  // Update video when lesson/step changes
  function updateVideoForLesson(lesson: Lesson | null, step: LessonStep | null) {
    if (lesson && step) {
      videoState.update(state => {
        // Only update if no specific video is already loaded
        if (!state.currentVideoLessonId) {
          return {
            ...state,
            currentVideoLessonId: lesson.id,
            currentVideoStepId: step.id,
            currentVideoType: 'intro'
          };
        }
        return state;
      });
    }
  }

  return {
    // Stores
    videoState,
    
    // Video trigger functions
    checkLessonStartVideo,
    checkHelpVideo,
    showCongratulationsVideo,
    resetVideoTriggers,
    
    // Event handlers
    handleVideoPlay,
    handleVideoEnded,
    
    // State management
    setPendingAutoProgression,
    updateVideoForLesson
  };
}