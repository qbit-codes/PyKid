// src/lib/lesson-context.ts
export interface LessonContext {
  studentId?: string;
  currentLesson?: string;
  currentTopic?: string;
  lessonObjective?: string;
  completedLessons: string[];
  completedTopics: string[];
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
  strugglingConcepts: string[];
  masteredConcepts: string[];
  lastCodeSubmission?: string;
  lastErrors?: string[];
  sessionStartTime: number;
  totalPracticeTime: number;
  codeEditorContent?: string;
}

export interface CodeAnalysis {
  hasErrors: boolean;
  errorTypes: string[];
  complexity: 'simple' | 'moderate' | 'complex';
  concepts: string[];
  suggestions: string[];
}

// Function tools schema for OpenAI
export const LESSON_FUNCTION_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "get_lesson_progress",
      description: "Öğrencinin mevcut ders ilerlemesini ve tamamladığı konuları getirir",
      parameters: {
        type: "object",
        properties: {
          studentId: {
            type: "string",
            description: "Öğrenci kimliği (opsiyonel, session-based olabilir)"
          }
        }
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "analyze_student_code",
      description: "Öğrencinin yazdığı kodu analiz eder ve hata türlerini, zorluk seviyesini belirler",
      parameters: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "Analiz edilecek Python kodu"
          },
          context: {
            type: "string",
            description: "Kodun yazıldığı bağlam (hangi alıştırma, konu vs.)"
          }
        },
        required: ["code"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "update_skill_assessment",
      description: "Öğrencinin beceri seviyesini ve zorlandığı/öğrendiği konuları günceller",
      parameters: {
        type: "object",
        properties: {
          concept: {
            type: "string",
            description: "Öğrenilen veya zorlanılan Python konsepti"
          },
          status: {
            type: "string",
            enum: ["struggling", "learning", "mastered"],
            description: "Konseptteki öğrenci durumu"
          },
          evidence: {
            type: "string", 
            description: "Bu değerlendirmeye yol açan kanıt (kod hatası, başarılı uygulama vs.)"
          }
        },
        required: ["concept", "status"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "suggest_practice_exercise",
      description: "Öğrencinin seviyesine ve eksik konularına göre alıştırma önerir",
      parameters: {
        type: "object",
        properties: {
          targetConcept: {
            type: "string",
            description: "Hedeflenen Python konsepti (örn: 'loops', 'functions', 'lists')"
          },
          difficulty: {
            type: "string",
            enum: ["easy", "medium", "hard"],
            description: "İstenilen zorluk seviyesi"
          }
        },
        required: ["targetConcept"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "track_session_activity",
      description: "Öğrencinin mevcut oturumdaki aktivitesini ve süresini takip eder",
      parameters: {
        type: "object",
        properties: {
          activity: {
            type: "string",
            enum: ["coding", "asking_question", "reading_explanation", "struggling"],
            description: "Mevcut aktivite türü"
          },
          duration: {
            type: "number",
            description: "Aktivite süresi (dakika)"
          }
        },
        required: ["activity"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "detect_current_lesson_topic",
      description: "Kod editöründeki içeriğe bakarak öğrencinin hangi konuda çalıştığını belirler",
      parameters: {
        type: "object",
        properties: {
          editorContent: {
            type: "string",
            description: "Kod editöründeki mevcut içerik"
          }
        }
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "set_lesson_context",
      description: "Mevcut ders konusunu ve öğrenme hedefini belirler",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            description: "Mevcut ders konusu (örn: 'variables', 'loops', 'functions')"
          },
          objective: {
            type: "string",
            description: "Bu dersin öğrenme hedefi"
          },
          lessonName: {
            type: "string",
            description: "Dersin ismi"
          }
        },
        required: ["topic"]
      }
    }
  }
];

// Function implementations
export class LessonContextManager {
  private context: LessonContext;

  constructor(initialContext?: Partial<LessonContext>) {
    this.context = {
      completedLessons: [],
      completedTopics: [],
      skillLevel: 'beginner',
      strugglingConcepts: [],
      masteredConcepts: [],
      sessionStartTime: Date.now(),
      totalPracticeTime: 0,
      ...initialContext
    };
  }

  getLessonProgress(): LessonContext {
    return { ...this.context };
  }

  analyzeStudentCode(code: string, context?: string): CodeAnalysis {
    const analysis: CodeAnalysis = {
      hasErrors: false,
      errorTypes: [],
      complexity: 'simple',
      concepts: [],
      suggestions: []
    };

    // Basit kod analizi - daha gelişmiş AST parsing eklenebilir
    const lines = code.split('\n').filter(line => line.trim());
    
    // Hata kontrolü
    if (code.includes('=') && !code.includes('==') && code.includes('if')) {
      analysis.hasErrors = true;
      analysis.errorTypes.push('assignment_in_condition');
      analysis.suggestions.push('Koşullarda karşılaştırma için == kullanın');
    }

    // Konsept tespiti
    if (code.includes('for') || code.includes('while')) {
      analysis.concepts.push('loops');
    }
    if (code.includes('def ')) {
      analysis.concepts.push('functions');
    }
    if (code.includes('[') && code.includes(']')) {
      analysis.concepts.push('lists');
    }
    if (code.includes('if') || code.includes('elif') || code.includes('else')) {
      analysis.concepts.push('conditionals');
    }

    // Karmaşıklık hesabı
    if (lines.length > 15 || analysis.concepts.length > 3) {
      analysis.complexity = 'complex';
    } else if (lines.length > 5 || analysis.concepts.length > 1) {
      analysis.complexity = 'moderate';
    }

    return analysis;
  }

  updateSkillAssessment(concept: string, status: 'struggling' | 'learning' | 'mastered', evidence?: string): void {
    // Eski durumu temizle
    this.context.strugglingConcepts = this.context.strugglingConcepts.filter(c => c !== concept);
    this.context.masteredConcepts = this.context.masteredConcepts.filter(c => c !== concept);

    // Yeni durumu ekle
    if (status === 'struggling') {
      this.context.strugglingConcepts.push(concept);
    } else if (status === 'mastered') {
      this.context.masteredConcepts.push(concept);
    }

    console.log(`Skill updated: ${concept} -> ${status}`, evidence);
  }

  suggestPracticeExercise(targetConcept: string, difficulty: 'easy' | 'medium' | 'hard' = 'easy'): string {
    const exercises = {
      loops: {
        easy: "1'den 10'a kadar sayıları yazdıran bir for döngüsü yaz",
        medium: "Bir listedeki çift sayıları bulan döngü yaz", 
        hard: "İç içe döngülerle çarpım tablosu oluştur"
      },
      functions: {
        easy: "İki sayıyı toplayan bir fonksiyon yaz",
        medium: "Bir listenin en büyük elemanını bulan fonksiyon yaz",
        hard: "Recursive fibonacci fonksiyonu yaz"
      },
      lists: {
        easy: "Favori meyvelerini içeren bir liste oluştur",
        medium: "Bir listeden tekrar eden elemanları çıkar",
        hard: "İki listeyi birleştirip sırala"
      },
      conditionals: {
        easy: "Yaşa göre ehliyet alıp alamayacağını kontrol et",
        medium: "Not ortalamasına göre harf notu belirle",
        hard: "Karmaşık şartlarla kullanıcı doğrulama sistemi yaz"
      }
    };

    return exercises[targetConcept as keyof typeof exercises]?.[difficulty] || 
           "Temel Python konseptlerini pekiştiren bir alıştırma yap";
  }

  trackSessionActivity(activity: 'coding' | 'asking_question' | 'reading_explanation' | 'struggling', duration?: number): void {
    console.log(`Activity tracked: ${activity}`, duration ? `for ${duration} minutes` : '');
    
    if (duration) {
      this.context.totalPracticeTime += duration;
    }
  }

  detectCurrentLessonTopic(editorContent: string): { topic: string; confidence: number; suggestions: string[] } {
    const content = editorContent.toLowerCase();
    const topicKeywords = {
      'variables': ['=', 'name', 'age', 'number', 'string', 'int(', 'float(', 'str('],
      'input_output': ['input(', 'print(', 'name = input', 'age = input'],
      'conditionals': ['if', 'elif', 'else', '==', '!=', '>', '<', '>=', '<='],
      'loops': ['for', 'while', 'range(', 'in range', 'for i in'],
      'lists': ['[', ']', 'list', '.append(', '.remove(', 'len('],
      'functions': ['def ', 'return', 'function', 'parameter'],
      'strings': ['"', "'", '.upper(', '.lower(', '.replace(', 'split('],
      'math': ['+', '-', '*', '/', '//', '%', '**', 'math.'],
      'basics': ['print("hello")', 'hello world', 'first program']
    };

    let bestTopic = 'basics';
    let maxScore = 0;
    const suggestions: string[] = [];

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      let score = 0;
      for (const keyword of keywords) {
        if (content.includes(keyword)) {
          score += keyword.length; // Longer keywords get more weight
        }
      }
      
      if (score > maxScore) {
        maxScore = score;
        bestTopic = topic;
      }
    }

    // Generate topic-specific suggestions
    switch (bestTopic) {
      case 'variables':
        suggestions.push('Try creating different types of variables (text, numbers)');
        break;
      case 'conditionals':
        suggestions.push('Practice with different comparison operators');
        break;
      case 'loops':
        suggestions.push('Experiment with different range values');
        break;
      case 'functions':
        suggestions.push('Try creating functions with parameters');
        break;
      default:
        suggestions.push('Start with simple print statements');
    }

    const confidence = Math.min(maxScore / 10, 1); // Normalize confidence
    
    // Update context with detected topic
    this.context.currentTopic = bestTopic;
    this.context.codeEditorContent = editorContent;

    return { topic: bestTopic, confidence, suggestions };
  }

  setLessonContext(topic: string, objective?: string, lessonName?: string): void {
    this.context.currentTopic = topic;
    this.context.currentLesson = lessonName;
    this.context.lessonObjective = objective;
    
    console.log(`Lesson context set: ${topic}`, objective ? `Objective: ${objective}` : '');
  }

  // Get topic-specific welcome message for Ada Teacher
  getTopicWelcomeContext(): string {
    const topic = this.context.currentTopic;
    const topicMessages = {
      'variables': 'Öğrenci değişkenlerle çalışıyor. Variables (değişkenler) konusunda yardım edebilirsin.',
      'input_output': 'Öğrenci input ve output işlemleriyle çalışıyor. Kullanıcıdan veri alma ve ekrana yazdırma konusunda yardım et.',
      'conditionals': 'Öğrenci koşullu ifadelerle (if/else) çalışıyor. Karar verme yapıları konusunda rehberlik et.',
      'loops': 'Öğrenci döngülerle (for/while) çalışıyor. Tekrarlayan işlemler konusunda yardım et.',
      'lists': 'Öğrenci listelerle çalışıyor. Liste işlemleri ve veri saklama konusunda rehberlik et.',
      'functions': 'Öğrenci fonksiyonlarla çalışıyor. Kod organizasyonu ve yeniden kullanım konusunda yardım et.',
      'strings': 'Öğrenci stringlerle (metin) çalışıyor. Metin işleme konusunda rehberlik et.',
      'math': 'Öğrenci matematiksel işlemlerle çalışıyor. Sayısal hesaplamalar konusunda yardım et.',
      'basics': 'Öğrenci Python\'a yeni başlıyor. Temel kavramları öğretmeye odaklan.'
    };

    return topicMessages[topic as keyof typeof topicMessages] || topicMessages.basics;
  }
}