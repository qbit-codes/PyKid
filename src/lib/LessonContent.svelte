<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Lesson, LessonStep, Exercise } from '$lib/lessons';
  import { markStepCompleted, getNextStep, getNextLesson } from '$lib/lessons';

  const dispatch = createEventDispatcher<{
    codeUpdate: { code: string };
    exerciseComplete: { lesson: Lesson; step: LessonStep };
    nextStep: { lesson: Lesson; step: LessonStep };
    nextLesson: { lesson: Lesson };
    getEditorCode: void;
  }>();

  export let lesson: Lesson | null = null;
  export let step: LessonStep | null = null;
  export let currentOutput: string = '';
  export let currentEditorCode: string = '';

  let showHints = false;
  let hintsUsed = 0;

  $: if (step) {
    showHints = false;
    hintsUsed = 0;
  }

  function loadStarterCode() {
    if (step?.exercise?.starterCode) {
      dispatch('codeUpdate', { code: step.exercise.starterCode });
    } else if (step?.codeExample) {
      dispatch('codeUpdate', { code: step.codeExample });
    }
  }

  function loadSolution() {
    if (step?.exercise?.solutionCode) {
      dispatch('codeUpdate', { code: step.exercise.solutionCode });
    }
  }

  function validateExercise(): { isValid: boolean; feedback: string } {
    if (!step?.exercise || !lesson) {
      return { isValid: false, feedback: 'Alıştırma bulunamadı.' };
    }

    const exercise = step.exercise;
    const validation = exercise.validation;
    let feedback = '';
    
    // Check expected output
    if (validation.expectedOutput && validation.expectedOutput.length > 0) {
      const hasExpectedOutput = validation.expectedOutput.some(expected =>
        currentOutput.toLowerCase().includes(expected.toLowerCase())
      );
      if (!hasExpectedOutput) {
        feedback += `Beklenen çıktı bulunamadı. Aranan kelimeler: ${validation.expectedOutput.join(', ')}. `;
        return { isValid: false, feedback };
      }
    }

    // Check must contain in code
    if (validation.mustContain && validation.mustContain.length > 0) {
      // We need to get current editor code
      // For now, this will be a simplified check
      const missingItems = validation.mustContain.filter(item => 
        !currentEditorCode.includes(item)
      );
      if (missingItems.length > 0) {
        feedback += `Kodunuzda bulunması gerekenler eksik: ${missingItems.join(', ')}. `;
        return { isValid: false, feedback };
      }
    }

    // Check must not contain in code
    if (validation.mustNotContain && validation.mustNotContain.length > 0) {
      const foundItems = validation.mustNotContain.filter(item => 
        currentEditorCode.includes(item)
      );
      if (foundItems.length > 0) {
        feedback += `Kodunuzda bulunmaması gerekenler var: ${foundItems.join(', ')}. `;
        return { isValid: false, feedback };
      }
    }

    // Custom validation
    if (validation.customValidation) {
      try {
        const customResult = validation.customValidation(currentEditorCode, currentOutput);
        if (!customResult) {
          feedback += 'Özel validasyon kontrolü başarısız. ';
          return { isValid: false, feedback };
        }
      } catch (error) {
        feedback += 'Validasyon hatası oluştu. ';
        return { isValid: false, feedback };
      }
    }
    
    return { isValid: true, feedback: 'Tebrikler! Alıştırma başarılı!' };
  }

  let validationFeedback = '';
  let validationResult: 'success' | 'error' | null = null;

  // Reset validation state when step changes
  $: if (step) {
    validationFeedback = '';
    validationResult = null;
  }

  function completeExercise() {
    if (!lesson || !step) return;
    
    // Get current editor code from parent
    // For now, we'll need to implement this properly
    const validation = validateExercise();
    validationFeedback = validation.feedback;
    validationResult = validation.isValid ? 'success' : 'error';
    
    if (validation.isValid) {
      markStepCompleted(lesson.id, step.id);
      dispatch('exerciseComplete', { lesson, step });
      
      // Check for next step/lesson
      const nextStep = getNextStep(lesson.id, step.id);
      if (nextStep) {
        setTimeout(() => {
          dispatch('nextStep', { lesson, step: nextStep });
          validationFeedback = '';
          validationResult = null;
        }, 2000);
      } else {
        const nextLesson = getNextLesson(lesson.id);
        if (nextLesson) {
          setTimeout(() => {
            dispatch('nextLesson', { lesson: nextLesson });
            validationFeedback = '';
            validationResult = null;
          }, 2000);
        }
      }
    }
    
    // Clear feedback after some time
    setTimeout(() => {
      if (validationResult === 'error') {
        validationFeedback = '';
        validationResult = null;
      }
    }, 5000);
  }

  function showNextHint() {
    if (step?.exercise?.hints && hintsUsed < step.exercise.hints.length) {
      hintsUsed++;
      showHints = true;
    }
  }

  // Convert markdown to HTML (simple version without external library)
  function renderMarkdown(text: string): string {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
      .replace(/^- (.*$)/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
      .replace(/\n/g, '<br>');
  }
</script>

<style>
  .lesson-content {
    height: 100%;
    overflow-y: auto;
    padding: 1rem;
    font-size: 14px;
  }

  .lesson-header {
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid rgba(255, 255, 255, 0.2);
  }

  .lesson-title {
    font-size: 18px;
    font-weight: bold;
    color: #1f2937;
    margin-bottom: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .lesson-meta {
    display: flex;
    gap: 1rem;
    font-size: 12px;
    color: #6b7280;
    margin-bottom: 0.5rem;
  }

  .lesson-description {
    color: #4b5563;
    line-height: 1.5;
  }

  .step-content {
    line-height: 1.6;
    color: #374151;
  }

  :global(.step-content h1),
  :global(.step-content h2),
  :global(.step-content h3) {
    color: #1f2937;
    font-weight: 600;
    margin: 1rem 0 0.5rem 0;
  }

  :global(.step-content h1) { font-size: 16px; }
  :global(.step-content h2) { font-size: 15px; }
  :global(.step-content h3) { font-size: 14px; }

  :global(.step-content p) {
    margin: 0.5rem 0;
  }

  :global(.step-content ul) {
    margin: 0.5rem 0;
    padding-left: 1.5rem;
  }

  :global(.step-content li) {
    margin: 0.25rem 0;
  }

  :global(.step-content code) {
    background: rgba(0, 0, 0, 0.05);
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    font-family: ui-monospace, Menlo, Monaco, monospace;
    font-size: 12px;
  }

  :global(.step-content strong) {
    font-weight: 600;
    color: #1f2937;
  }

  .code-example {
    background: linear-gradient(135deg, #f8fafc, #f1f5f9);
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    margin: 1rem 0;
    overflow: hidden;
  }

  .code-header {
    background: #334155;
    color: white;
    padding: 0.5rem 0.75rem;
    font-size: 12px;
    font-weight: 500;
  }

  .code-block {
    padding: 0.75rem;
    font-family: ui-monospace, Menlo, Monaco, monospace;
    font-size: 12px;
    white-space: pre-wrap;
    color: #1e293b;
    line-height: 1.4;
  }

  .exercise-section {
    background: linear-gradient(135deg, #fefce8, #fef3c7);
    border: 2px solid #f59e0b;
    border-radius: 10px;
    margin: 1.5rem 0;
    overflow: hidden;
  }

  .exercise-header {
    background: #f59e0b;
    color: white;
    padding: 0.75rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .exercise-content {
    padding: 1rem;
  }

  .exercise-description {
    margin-bottom: 1rem;
    color: #7c2d12;
    font-weight: 500;
  }

  .exercise-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 1rem;
  }

  .btn {
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    border: none;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .btn-primary {
    background: #3b82f6;
    color: white;
  }

  .btn-primary:hover {
    background: #2563eb;
  }

  .btn-secondary {
    background: #6b7280;
    color: white;
  }

  .btn-secondary:hover {
    background: #4b5563;
  }

  .btn-success {
    background: #10b981;
    color: white;
  }

  .btn-success:hover {
    background: #059669;
  }

  .btn-warning {
    background: #f59e0b;
    color: white;
  }

  .btn-warning:hover {
    background: #d97706;
  }

  .hints-section {
    background: rgba(59, 130, 246, 0.05);
    border: 1px solid rgba(59, 130, 246, 0.2);
    border-radius: 8px;
    padding: 0.75rem;
    margin-top: 1rem;
  }

  .hints-title {
    font-weight: 600;
    color: #1e40af;
    margin-bottom: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .hint-item {
    background: white;
    border: 1px solid rgba(59, 130, 246, 0.1);
    border-radius: 6px;
    padding: 0.5rem;
    margin: 0.25rem 0;
    color: #1e40af;
    font-size: 13px;
  }

  .objectives-list {
    background: rgba(16, 185, 129, 0.05);
    border: 1px solid rgba(16, 185, 129, 0.2);
    border-radius: 8px;
    padding: 0.75rem;
    margin: 1rem 0;
  }

  .objectives-title {
    font-weight: 600;
    color: #047857;
    margin-bottom: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .empty-state {
    text-align: center;
    padding: 2rem;
    color: #6b7280;
  }

  .validation-feedback {
    border-radius: 8px;
    padding: 0.75rem;
    margin-top: 1rem;
    border: 2px solid;
    animation: slideIn 0.3s ease;
  }

  .validation-feedback.success {
    background: rgba(16, 185, 129, 0.1);
    border-color: #10b981;
    color: #047857;
  }

  .validation-feedback.error {
    background: rgba(239, 68, 68, 0.1);
    border-color: #ef4444;
    color: #dc2626;
  }

  .feedback-title {
    font-weight: 600;
    margin-bottom: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .feedback-message {
    font-size: 13px;
    line-height: 1.4;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>

<div class="lesson-content">
  {#if lesson && step}
    <!-- Lesson header (only show for first step) -->
    {#if step.id === lesson.steps[0]?.id}
      <div class="lesson-header">
        <div class="lesson-title">
          📚 {lesson.title}
        </div>
        <div class="lesson-meta">
          <span>⏱️ {lesson.estimatedTime} dakika</span>
          <span>📊 {lesson.difficulty === 'beginner' ? 'Başlangıç' : lesson.difficulty === 'intermediate' ? 'Orta' : 'İleri'}</span>
          <span>📖 {lesson.steps.length} adım</span>
        </div>
        <div class="lesson-description">{lesson.description}</div>
        
        <!-- Lesson objectives -->
        <div class="objectives-list">
          <div class="objectives-title">
            🎯 Bu derste öğreneceklerin:
          </div>
          <ul>
            {#each lesson.objectives as objective}
              <li>{objective}</li>
            {/each}
          </ul>
        </div>
      </div>
    {/if}

    <!-- Step title -->
    <h2 class="text-lg font-semibold mb-3 flex items-center gap-2">
      {#if step.id === 'final-project'}
        🏆
      {:else if step.exercise}
        🏋️
      {:else}
        📖
      {/if}
      {step.title}
    </h2>

    <!-- Step content -->
    <div class="step-content">
      {@html renderMarkdown(step.content)}
    </div>

    <!-- Code example -->
    {#if step.codeExample}
      <div class="code-example">
        <div class="code-header">
          💻 Örnek Kod
        </div>
        <div class="code-block">{step.codeExample}</div>
        <div class="exercise-actions" style="padding: 0.75rem; background: rgba(0,0,0,0.02);">
          <button class="btn btn-secondary" on:click={loadStarterCode}>
            📋 Kodu Editöre Yükle
          </button>
        </div>
      </div>
    {/if}

    <!-- Exercise section -->
    {#if step.exercise}
      <div class="exercise-section">
        <div class="exercise-header">
          🏋️ Alıştırma: {step.exercise.title}
        </div>
        <div class="exercise-content">
          <div class="exercise-description">
            {step.exercise.description}
          </div>

          <div class="exercise-actions">
            <button class="btn btn-primary" on:click={loadStarterCode}>
              🚀 Başla
            </button>
            <button class="btn btn-warning" on:click={showNextHint} disabled={!step.exercise.hints || hintsUsed >= step.exercise.hints.length}>
              💡 İpucu ({hintsUsed}/{step.exercise.hints?.length || 0})
            </button>
            <button class="btn btn-secondary" on:click={loadSolution}>
              👁️ Çözümü Göster
            </button>
            <button class="btn btn-success" on:click={completeExercise}>
              ✅ Tamamladım
            </button>
          </div>

          <!-- Hints -->
          {#if showHints && step.exercise.hints && hintsUsed > 0}
            <div class="hints-section">
              <div class="hints-title">💡 İpuçları:</div>
              {#each step.exercise.hints.slice(0, hintsUsed) as hint}
                <div class="hint-item">
                  {hint}
                </div>
              {/each}
            </div>
          {/if}

          <!-- Validation Feedback -->
          {#if validationFeedback && validationResult}
            <div class="validation-feedback" class:success={validationResult === 'success'} class:error={validationResult === 'error'}>
              <div class="feedback-title">
                {#if validationResult === 'success'}
                  ✅ Başarılı!
                {:else}
                  ❌ Kontrol Et
                {/if}
              </div>
              <div class="feedback-message">
                {validationFeedback}
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Video section placeholder -->
    {#if step.videoUrl}
      <div class="code-example">
        <div class="code-header">
          🎥 Video Açıklaması
        </div>
        <div class="exercise-content">
          <p>Bu konuyla ilgili video açıklaması yakında eklenecek!</p>
          <small class="text-gray-500">Video URL: {step.videoUrl}</small>
        </div>
      </div>
    {/if}

  {:else}
    <div class="empty-state">
      <div style="font-size: 48px; margin-bottom: 1rem;">📚</div>
      <h3 style="margin-bottom: 0.5rem; color: #374151;">Bir ders seçin</h3>
      <p>Sol panelden bir ders ve adım seçerek Python öğrenmeye başlayın!</p>
    </div>
  {/if}
</div>

