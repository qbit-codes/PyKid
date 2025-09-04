// src/lib/attempt-tracker.ts
// Lesson attempt tracking and analytics system for PyKid

export interface AttemptData {
  id: string;
  lessonId: string;
  stepId: string;
  exerciseId?: string;
  timestamp: number;
  startTime: number;
  endTime?: number;
  duration?: number;
  code: string;
  
  // Execution results
  executionResult: {
    success: boolean;
    output: string;
    error?: string;
    errorType?: 'syntax' | 'runtime' | 'logic' | 'timeout' | 'none';
  };
  
  // OpenAI validation results (from Issue #6 integration)
  validationResult?: {
    isValid: boolean;
    confidence: number;
    feedback: string;
    suggestions: string[];
    errorType: string | null;
    educationalNotes: string;
  };
  
  // Interaction metrics
  helpRequests: number;
  chatInteractions: number;
  videoWatched: boolean;
  hintsUsed: string[];
  
  // Success metrics
  isSuccessful: boolean;
  successCriteria: {
    executionSuccess: boolean;
    validationSuccess: boolean;
    requirementsMet: boolean;
  };
}

export interface LessonProgress {
  lessonId: string;
  stepId: string;
  exerciseId?: string;
  totalAttempts: number;
  successfulAttempts: number;
  firstAttemptTime: number;
  lastAttemptTime: number;
  totalTimeSpent: number;
  averageAttemptsToSuccess: number;
  commonErrors: { [errorType: string]: number };
  helpRequestCount: number;
  currentStreak: number;
  bestAttempt?: AttemptData;
}

export interface UserAnalytics {
  userId?: string;
  startDate: number;
  totalAttempts: number;
  totalTimeSpent: number;
  lessonsStarted: number;
  lessonsCompleted: number;
  exercisesCompleted: number;
  successRate: number;
  averageTimePerAttempt: number;
  commonErrorTypes: { [errorType: string]: number };
  learningPatterns: {
    preferredHelpMethod: 'chat' | 'video' | 'hints' | 'trial';
    timeOfDay: { [hour: number]: number };
    sessionLength: number; // average in minutes
  };
}

export class AttemptTracker {
  private storageKey = 'pykid:attempts';
  private progressKey = 'pykid:progress';
  private analyticsKey = 'pykid:analytics';
  
  private currentAttempt: AttemptData | null = null;
  
  constructor() {
    this.ensureStorageStructure();
  }
  
  private ensureStorageStructure(): void {
    if (!localStorage.getItem(this.storageKey)) {
      localStorage.setItem(this.storageKey, JSON.stringify([]));
    }
    if (!localStorage.getItem(this.progressKey)) {
      localStorage.setItem(this.progressKey, JSON.stringify({}));
    }
    if (!localStorage.getItem(this.analyticsKey)) {
      localStorage.setItem(this.analyticsKey, JSON.stringify(this.createEmptyAnalytics()));
    }
  }
  
  private createEmptyAnalytics(): UserAnalytics {
    return {
      startDate: Date.now(),
      totalAttempts: 0,
      totalTimeSpent: 0,
      lessonsStarted: 0,
      lessonsCompleted: 0,
      exercisesCompleted: 0,
      successRate: 0,
      averageTimePerAttempt: 0,
      commonErrorTypes: {},
      learningPatterns: {
        preferredHelpMethod: 'trial',
        timeOfDay: {},
        sessionLength: 0
      }
    };
  }
  
