<script lang="ts">
  import { onMount } from 'svelte';
  import { attemptTracker, type AttemptData, type LessonProgress, type UserAnalytics } from '$lib/attempt-tracker';
  import { LESSONS, type Lesson } from '$lib/lessons';

  let analytics: UserAnalytics | null = null;
  let allProgress: LessonProgress[] = [];
  let recentAttempts: AttemptData[] = [];
  let selectedLesson: string | null = null;
  let showDetails = false;
  
  onMount(() => {
    loadProgressData();
  });
  
  function loadProgressData() {
    analytics = attemptTracker.getUserAnalytics();
    allProgress = attemptTracker.getAllProgress();
    
    // Get recent attempts (last 10)
    const allAttempts = attemptTracker.getAttemptsFor('');
    recentAttempts = allAttempts
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10);
  }
  
  function formatDuration(ms: number): string {
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
  
  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  function getLessonTitle(lessonId: string): string {
    const lesson = LESSONS.find(l => l.id === lessonId);
    return lesson?.title || lessonId;
  }
  
  function getStepTitle(lessonId: string, stepId: string): string {
    const lesson = LESSONS.find(l => l.id === lessonId);
    const step = lesson?.steps.find(s => s.id === stepId);
    return step?.title || stepId;
  }
  
  function getSuccessPercentage(): number {
    if (!analytics || analytics.totalAttempts === 0) return 0;
    return Math.round(analytics.successRate * 100);
  }
  
  function getMostCommonErrorType(): string {
    if (!analytics || Object.keys(analytics.commonErrorTypes).length === 0) {
      return 'Yok';
    }
    
    const entries = Object.entries(analytics.commonErrorTypes);
    const mostCommon = entries.reduce((a, b) => a[1] > b[1] ? a : b);
    
    const errorTypeMap: { [key: string]: string } = {
      'syntax': 'Sözdizimi Hatası',
      'logic': 'Mantık Hatası',
      'runtime': 'Çalışma Zamanı Hatası',
      'timeout': 'Zaman Aşımı'
    };
    
    return errorTypeMap[mostCommon[0]] || mostCommon[0];
  }
  
  function getActiveTimeOfDay(): string {
    if (!analytics || Object.keys(analytics.learningPatterns.timeOfDay).length === 0) {
      return 'Belirsiz';
    }
    
    const entries = Object.entries(analytics.learningPatterns.timeOfDay);
    const mostActive = entries.reduce((a, b) => a[1] > b[1] ? a : b);
    const hour = parseInt(mostActive[0]);
    
    if (hour >= 6 && hour < 12) return '🌅 Sabah (6-12)';
    if (hour >= 12 && hour < 18) return '☀️ Öğleden Sonra (12-18)';
    if (hour >= 18 && hour < 22) return '🌆 Akşam (18-22)';
    return '🌙 Gece (22-6)';
  }
  
  function exportProgress() {
    const data = attemptTracker.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pykid-progress-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  
  function clearAllData() {
    if (confirm('Tüm ilerleme verilerini silmek istediğinize emin misiniz? Bu işlem geri alınamaz!')) {
      attemptTracker.clearAllData();
      loadProgressData();
    }
  }
</script>

<style>
  .dashboard {
    padding: 1.5rem;
    max-height: 80vh;
    overflow-y: auto;
    background: #f0efed;
    border-radius: 0.5rem;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }
  
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }
  
  .stat-card {
    background: #f8fafc;
    padding: 1rem;
    border-radius: 0.5rem;
    border: 1px solid #e2e8f0;
    text-align: center;
  }
  
  .stat-value {
    font-size: 2rem;
    font-weight: bold;
    color: #1e40af;
  }
  
  .stat-label {
    font-size: 0.875rem;
    color: #64748b;
    margin-top: 0.25rem;
  }
  
  .progress-section {
    margin-bottom: 2rem;
  }
  
  .section-title {
    font-size: 1.25rem;
    font-weight: bold;
    margin-bottom: 1rem;
    color: #1f2937;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .progress-item {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 1rem;
    margin-bottom: 0.75rem;
  }
  
  .progress-header {
    display: flex;
    justify-content: between;
    align-items: center;
    margin-bottom: 0.5rem;
  }
  
  .lesson-info {
    flex: 1;
  }
  
  .lesson-title {
    font-weight: bold;
    color: #374151;
  }
  
  .step-title {
    font-size: 0.875rem;
    color: #6b7280;
  }
  
  .progress-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 0.75rem;
    font-size: 0.875rem;
  }
  
  .stat-item {
    text-align: center;
    padding: 0.5rem;
    background: white;
    border-radius: 0.25rem;
  }
  
  .attempt-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    margin-bottom: 0.5rem;
  }
  
  .attempt-info {
    flex: 1;
  }
  
  .attempt-lesson {
    font-weight: bold;
    font-size: 0.875rem;
  }
  
  .attempt-details {
    font-size: 0.75rem;
    color: #6b7280;
    margin-top: 0.25rem;
  }
  
  .attempt-status {
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: bold;
  }
  
  .success {
    background: #dcfce7;
    color: #166534;
  }
  
  .failure {
    background: #fee2e2;
    color: #dc2626;
  }
  
  .button {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.875rem;
    margin-right: 0.5rem;
  }
  
  .button-primary {
    background: #448bd1;
    color: white;
  }
  
  .button-secondary {
    background: #e5e7eb;
    color: #374151;
  }
  
  .button-danger {
    background: #f86262;
    color: white;
  }
  
  .empty-state {
    text-align: center;
    padding: 2rem;
    color: #6b7280;
  }
