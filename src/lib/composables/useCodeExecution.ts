// src/lib/composables/useCodeExecution.ts
// Code execution and validation composable for PyKid

import { writable, type Writable } from 'svelte/store';
import { attemptTracker } from '$lib/attempt-tracker';
import { VideoTriggerManager } from '$lib/video-storage';
import type { Lesson, LessonStep } from '$lib/lessons';

export interface CodeExecutionState {
  output: string;
  running: boolean;
  currentAttemptId: string | null;
  failStreak: number;
}

export function useCodeExecution() {
  const K_FAIL_STREAK = 'pysk:failStreak';
  
  // Code execution state
  const executionState: Writable<CodeExecutionState> = writable({
    output: '',
    running: false,
    currentAttemptId: null,
    failStreak: 0
  });

  // Validate code with OpenAI
  async function validateCode(code: string, lessonContext?: any) {
    try {
      const response = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          code, 
          lessonContext: lessonContext || '' 
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

  // Main code execution function
  async function runCode(
    py: any, 
    code: string, 
    currentLesson: Lesson | null, 
    currentStep: LessonStep | null,
    getCurrentLessonContext: () => string
  ): Promise<{
    success: boolean;
    validationResult: any;
    output: string;
    failStreak: number;
  }> {
    executionState.update(state => ({ ...state, output: '', running: true }));

    // Start tracking attempt if we have lesson context
    let attemptId: string | null = null;
    if (currentLesson && currentStep) {
      const exerciseId = currentStep.exercise?.id;
      attemptId = attemptTracker.startAttempt(currentLesson.id, currentStep.id, exerciseId);
      executionState.update(state => ({ ...state, currentAttemptId: attemptId }));
      attemptTracker.updateCode(code);
    }

    py.onStdout((s: string) => { 
      if (s) {
        executionState.update(state => ({ ...state, output: state.output + s }));
      }
    });
    py.onStderr((s: string) => { 
      if (s) {
        executionState.update(state => ({ ...state, output: state.output + s }));
      }
    });

    let executionSuccess = false;
    let executionError: string | undefined;
    let errorType: string | undefined;
    let validationResult: any;
    let currentOutput = '';
    let currentFailStreak = 0;

    try {
      // Step 1: Validate code with OpenAI
      currentOutput += '🔍 Kod kontrol ediliyor...\n';
      executionState.update(state => ({ ...state, output: currentOutput }));
      
      validationResult = await validateCode(code, getCurrentLessonContext());
      
      // Record validation result
      if (attemptId) {
        attemptTracker.recordValidation(validationResult);
      }
      
      // Step 2: Show validation feedback
      currentOutput += `\n📝 ${validationResult.feedback}\n`;
      
      if (validationResult.suggestions && validationResult.suggestions.length > 0) {
        currentOutput += '\n💡 Öneriler:\n';
        validationResult.suggestions.forEach((suggestion: string, i: number) => {
          currentOutput += `   ${i + 1}. ${suggestion}\n`;
        });
      }
      
      if (validationResult.educationalNotes) {
        currentOutput += `\n🎓 ${validationResult.educationalNotes}\n`;
      }
      
      currentOutput += '\n' + '='.repeat(40) + '\n';
      
      // Step 3: Run code in Pyodide (always run, validation is for feedback only)
      currentOutput += '🚀 Kod çalıştırılıyor...\n\n';
      executionState.update(state => ({ ...state, output: currentOutput }));
      
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
      
      currentOutput += `\n[Hata] ${executionError}`;
      executionState.update(state => ({ ...state, output: currentOutput }));
    } finally {
      executionState.update(state => ({ ...state, running: false }));
      
      // Record execution results and finish attempt
      if (attemptId) {
        attemptTracker.recordExecution(executionSuccess, currentOutput, executionError, errorType);
        
        // Determine if attempt was successful based on validation and execution
        const isSuccessful = executionSuccess && 
          (validationResult?.isValid || validationResult?.confidence > 0.7);
        
        attemptTracker.finishAttempt(isSuccessful);
        executionState.update(state => ({ ...state, currentAttemptId: null }));
        
        // Handle success/failure
        if (isSuccessful) {
          localStorage.setItem(K_FAIL_STREAK, '0');
          executionState.update(state => ({ ...state, failStreak: 0 }));
        } else {
          // Increment fail streak
          const newStreak = (parseInt(localStorage.getItem(K_FAIL_STREAK) || '0', 10) || 0) + 1;
          localStorage.setItem(K_FAIL_STREAK, String(newStreak));
          executionState.update(state => ({ ...state, failStreak: newStreak }));
          currentFailStreak = newStreak;
          
          // Video trigger manager with failed attempt count
          if (currentLesson && currentStep) {
            VideoTriggerManager.incrementFailedAttempts(currentLesson.id, currentStep.id);
          }

          // DON'T reset streak here - let the caller handle help video logic first
        }
      }
    }

    return {
      success: executionSuccess && (validationResult?.isValid || validationResult?.confidence > 0.7),
      validationResult,
      output: currentOutput,
      failStreak: currentFailStreak
    };
  }

  // Clear output
  function clearOutput() {
    executionState.update(state => ({ ...state, output: '' }));
  }

  // Track help request
  function handleHelpRequest(type: 'chat' | 'video') {
    executionState.update(state => {
      if (state.currentAttemptId) {
        attemptTracker.recordHelpRequest(type);
      }
      return state;
    });
  }

  // Get current fail streak
  function getCurrentFailStreak(): number {
    return parseInt(localStorage.getItem(K_FAIL_STREAK) || '0', 10) || 0;
  }

  // Reset fail streak (called after help video logic)
  function resetFailStreak() {
    localStorage.setItem(K_FAIL_STREAK, '0');
    executionState.update(state => ({ ...state, failStreak: 0 }));
  }

  return {
    // Store
    executionState,

    // Core functions
    runCode,
    validateCode,
    clearOutput,

    // Helper functions
    handleHelpRequest,
    getCurrentFailStreak,
    resetFailStreak
  };
}