  private generateAttemptId(): string {
    return `attempt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private saveAttempts(attempts: AttemptData[]): void {
    localStorage.setItem(this.storageKey, JSON.stringify(attempts));
  }
  
  private getAttempts(): AttemptData[] {
    const attempts = localStorage.getItem(this.storageKey);
    return attempts ? JSON.parse(attempts) : [];
  }
  
  private saveProgress(progress: { [key: string]: LessonProgress }): void {
    localStorage.setItem(this.progressKey, JSON.stringify(progress));
  }
  
  private getProgress(): { [key: string]: LessonProgress } {
    const progress = localStorage.getItem(this.progressKey);
    return progress ? JSON.parse(progress) : {};
  }
  
  private saveAnalytics(analytics: UserAnalytics): void {
    localStorage.setItem(this.analyticsKey, JSON.stringify(analytics));
  }
  
  private getAnalytics(): UserAnalytics {
    const analytics = localStorage.getItem(this.analyticsKey);
    return analytics ? JSON.parse(analytics) : this.createEmptyAnalytics();
  }
  
  // Start tracking a new attempt
  startAttempt(lessonId: string, stepId: string, exerciseId?: string): string {
    this.currentAttempt = {
      id: this.generateAttemptId(),
      lessonId,
      stepId,
      exerciseId,
      timestamp: Date.now(),
      startTime: Date.now(),
      code: '',
      executionResult: {
        success: false,
        output: ''
      },
      helpRequests: 0,
      chatInteractions: 0,
      videoWatched: false,
      hintsUsed: [],
      isSuccessful: false,
      successCriteria: {
        executionSuccess: false,
        validationSuccess: false,
        requirementsMet: false
      }
    };
    
    return this.currentAttempt.id;
  }
  
  // Update current attempt with code
  updateCode(code: string): void {
    if (this.currentAttempt) {
      this.currentAttempt.code = code;
    }
  }
  
  // Record execution result
  recordExecution(success: boolean, output: string, error?: string, errorType?: string): void {
    if (this.currentAttempt) {
      this.currentAttempt.executionResult = {
        success,
        output,
        error,
        errorType: errorType as any || 'none'
      };
      this.currentAttempt.successCriteria.executionSuccess = success;
    }
  }
  
  // Record OpenAI validation result
  recordValidation(validationResult: AttemptData['validationResult']): void {
    if (this.currentAttempt && validationResult) {
      this.currentAttempt.validationResult = validationResult;
      this.currentAttempt.successCriteria.validationSuccess = validationResult.isValid;
    }
  }
  
  // Track help request
  recordHelpRequest(type: 'chat' | 'video' | 'hint', detail?: string): void {
    if (this.currentAttempt) {
      this.currentAttempt.helpRequests++;
      
      if (type === 'chat') {
        this.currentAttempt.chatInteractions++;
      } else if (type === 'video') {
        this.currentAttempt.videoWatched = true;
      } else if (type === 'hint' && detail) {
        this.currentAttempt.hintsUsed.push(detail);
      }
    }
  }
  
  // Finish current attempt
  finishAttempt(isSuccessful: boolean = false): AttemptData | null {
    if (!this.currentAttempt) return null;
    
    const now = Date.now();
    this.currentAttempt.endTime = now;
    this.currentAttempt.duration = now - this.currentAttempt.startTime;
    this.currentAttempt.isSuccessful = isSuccessful;
    this.currentAttempt.successCriteria.requirementsMet = isSuccessful;
    
    // Save attempt
    const attempts = this.getAttempts();
    attempts.push(this.currentAttempt);
    this.saveAttempts(attempts);
    
    // Update progress
    this.updateProgress(this.currentAttempt);
    
    // Update analytics
    this.updateAnalytics(this.currentAttempt);
    
    const completed = this.currentAttempt;
    this.currentAttempt = null;
    
    return completed;
  }
  
  private updateProgress(attempt: AttemptData): void {
    const progress = this.getProgress();
    const key = `${attempt.lessonId}:${attempt.stepId}${attempt.exerciseId ? ':' + attempt.exerciseId : ''}`;
    
    if (!progress[key]) {
      progress[key] = {
        lessonId: attempt.lessonId,
        stepId: attempt.stepId,
        exerciseId: attempt.exerciseId,
        totalAttempts: 0,
        successfulAttempts: 0,
        firstAttemptTime: attempt.startTime,
        lastAttemptTime: attempt.startTime,
        totalTimeSpent: 0,
        averageAttemptsToSuccess: 0,
        commonErrors: {},
        helpRequestCount: 0,
        currentStreak: 0
      };
    }
    
    const prog = progress[key];
    prog.totalAttempts++;
    prog.lastAttemptTime = attempt.startTime;
    prog.totalTimeSpent += attempt.duration || 0;
    prog.helpRequestCount += attempt.helpRequests;
    
    if (attempt.isSuccessful) {
      prog.successfulAttempts++;
      prog.currentStreak++;
      if (!prog.bestAttempt || (attempt.duration || 0) < (prog.bestAttempt.duration || Infinity)) {
        prog.bestAttempt = attempt;
      }
    } else {
      prog.currentStreak = 0;
    }
    
    // Track error types
    const errorType = attempt.executionResult.errorType || 'unknown';
    if (errorType !== 'none') {
      prog.commonErrors[errorType] = (prog.commonErrors[errorType] || 0) + 1;
    }
    
    prog.averageAttemptsToSuccess = prog.successfulAttempts > 0 ? 
      prog.totalAttempts / prog.successfulAttempts : prog.totalAttempts;
    
    this.saveProgress(progress);
  }
  
  private updateAnalytics(attempt: AttemptData): void {
    const analytics = this.getAnalytics();
    
    analytics.totalAttempts++;
    analytics.totalTimeSpent += attempt.duration || 0;
    
    if (attempt.isSuccessful) {
      if (attempt.exerciseId) {
        analytics.exercisesCompleted++;
      }
    }
    
    // Update error tracking
    const errorType = attempt.executionResult.errorType || 'unknown';
    if (errorType !== 'none') {
      analytics.commonErrorTypes[errorType] = (analytics.commonErrorTypes[errorType] || 0) + 1;
    }
    
    // Calculate success rate
    const attempts = this.getAttempts();
    const successful = attempts.filter(a => a.isSuccessful).length;
    analytics.successRate = attempts.length > 0 ? successful / attempts.length : 0;
    
    // Average time per attempt
    analytics.averageTimePerAttempt = analytics.totalAttempts > 0 ? 
      analytics.totalTimeSpent / analytics.totalAttempts : 0;
    
    // Learning patterns
    const hour = new Date().getHours();
    analytics.learningPatterns.timeOfDay[hour] = (analytics.learningPatterns.timeOfDay[hour] || 0) + 1;
    
    // Preferred help method
    if (attempt.chatInteractions > 0) {
      analytics.learningPatterns.preferredHelpMethod = 'chat';
    } else if (attempt.videoWatched) {
      analytics.learningPatterns.preferredHelpMethod = 'video';
    } else if (attempt.hintsUsed.length > 0) {
      analytics.learningPatterns.preferredHelpMethod = 'hints';
    }
    
    this.saveAnalytics(analytics);
  }
  
  // Get attempts for a specific lesson/step
  getAttemptsFor(lessonId: string, stepId?: string, exerciseId?: string): AttemptData[] {
    const attempts = this.getAttempts();
    return attempts.filter(attempt => {
      if (attempt.lessonId !== lessonId) return false;
      if (stepId && attempt.stepId !== stepId) return false;
      if (exerciseId && attempt.exerciseId !== exerciseId) return false;
      return true;
    });
  }
  
  // Get progress for a specific lesson/step
  getProgressFor(lessonId: string, stepId?: string, exerciseId?: string): LessonProgress | null {
    const progress = this.getProgress();
    const key = `${lessonId}${stepId ? ':' + stepId : ''}${exerciseId ? ':' + exerciseId : ''}`;
    return progress[key] || null;
  }
  
  // Get all lesson progress
  getAllProgress(): LessonProgress[] {
    const progress = this.getProgress();
    return Object.values(progress);
  }
  
  // Get user analytics
  getUserAnalytics(): UserAnalytics {
    return this.getAnalytics();
  }
  
  // Export all data for reports
  exportData(): {
    attempts: AttemptData[];
    progress: { [key: string]: LessonProgress };
    analytics: UserAnalytics;
    exportDate: number;
  } {
    return {
      attempts: this.getAttempts(),
      progress: this.getProgress(),
      analytics: this.getAnalytics(),
      exportDate: Date.now()
    };
  }
  
  // Clear all tracking data
  clearAllData(): void {
    localStorage.removeItem(this.storageKey);
    localStorage.removeItem(this.progressKey);
    localStorage.removeItem(this.analyticsKey);
    this.ensureStorageStructure();
    this.currentAttempt = null;
  }
  
  // Get current attempt info
  getCurrentAttempt(): AttemptData | null {
    return this.currentAttempt;
  }
}

// Singleton instance
export const attemptTracker = new AttemptTracker();