</style>

<div class="dashboard">
  <div class="flex justify-between items-center mb-6">
    <h2 class="text-2xl font-bold text-gray-800">📊 İlerleme Panosu</h2>
    <div>
      <button class="button button-primary" on:click={exportProgress}>
        📥 Dışa Aktar
      </button>
      <button class="button button-danger" on:click={clearAllData}>
        🗑️ Verileri Sil
      </button>
    </div>
  </div>

  {#if analytics && analytics.totalAttempts > 0}
    <!-- Overview Stats -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">{analytics.totalAttempts}</div>
        <div class="stat-label">Toplam Deneme</div>
      </div>
      
      <div class="stat-card">
        <div class="stat-value">{getSuccessPercentage()}%</div>
        <div class="stat-label">Başarı Oranı</div>
      </div>
      
      <div class="stat-card">
        <div class="stat-value">{formatDuration(analytics.totalTimeSpent)}</div>
        <div class="stat-label">Toplam Süre</div>
      </div>
      
      <div class="stat-card">
        <div class="stat-value">{analytics.exercisesCompleted}</div>
        <div class="stat-label">Tamamlanan Alıştırma</div>
      </div>
      
      <div class="stat-card">
        <div class="stat-value">{formatDuration(analytics.averageTimePerAttempt)}</div>
        <div class="stat-label">Ortalama Deneme Süresi</div>
      </div>
      
      <div class="stat-card">
        <div class="stat-value">{getMostCommonErrorType()}</div>
        <div class="stat-label">En Sık Hata Türü</div>
      </div>
    </div>

    <!-- Learning Patterns -->
    <div class="progress-section">
      <h3 class="section-title">🧠 Öğrenme Desenleri</h3>
      <div class="progress-item">
        <div class="progress-stats">
          <div class="stat-item">
            <div class="font-bold">Tercih Edilen Yardım</div>
            <div class="text-sm mt-1">
              {#if analytics.learningPatterns.preferredHelpMethod === 'chat'}
                💬 Sohbet
              {:else if analytics.learningPatterns.preferredHelpMethod === 'video'}
                🎥 Video
              {:else if analytics.learningPatterns.preferredHelpMethod === 'hints'}
                💡 İpucu
              {:else}
                🧪 Deneme-Yanılma
              {/if}
            </div>
          </div>
          
          <div class="stat-item">
            <div class="font-bold">Aktif Zaman Dilimi</div>
            <div class="text-sm mt-1">{getActiveTimeOfDay()}</div>
          </div>
          
          <div class="stat-item">
            <div class="font-bold">Başlama Tarihi</div>
            <div class="text-sm mt-1">{formatDate(analytics.startDate).split(' ')[0]}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Lesson Progress -->
    <div class="progress-section">
      <h3 class="section-title">📚 Ders İlerlemesi</h3>
      {#each allProgress as progress}
        <div class="progress-item">
          <div class="progress-header">
            <div class="lesson-info">
              <div class="lesson-title">{getLessonTitle(progress.lessonId)}</div>
              <div class="step-title">{getStepTitle(progress.lessonId, progress.stepId)}</div>
            </div>
          </div>
          
          <div class="progress-stats">
            <div class="stat-item">
              <div class="font-bold">{progress.totalAttempts}</div>
              <div class="text-xs">Toplam Deneme</div>
            </div>
            
            <div class="stat-item">
              <div class="font-bold">{progress.successfulAttempts}</div>
              <div class="text-xs">Başarılı</div>
            </div>
            
            <div class="stat-item">
              <div class="font-bold">{Math.round((progress.successfulAttempts / progress.totalAttempts) * 100)}%</div>
              <div class="text-xs">Başarı Oranı</div>
            </div>
            
            <div class="stat-item">
              <div class="font-bold">{formatDuration(progress.totalTimeSpent)}</div>
              <div class="text-xs">Toplam Süre</div>
            </div>
            
            <div class="stat-item">
              <div class="font-bold">{progress.currentStreak}</div>
              <div class="text-xs">Güncel Seri</div>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <!-- Recent Attempts -->
    <div class="progress-section">
      <h3 class="section-title">⏱️ Son Denemeler</h3>
      {#each recentAttempts.slice(0, 5) as attempt}
        <div class="attempt-item">
          <div class="attempt-info">
            <div class="attempt-lesson">{getLessonTitle(attempt.lessonId)} - {getStepTitle(attempt.lessonId, attempt.stepId)}</div>
            <div class="attempt-details">
              {formatDate(attempt.timestamp)} • {formatDuration(attempt.duration || 0)} • 
              {attempt.helpRequests} yardım talebi
            </div>
          </div>
          
          <div class="attempt-status {attempt.isSuccessful ? 'success' : 'failure'}">
            {attempt.isSuccessful ? '✅ Başarılı' : '❌ Başarısız'}
          </div>
        </div>
      {/each}
    </div>

  {:else}
    <div class="empty-state">
      <h3 class="text-lg font-bold mb-2">📊 Henüz İlerleme Verisi Yok</h3>
      <p>Kodlarınızı çalıştırmaya başladığınızda ilerlemeniz burada görünecek!</p>
    </div>
  {/if}
</div>