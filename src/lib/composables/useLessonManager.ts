// src/lib/composables/useLessonManager.ts
// Lesson management composable for PyKid

import { writable, get, type Writable } from 'svelte/store';
import type { Lesson, LessonStep } from '$lib/lessons';
import { LESSONS } from '$lib/lessons';
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

export interface LessonState {
  currentLesson: Lesson | null;
  currentStep: LessonStep | null;
  showLessonSelector: boolean;
  showProgressDashboard: boolean;
}

export function useLessonManager() {
  // Lesson state
  const lessonState: Writable<LessonState> = writable({
    currentLesson: null,
    currentStep: null,
    showLessonSelector: false,
    showProgressDashboard: false
  });

  // Auto-select appropriate lesson and step
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
        lessonState.update(state => ({
          ...state,
          currentLesson: firstUncompletedLesson,
          currentStep: firstUncompletedStep
        }));
      } else {
        // All steps completed, show final project if exists
        if (firstUncompletedLesson.finalProject) {
          lessonState.update(state => ({
            ...state,
            currentLesson: firstUncompletedLesson,
            currentStep: {
              id: 'final-project',
              title: firstUncompletedLesson.finalProject!.title,
              content: firstUncompletedLesson.finalProject!.description,
              exercise: firstUncompletedLesson.finalProject
            }
          }));
        }
      }
    } else {
      // All lessons completed - start from first lesson for review
      const firstLesson = LESSONS[0];
      if (firstLesson) {
        lessonState.update(state => ({
          ...state,
          currentLesson: firstLesson,
          currentStep: firstLesson.steps[0]
        }));
      }
    }
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

  // Event handlers
  function handleLessonSelect(event: CustomEvent<{ lesson: Lesson }>) {
    const { lesson } = event.detail;
    
    // Find first uncompleted step in selected lesson
    const firstUncompletedStep = lesson.steps.find(step => 
      !isStepCompleted(lesson.id, step.id)
    );
    
    // Use first uncompleted step or first step if all completed
    const selectedStep = firstUncompletedStep || lesson.steps[0] || null;
    
    lessonState.update(state => ({
      ...state,
      currentLesson: lesson,
      currentStep: selectedStep
    }));
  }

  function handleStepSelect(event: CustomEvent<{ lesson: Lesson; step: LessonStep }>) {
    const { lesson, step } = event.detail;
    lessonState.update(state => ({
      ...state,
      currentLesson: lesson,
      currentStep: step
    }));
  }

  function handleCodeUpdate(event: CustomEvent<{ code: string }>) {
    // This would be handled by the parent component
    return event.detail.code;
  }

  // Progress to next step/lesson
  async function handleAutoProgression(): Promise<{
    nextStep?: LessonStep;
    nextLesson?: Lesson;
    isComplete?: boolean;
    message: string;
  }> {
    const state = get(lessonState);
    const currentLesson = state.currentLesson;
    const currentStep = state.currentStep;
    
    if (!currentLesson || !currentStep) {
      return { message: 'Lesson veya step bilgisi bulunamadı' };
    }
    
    // Mark current step as completed
    markStepCompleted(currentLesson.id, currentStep.id);
    
    // Check if it's an exercise step and was successful
    if (currentStep.exercise) {
      // Try to progress to next step
      const nextStep = getNextStep(currentLesson.id, currentStep.id);
      
      if (nextStep) {
        // Move to next step in same lesson
        lessonState.update(state => ({
          ...state,
          currentStep: nextStep
        }));
        
        return {
          nextStep,
          message: `🎉 Harika! Bir sonraki adıma geçiyoruz: "${nextStep.title}"`
        };
      } else {
        // No more steps, check for final project
        if (currentLesson.finalProject && !isStepCompleted(currentLesson.id, 'final-project')) {
          // Move to final project
          const finalProjectStep: LessonStep = {
            id: 'final-project',
            title: currentLesson.finalProject.title,
            content: currentLesson.finalProject.description,
            exercise: currentLesson.finalProject
          };
          
          lessonState.update(state => ({
            ...state,
            currentStep: finalProjectStep
          }));
          
          return {
            nextStep: finalProjectStep,
            message: `🎯 Tüm adımları tamamladın! Final projesine geçiyoruz: "${currentLesson.finalProject.title}"`
          };
        } else {
          // Mark lesson as completed and move to next lesson
          markLessonCompleted(currentLesson.id);
          
          const nextLesson = getNextLesson(currentLesson.id);
          if (nextLesson) {
            lessonState.update(state => ({
              ...state,
              currentLesson: nextLesson,
              currentStep: nextLesson.steps[0]
            }));
            
            return {
              nextLesson,
              nextStep: nextLesson.steps[0],
              message: `🌟 Dersi tamamladın! Bir sonraki derse geçiyoruz: "${nextLesson.title}"`
            };
          } else {
            // All lessons completed!
            return {
              isComplete: true,
              message: `🎉🎉🎉 TEBRİKLER! Tüm dersleri tamamladın! Python öğrenme serüvenin harika geçti! 🎉🎉🎉`
            };
          }
        }
      }
    }
    
    return { message: 'İlerleme durumu belirlenemedi' };
  }

  // Get current lesson context for Ada Teacher
  function getCurrentLessonContext(): string {
    const state = get(lessonState);
    const currentLesson = state.currentLesson;
    const currentStep = state.currentStep;
    
    if (!currentLesson || !currentStep) return '';
    
    const lessonInfo = `Öğrenci şu anda "${currentLesson.title}" dersinde "${currentStep.title}" adımında. `;
    const objective = currentLesson.objectives.length > 0 ? `Dersin hedefleri: ${currentLesson.objectives.join(', ')}. ` : '';
    const stepContent = currentStep.exercise ? 
      `Bu adımda "${currentStep.exercise.title}" alıştırmasını yapıyor. Alıştırma: ${currentStep.exercise.description}` :
      `Bu adımda teori öğreniyor: ${currentStep.content.substring(0, 200)}...`;
    
    return lessonInfo + objective + stepContent;
  }

  // Toggle modals
  function toggleLessonSelector() {
    lessonState.update(state => ({
      ...state,
      showLessonSelector: !state.showLessonSelector
    }));
  }

  function toggleProgressDashboard() {
    lessonState.update(state => ({
      ...state,
      showProgressDashboard: !state.showProgressDashboard
    }));
  }

  function closeLessonSelector() {
    lessonState.update(state => ({
      ...state,
      showLessonSelector: false
    }));
  }

  function closeProgressDashboard() {
    lessonState.update(state => ({
      ...state,
      showProgressDashboard: false
    }));
  }

  return {
    // Store
    lessonState,

    // Core functions
    autoSelectLessonAndStep,
    generateLessonComments,
    getCurrentLessonContext,
    
    // Event handlers
    handleLessonSelect,
    handleStepSelect,
    handleCodeUpdate,
    handleAutoProgression,

    // Modal controls
    toggleLessonSelector,
    toggleProgressDashboard,
    closeLessonSelector,
    closeProgressDashboard,

    // Utilities
    isStepCompleted,
    isLessonCompleted,
    LESSONS
  };
}
