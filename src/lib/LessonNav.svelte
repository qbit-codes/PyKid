<script lang="ts">
  import { LESSONS, isLessonCompleted, isStepCompleted, type Lesson, type LessonStep } from '$lib/lessons';
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher<{
    lessonSelect: { lesson: Lesson };
    stepSelect: { lesson: Lesson; step: LessonStep };
  }>();

  export let currentLessonId: string | null = null;
  export let currentStepId: string | null = null;

  let expandedLessonId: string | null = currentLessonId;

  // Auto-expand current lesson
  $: if (currentLessonId && expandedLessonId !== currentLessonId) {
    expandedLessonId = currentLessonId;
  }

  function selectLesson(lesson: Lesson) {
    dispatch('lessonSelect', { lesson });
    expandedLessonId = expandedLessonId === lesson.id ? null : lesson.id;
  }

  function selectStep(lesson: Lesson, step: LessonStep) {
    dispatch('stepSelect', { lesson, step });
  }

  function getLessonProgress(lesson: Lesson): { completed: number; total: number } {
    const total = lesson.steps.length + (lesson.finalProject ? 1 : 0);
    let completed = 0;
    
    lesson.steps.forEach(step => {
      if (isStepCompleted(lesson.id, step.id)) completed++;
    });
    
    if (lesson.finalProject && isStepCompleted(lesson.id, 'final-project')) {
      completed++;
    }
    
    return { completed, total };
  }

  function getDifficultyIcon(difficulty: string): string {
    switch (difficulty) {
      case 'beginner': return '🌱';
      case 'intermediate': return '🌿';
      case 'advanced': return '🌳';
      default: return '📚';
    }
  }

  function getDifficultyText(difficulty: string): string {
    switch (difficulty) {
      case 'beginner': return 'Başlangıç';
      case 'intermediate': return 'Orta';
      case 'advanced': return 'İleri';
      default: return 'Bilinmeyen';
    }
  }
</script>

<style>
  .lesson-nav {
    height: 100%;
    overflow-y: auto;
    padding: 0.75rem;
    font-size: 14px;
  }

  .lesson-card {
    margin-bottom: 0.5rem;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(8px);
    transition: all 0.2s ease;
  }

  .lesson-card:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.3);
  }

  .lesson-header {
    padding: 0.75rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .lesson-title {
    font-weight: 600;
    font-size: 13px;
    color: #1f2937;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .lesson-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 11px;
    color: #6b7280;
    margin-top: 0.25rem;
  }

  .progress-bar {
    height: 3px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
    margin-top: 0.5rem;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #10b981, #34d399);
    transition: width 0.3s ease;
  }

  .lesson-steps {
    padding: 0;
  }

  .step-item {
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 12px;
    color: #4b5563;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    transition: background-color 0.2s ease;
  }

  .step-item:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .step-item:last-child {
    border-bottom: none;
  }

  .step-item.active {
    background: rgba(59, 130, 246, 0.1);
    color: #2563eb;
    font-weight: 500;
  }

  .step-item.completed {
    color: #059669;
  }

  .step-icon {
    font-size: 14px;
    width: 16px;
    text-align: center;
  }

  .expand-icon {
    transition: transform 0.2s ease;
    color: #6b7280;
  }

  .expand-icon.expanded {
    transform: rotate(90deg);
  }

  .lesson-card.current {
    border-color: rgba(59, 130, 246, 0.4);
    box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.2);
  }

  .final-project {
    background: linear-gradient(135deg, rgba(168, 85, 247, 0.1), rgba(139, 92, 246, 0.1));
    border-color: rgba(168, 85, 247, 0.3);
  }
</style>

<div class="lesson-nav">
  <div class="mb-3">
    <h3 class="text-sm font-semibold text-gray-700 mb-1">📚 Python Dersleri</h3>
    <p class="text-xs text-gray-600">Adım adım Python öğren!</p>
  </div>

  {#each LESSONS as lesson}
    {@const progress = getLessonProgress(lesson)}
    {@const isExpanded = expandedLessonId === lesson.id}
    {@const isCurrent = currentLessonId === lesson.id}
    
    <div class="lesson-card" class:current={isCurrent}>
      <div 
        class="lesson-header" 
        role="button" 
        tabindex="0"
        on:click={() => selectLesson(lesson)}
        on:keydown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectLesson(lesson);
          }
        }}
      >
        <div>
          <div class="lesson-title">
            <span class="expand-icon" class:expanded={isExpanded}>▶</span>
            {getDifficultyIcon(lesson.difficulty)}
            {lesson.title}
          </div>
          <div class="lesson-info">
            <span>{getDifficultyText(lesson.difficulty)}</span>
            <span>•</span>
            <span>{lesson.estimatedTime} dk</span>
            <span>•</span>
            <span>{progress.completed}/{progress.total} tamamlandı</span>
          </div>
          <div class="progress-bar">
            <div 
              class="progress-fill" 
              style="width: {progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%"
            ></div>
          </div>
        </div>
      </div>

      {#if isExpanded}
        <div class="lesson-steps">
          {#each lesson.steps as step}
            {@const stepCompleted = isStepCompleted(lesson.id, step.id)}
            {@const stepActive = currentLessonId === lesson.id && currentStepId === step.id}
            
            <div 
              class="step-item" 
              class:completed={stepCompleted}
              class:active={stepActive}
              role="button"
              tabindex="0"
              on:click={() => selectStep(lesson, step)}
              on:keydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  selectStep(lesson, step);
                }
              }}
            >
              <span class="step-icon">
                {#if stepCompleted}
                  ✅
                {:else if stepActive}
                  ▶️
                {:else if step.exercise}
                  🏋️
                {:else}
                  📖
                {/if}
              </span>
              <span>{step.title}</span>
            </div>
          {/each}

          {#if lesson.finalProject}
            {@const projectCompleted = isStepCompleted(lesson.id, 'final-project')}
            {@const projectActive = currentLessonId === lesson.id && currentStepId === 'final-project'}
            
            <div 
              class="step-item final-project" 
              class:completed={projectCompleted}
              class:active={projectActive}
              role="button"
              tabindex="0"
              on:click={() => selectStep(lesson, { 
                id: 'final-project', 
                title: lesson.finalProject?.title || '', 
                content: lesson.finalProject?.description || '',
                exercise: lesson.finalProject 
              })}
              on:keydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  selectStep(lesson, { 
                    id: 'final-project', 
                    title: lesson.finalProject?.title || '', 
                    content: lesson.finalProject?.description || '',
                    exercise: lesson.finalProject 
                  });
                }
              }}
            >
              <span class="step-icon">
                {#if projectCompleted}
                  🏆
                {:else if projectActive}
                  ⭐
                {:else}
                  🎯
                {/if}
              </span>
              <span>🎯 {lesson.finalProject?.title || 'Final Project'}</span>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/each}

  <div class="mt-4 p-3 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200">
    <div class="text-xs text-blue-800 font-medium mb-1">💡 İpucu</div>
    <div class="text-xs text-blue-700">
      Dersleri sırayla tamamlayın. Her alıştırmayı yapmadan geçmeyin!
    </div>
  </div>
</div>