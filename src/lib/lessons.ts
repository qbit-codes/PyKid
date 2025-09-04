// src/lib/lessons.ts - Turkish lesson content for PyKid

export interface Exercise {
  id: string;
  title: string;
  description: string;
  starterCode: string;
  solutionCode: string;
  hints: string[];
  validation: {
    expectedOutput?: string[];
    mustContain?: string[];
    mustNotContain?: string[];
    customValidation?: (code: string, output: string) => boolean;
  };
}

export interface LessonStep {
  id: string;
  title: string;
  content: string;
  codeExample?: string;
  exercise?: Exercise;
  videoUrl?: string;
}

export interface Lesson {
  id: string;
  title: string;
  description: string;
  objectives: string[];
  estimatedTime: number; // minutes
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  prerequisites: string[];
  steps: LessonStep[];
  finalProject?: Exercise;
}

export const LESSONS: Lesson[] = [
  {
    id: 'lesson-1',
    title: 'Python Temel Kavramları',
    description: 'Python\'a hoş geldin! Bu derste değişkenler, veri türleri ve temel komutları öğreneceksin.',
    objectives: [
      'Değişken oluşturmayı öğrenmek',
      'Farklı veri türlerini anlamak (metin, sayı)',
      'print() komutuyla ekrana yazı yazdırmak',
      'input() ile kullanıcıdan veri almak',
      'Basit matematik işlemleri yapmak'
    ],
    estimatedTime: 45,
    difficulty: 'beginner',
    prerequisites: [],
    steps: [
      {
        id: 'step-1-1',
        title: 'Python\'a Merhaba De!',
        content: `# 🐍 Python Dünyasına Hoş Geldin!

Python öğrenmeye başlayacağız! İlk önce bilgisayara "Merhaba" diyelim.

**print()** komutu ile ekrana istediğimiz yazıları yazdırabiliriz:`,
        codeExample: `# İlk Python programın!
print("Merhaba Dünya!")
print("Ben Python öğreniyorum!")`,
        exercise: {
          id: 'ex-1-1',
          title: 'İlk Merhaban',
          description: 'Kendi adınla birlikte bir merhaba mesajı yazdır',
          starterCode: `# Buraya kendi adınla merhaba mesajını yaz
`,
          solutionCode: `print("Merhaba, ben Ali!")
print("Python öğrenmeye başladım!")`,
          hints: [
            'print() komutunu kullan',
            'Yazıları tırnak içine al',
            'Kendi adını kullan'
          ],
          validation: {
            mustContain: ['print(', 'merhaba', 'ben'],
            expectedOutput: ['merhaba']
          }
        }
      },
      {
        id: 'step-1-2', 
        title: 'Değişkenler - Bilgileri Saklayalım',
        content: `# 📦 Değişkenler

Değişkenler bilgileri sakladığımız kutular gibidir. İçine istediğimiz veriyi koyabiliriz:

- **Metin** (string): İsim, şehir, mesaj
- **Sayı** (integer): Yaş, not, miktar  
- **Ondalık sayı** (float): Kilo, boy, fiyat`,
        codeExample: `# Değişken örnekleri
isim = "Ahmet"
yas = 12
kilo = 45.5

print("Benim adım", isim)
print("Yaşım", yas)
print("Kilom", kilo)`,
        exercise: {
          id: 'ex-1-2',
          title: 'Kendini Tanıt',
          description: 'Kendi bilgilerinle değişkenler oluştur ve ekrana yazdır',
          starterCode: `# Değişkenlerini oluştur
isim = 
yas = 
sehir = 

# Bilgilerini yazdır
`,
          solutionCode: `isim = "Zeynep"
yas = 11
sehir = "İstanbul"

print("Adım:", isim)
print("Yaşım:", yas)  
print("Şehrim:", sehir)`,
          hints: [
            'Metinleri tırnak içine al',
            'Sayıları tırnak olmadan yaz',
            'print() ile değişkenleri yazdır'
          ],
          validation: {
            mustContain: ['isim =', 'yas =', 'sehir =', 'print('],
            mustNotContain: ['undefined', 'None']
          }
        }
      },
      {
        id: 'step-1-3',
        title: 'Kullanıcıdan Veri Almak',
        content: `# 🎤 Kullanıcıyla Konuşmak

**input()** komutu ile kullanıcıdan veri alabiliriz. Bu sayede programımız interaktif olur!`,
        codeExample: `# Kullanıcı adını öğrenelim
ad = input("Adın ne? ")
print("Merhaba", ad, "!")

# Yaş bilgisi alalım
yas = input("Kaç yaşındasın? ")
print("Vay be,", yas, "yaşındasın!")`,
        exercise: {
          id: 'ex-1-3',
          title: 'Sohbet Programı',
          description: 'Kullanıcıyla sohbet eden bir program yaz',
          starterCode: `# Kullanıcıyla sohbet et
`,
          solutionCode: `ad = input("Adın nedir? ")
favori_renk = input("Favori rengin ne? ")
hobim = input("Hobinin nedir? ")

print("Merhaba", ad, "!")
print("Favori rengin", favori_renk, "çok güzelmiş!")
print(hobim, "yapmayı ben de seviyorum!")`,
          hints: [
            'input() ile soru sor',
            'Cevabı bir değişkende sakla',
            'print() ile cevap ver'
          ],
          validation: {
            mustContain: ['input(', 'print('],
            customValidation: (code: string, output: string) => {
              return code.includes('input(') && code.includes('print(') && code.split('input(').length >= 2;
            }
          }
        }
      },
      {
        id: 'step-1-4',
        title: 'Matematik İşlemleri',
        content: `# 🔢 Python ile Matematik

Python harika bir hesap makinesi! Temel işlemler:

- **Toplama:** +
- **Çıkarma:** -
- **Çarpma:** *
- **Bölme:** /`,
        codeExample: `# Matematik işlemleri
sayi1 = 15
sayi2 = 7

toplam = sayi1 + sayi2
fark = sayi1 - sayi2
carpim = sayi1 * sayi2
bolum = sayi1 / sayi2

print("Toplam:", toplam)
print("Fark:", fark)
print("Çarpım:", carpim)
print("Bölüm:", bolum)`,
        exercise: {
          id: 'ex-1-4',
          title: 'Yaş Hesaplayıcı',
          description: 'Doğum yılını alıp yaşı hesaplayan program yaz',
          starterCode: `# Yaş hesaplayıcı program
`,
          solutionCode: `dogum_yili = input("Doğum yılın nedir? ")
dogum_yili = int(dogum_yili)  # Metni sayıya çeviriyoruz

su_anki_yil = 2024
yas = su_anki_yil - dogum_yili

print("Sen", yas, "yaşındasın!")`,
          hints: [
            'input() ile doğum yılını al',
            'int() ile metni sayıya çevir',
            '2024 - doğum_yılı ile yaşı hesapla'
          ],
          validation: {
            mustContain: ['input(', 'int(', '-', 'print('],
            expectedOutput: ['yaşındasın', 'yaş']
          }
        }
      }
    ],
    finalProject: {
      id: 'project-1',
      title: 'Kişisel Profil Programı',
      description: 'Kullanıcının bilgilerini alıp güzel bir profil kartı oluşturan program',
      starterCode: `# Kişisel Profil Programı
# Kullanıcıdan bilgileri al ve profil kartı oluştur

print("=== KİŞİSEL PROFİL OLUŞTURUCU ===")

`,
      solutionCode: `print("=== KİŞİSEL PROFİL OLUŞTURUCU ===")

# Bilgileri alalım
ad = input("Adın nedir? ")
soyad = input("Soyadın nedir? ")
yas = input("Kaç yaşındasın? ")
sehir = input("Hangi şehirde yaşıyorsun? ")
hobi = input("Favori hobın nedir? ")

# Profil kartını oluşturalım
print()
print("🌟 PROFİL KARTI 🌟")
print("=" * 25)
print("Ad Soyad:", ad, soyad)
print("Yaş:", yas)
print("Şehir:", sehir)
print("Hobi:", hobi)
print("=" * 25)
print("Profilin hazır! 🎉")`,
      hints: [
        'Birden fazla input() kullan',
        'Güzel görünüm için print() ile boş satırlar ekle',
        'Profil kartı için çizgiler kullan',
        'Emoji ekleyerek eğlenceli yap'
      ],
      validation: {
        mustContain: ['input(', 'print(', '==='],
        customValidation: (code: string, output: string) => {
          return code.split('input(').length >= 4 && code.includes('PROFİL');
        }
      }
    }
  },

  {
    id: 'lesson-2',
    title: 'Karar Verme ve Döngüler',
    description: 'Programın kararlar vermesini ve işlemleri tekrarlamasını öğrenelim!',
    objectives: [
      'if/else ile karar verme yapıları',
      'Karşılaştırma operatörlerini kullanma',
      'for döngüsü ile tekrar etme',
      'while döngüsü ile koşullu tekrar',
      'range() fonksiyonunu kullanma'
    ],
    estimatedTime: 60,
    difficulty: 'beginner',
    prerequisites: ['lesson-1'],
    steps: [
      {
        id: 'step-2-1',
        title: 'if/else - Kararlar Vermek',
        content: `# 🤔 Kararlar Vermek

Programlar da bizim gibi kararlar verebilir! **if/else** ile:

- Eğer bir şart sağlanıyorsa → bir şey yap
- Değilse → başka bir şey yap`,
        codeExample: `# Yaş kontrolü
yas = 16

if yas >= 18:
    print("Sen yetişkinsin!")
else:
    print("Sen henüz çocuksun!")
    
# Not değerlendirme
not_puani = 85

if not_puani >= 90:
    print("Harika! AA aldın!")
elif not_puani >= 80:
    print("Çok iyi! BA aldın!")
else:
    print("Daha çok çalışmalısın!")`,
        exercise: {
          id: 'ex-2-1',
          title: 'Hava Durumu Danışmanı',
          description: 'Sıcaklığa göre ne giyileceği öneren program',
          starterCode: `# Hava durumu danışmanı
sicaklik = input("Bugün hava kaç derece? ")
sicaklik = int(sicaklik)

# if/else ile öneri ver
`,
          solutionCode: `sicaklik = input("Bugün hava kaç derece? ")
sicaklik = int(sicaklik)

if sicaklik >= 25:
    print("Hava sıcak! Tişört giy! ☀️")
elif sicaklik >= 15:
    print("Hava ılık! Sweatshirt giy! 🌤️")
else:
    print("Hava soğuk! Mont giy! 🧥")`,
          hints: [
            'int() ile metni sayıya çevir',
            'if/elif/else kullan',
            'Sıcaklık değerlerini karşılaştır'
          ],
          validation: {
            mustContain: ['if', 'elif', 'else', 'int('],
            expectedOutput: ['sıcak', 'soğuk', 'ılık']
          }
        }
      },
      {
        id: 'step-2-2',
        title: 'Karşılaştırma Operatörleri',
        content: `# ⚖️ Karşılaştırmalar

Python'da şartları kontrol etmek için operatörler:

- **==** eşit mi?
- **!=** eşit değil mi?
- **>** büyük mü?
- **<** küçük mü?
- **>=** büyük eşit mi?
- **<=** küçük eşit mi?`,
        codeExample: `# Şifre kontrolü
sifre = input("Şifreyi gir: ")

if sifre == "python123":
    print("Giriş başarılı! 🎉")
else:
    print("Yanlış şifre! ❌")

# Sayı tahmin oyunu
tahmin = int(input("1-10 arası sayı tahmin et: "))
gizli_sayi = 7

if tahmin == gizli_sayi:
    print("Bravo! Doğru tahmin! 🎯")
elif tahmin < gizli_sayi:
    print("Daha büyük bir sayı dene!")
else:
    print("Daha küçük bir sayı dene!")`,
        exercise: {
          id: 'ex-2-2',
          title: 'Kullanıcı Adı Kontrolü',
          description: 'Güçlü kullanıcı adı kontrolü yapan program',
          starterCode: `# Kullanıcı adı kontrolü
kullanici_adi = input("Kullanıcı adın nedir? ")

# Kontrolleri yap
`,
          solutionCode: `kullanici_adi = input("Kullanıcı adın nedir? ")

if len(kullanici_adi) < 3:
    print("Kullanıcı adı çok kısa! En az 3 harf olmalı ❌")
elif len(kullanici_adi) > 15:
    print("Kullanıcı adı çok uzun! En fazla 15 harf olmalı ❌") 
elif kullanici_adi == "admin":
    print("Bu kullanıcı adı yasak! ❌")
else:
    print("Kullanıcı adın uygun! Hoş geldin", kullanici_adi, "! ✅")`,
          hints: [
            'len() ile uzunluk kontrol et',
            'Farklı koşullar için elif kullan',
            'Yasaklı kelime kontrolü ekle'
          ],
          validation: {
            mustContain: ['len(', 'if', 'elif', '<', '>'],
            expectedOutput: ['kullanıcı adı', 'uygun', 'kısa', 'uzun']
          }
        }
      },
      {
        id: 'step-2-3',
        title: 'for Döngüsü - Tekrarlama',
        content: `# 🔄 for Döngüsü

Aynı işi defalarca yapmak için **for döngüsü** kullanırız:

**range()** fonksiyonu ile sayıları sırayla alabiliriz:
- range(5) → 0, 1, 2, 3, 4
- range(1, 6) → 1, 2, 3, 4, 5  
- range(2, 10, 2) → 2, 4, 6, 8`,
        codeExample: `# 1'den 5'e kadar sayma
for sayi in range(1, 6):
    print("Sayı:", sayi)

# Çarpım tablosu
for i in range(1, 11):
    carpim = 7 * i
    print("7 x", i, "=", carpim)

# İsim tekrarlama
ad = "Ahmet"
for i in range(3):
    print("Merhaba", ad)`,
        exercise: {
          id: 'ex-2-3',
          title: 'Yıldız Çizen Program',
          description: 'Kullanıcının istediği kadar yıldız çizen program',
          starterCode: `# Yıldız çizen program
kac_yildiz = input("Kaç yıldız çizmek istiyorsun? ")
kac_yildiz = int(kac_yildiz)

# for döngüsü ile yıldız çiz
`,
          solutionCode: `kac_yildiz = input("Kaç yıldız çizmek istiyorsun? ")
kac_yildiz = int(kac_yildiz)

print("İşte yıldızların:")
for i in range(kac_yildiz):
    print("⭐", end="")
print()  # Satır atlama
print("Toplam", kac_yildiz, "yıldız çizdim!")`,
          hints: [
            'int() ile metni sayıya çevir',
            'for döngüsünde range() kullan',
            'print() ile yıldız karakteri yazdır'
          ],
          validation: {
            mustContain: ['for', 'range(', 'int('],
            expectedOutput: ['yıldız', '⭐']
          }
        }
      },
      {
        id: 'step-2-4',
        title: 'while Döngüsü - Koşullu Tekrar',
        content: `# 🔁 while Döngüsü

**while** döngüsü bir şart sağlandığı sürece çalışır:`,
        codeExample: `# Sayı tahmin oyunu
import random
gizli_sayi = random.randint(1, 10)
tahmin = 0

while tahmin != gizli_sayi:
    tahmin = int(input("1-10 arası sayı tahmin et: "))
    
    if tahmin < gizli_sayi:
        print("Daha büyük dene!")
    elif tahmin > gizli_sayi:
        print("Daha küçük dene!")
    else:
        print("Bravo! Doğru tahmin! 🎉")`,
        exercise: {
          id: 'ex-2-4',
          title: 'Şifre Deneme Sistemi',
          description: 'Doğru şifre girilene kadar soran program',
          starterCode: `# Şifre sistemi
dogru_sifre = "python2024"

# while ile şifre sor
`,
          solutionCode: `dogru_sifre = "python2024"
girilen_sifre = ""

while girilen_sifre != dogru_sifre:
    girilen_sifre = input("Şifreni gir: ")
    
    if girilen_sifre != dogru_sifre:
        print("Yanlış şifre! Tekrar dene... ❌")
    else:
        print("Giriş başarılı! Hoş geldin! ✅")`,
          hints: [
            'while koşulunu doğru kur',
            'Şifreyi kontrol et',
            'Yanlışsa tekrar sor'
          ],
          validation: {
            mustContain: ['while', '!=', 'input('],
            expectedOutput: ['şifre', 'giriş', 'başarılı']
          }
        }
      }
    ],
    finalProject: {
      id: 'project-2',
      title: 'Çarpım Tablosu Öğretmeni',
      description: 'İnteraktif çarpım tablosu öğreten program',
      starterCode: `# Çarpım Tablosu Öğretmeni
print("🔢 ÇARPIM TABLOSU ÖĞRETMENİ 🔢")
print("=" * 30)

`,
      solutionCode: `print("🔢 ÇARPIM TABLOSU ÖĞRETMENİ 🔢")
print("=" * 30)

# Hangi sayının tablosunu öğrenelim?
sayi = int(input("Hangi sayının çarpım tablosunu öğrenmek istiyorsun? "))

print(f"\\n{sayi} sayısının çarpım tablosu:")
print("-" * 20)

# Çarpım tablosunu göster
for i in range(1, 11):
    carpim = sayi * i
    print(f"{sayi} x {i:2d} = {carpim:2d}")

print("\\nŞimdi seni test edeceğim! 🎯")

# Test soruları
dogru_cevap = 0
toplam_soru = 3

for soru_no in range(1, toplam_soru + 1):
    carpan = random.randint(1, 10)
    dogru_sonuc = sayi * carpan
    
    cevap = int(input(f"\\nSoru {soru_no}: {sayi} x {carpan} = ? "))
    
    if cevap == dogru_sonuc:
        print("✅ Doğru! Aferin!")
        dogru_cevap += 1
    else:
        print(f"❌ Yanlış! Doğru cevap: {dogru_sonuc}")

print(f"\\n🎉 Test bitti! {dogru_cevap}/{toplam_soru} doğru yaptın!")

if dogru_cevap == toplam_soru:
    print("Mükemmel! Çarpım tablosunu öğrenmişsin! 🌟")
elif dogru_cevap >= toplam_soru // 2:
    print("İyi iş çıkardın! Biraz daha pratik yapalım! 👍")
else:
    print("Çalışmaya devam et, başarırsın! 💪")`,
      hints: [
        'for döngüsü ile tabloyu yazdır',
        'random ile test soruları oluştur',
        'Doğru cevap sayısını takip et',
        'Son değerlendirme yap'
      ],
      validation: {
        mustContain: ['for', 'range(', 'int(', 'if', 'print('],
        customValidation: (code: string, output: string) => {
          return code.includes('for') && code.includes('range(') && code.includes('çarpım');
        }
      }
    }
  },

  {
    id: 'lesson-3',
    title: 'Fonksiyonlar ve Listeler',
    description: 'Kodları organize etmeyi ve veri koleksiyonlarını yönetmeyi öğrenelim!',
    objectives: [
      'Fonksiyon oluşturma ve çağırma',
      'Parametreli fonksiyonlar',
      'Return ile değer döndürme',
      'Liste oluşturma ve kullanma',
      'Liste metodları (append, remove, len)',
      'Listeler üzerinde döngü kurma'
    ],
    estimatedTime: 75,
    difficulty: 'intermediate', 
    prerequisites: ['lesson-1', 'lesson-2'],
    steps: [
      {
        id: 'step-3-1',
        title: 'Fonksiyonlar - Kod Organizasyonu',
        content: `# 🛠️ Fonksiyonlar

Fonksiyonlar kod parçacıklarını tekrar kullanmamızı sağlar. **def** ile tanımlanır:

Faydaları:
- Aynı kodu tekrar yazmayız
- Kodumuz daha düzenli olur
- Hataları bulmak kolaşır`,
        codeExample: `# Basit fonksiyon
def selamla():
    print("Merhaba!")
    print("Python öğreniyoruz!")

# Fonksiyonu çağırma
selamla()
selamla()  # İstediğimiz kadar çağırabiliriz

# Parametreli fonksiyon
def kisisel_selam(isim):
    print("Merhaba", isim, "!")
    print("Bugün nasılsın?")

kisisel_selam("Ahmet")
kisisel_selam("Ayşe")`,
        exercise: {
          id: 'ex-3-1',
          title: 'Doğum Günü Şarkısı',
          description: 'İsim alıp doğum günü şarkısı söyleyen fonksiyon',
          starterCode: `# Doğum günü şarkısı fonksiyonu
def dogum_gunu_sarkisi():
    # Fonksiyonu buraya yaz
    pass

# Fonksiyonu test et
`,
          solutionCode: `def dogum_gunu_sarkisi(isim):
    print("🎵 Doğum günün kutlu olsun! 🎵")
    print(f"🎵 Doğum günün kutlu olsun {isim}! 🎵")
    print("🎵 Doğum günün kutlu olsun! 🎵")
    print("🎶 Nice mutlu yıllara! 🎶")
    print("🎂🎈🎁")

# Test edelim
dogum_gunu_sarkisi("Zeynep")
print()
dogum_gunu_sarkisi("Mehmet")`,
          hints: [
            'def ile fonksiyon tanımla',
            'Parametre olarak isim al',
            'Şarkı sözlerini yazdır',
            'Emoji kullan'
          ],
          validation: {
            mustContain: ['def', 'doğum', 'kutlu', 'print('],
            expectedOutput: ['doğum günün kutlu', '🎵']
          }
        }
      },
      {
        id: 'step-3-2',
        title: 'Return - Değer Döndürme',
        content: `# ↩️ Return ile Değer Döndürme

Fonksiyonlar hesap yapıp sonucu **return** ile geri verebilir:`,
        codeExample: `# Toplama fonksiyonu
def topla(sayi1, sayi2):
    sonuc = sayi1 + sayi2
    return sonuc

# Fonksiyonu kullanma
toplam = topla(15, 25)
print("Toplam:", toplam)

# Alan hesaplama fonksiyonu
def dikdortgen_alani(uzunluk, genislik):
    alan = uzunluk * genislik
    return alan

def cember_alani(yaricap):
    pi = 3.14159
    alan = pi * yaricap * yaricap
    return alan

# Test edelim
print("Dikdörtgen alanı:", dikdortgen_alani(10, 5))
print("Çember alanı:", cember_alani(7))`,
        exercise: {
          id: 'ex-3-2',
          title: 'Hesap Makinesi Fonksiyonları',
          description: '4 işlem yapan fonksiyonlar oluştur',
          starterCode: `# Hesap makinesi fonksiyonları
def topla(a, b):
    # Toplama fonksiyonu
    pass

def cikar(a, b):
    # Çıkarma fonksiyonu  
    pass

# Diğer fonksiyonları da yaz
`,
          solutionCode: `def topla(a, b):
    return a + b

def cikar(a, b):
    return a - b

def carp(a, b):
    return a * b

def bol(a, b):
    if b != 0:
        return a / b
    else:
        return "Sıfıra bölme hatası!"

# Test edelim
print("15 + 7 =", topla(15, 7))
print("15 - 7 =", cikar(15, 7))  
print("15 × 7 =", carp(15, 7))
print("15 ÷ 7 =", bol(15, 7))
print("15 ÷ 0 =", bol(15, 0))`,
          hints: [
            'Her fonksiyon için return kullan',
            'Bölmede sıfır kontrolü yap',
            'Fonksiyonları test et'
          ],
          validation: {
            mustContain: ['def', 'return', '+', '-', '*', '/'],
            expectedOutput: ['15', '7', '=']
          }
        }
      },
      {
        id: 'step-3-3',
        title: 'Listeler - Veri Koleksiyonları',
        content: `# 📋 Listeler

Listeler birden fazla veriyi saklamak için kullanılır:

**Liste işlemleri:**
- **append()** - eleman ekler
- **remove()** - eleman çıkarır  
- **len()** - uzunluğu verir
- **[0]** - ilk eleman
- **[-1]** - son eleman`,
        codeExample: `# Liste oluşturma
meyveler = ["elma", "armut", "çilek", "muz"]
sayilar = [10, 25, 3, 88, 45]

print("Meyveler:", meyveler)
print("İlk meyve:", meyveler[0])
print("Son meyve:", meyveler[-1])

# Liste işlemleri
meyveler.append("portakal")  # Eleman ekleme
print("Portakal eklendi:", meyveler)

meyveler.remove("armut")  # Eleman çıkarma
print("Armut çıkarıldı:", meyveler)

print("Meyve sayısı:", len(meyveler))

# Liste üzerinde döngü
for meyve in meyveler:
    print("Meyve:", meyve)`,
        exercise: {
          id: 'ex-3-3',
          title: 'Alışveriş Listesi Uygulaması',
          description: 'Alışveriş listesi yönetim sistemi',
          starterCode: `# Alışveriş listesi uygulaması
alisveris_listesi = []

# Fonksiyonları yaz ve menü oluştur
`,
          solutionCode: `alisveris_listesi = []

def urun_ekle(urun):
    alisveris_listesi.append(urun)
    print(f"✅ '{urun}' listeye eklendi!")

def urun_cikar(urun):
    if urun in alisveris_listesi:
        alisveris_listesi.remove(urun)
        print(f"❌ '{urun}' listeden çıkarıldı!")
    else:
        print(f"'{urun}' listede bulunamadı!")

def listeyi_goster():
    print("\\n🛒 ALIŞVERIŞ LİSTESİ:")
    if len(alisveris_listesi) == 0:
        print("Liste boş!")
    else:
        for i, urun in enumerate(alisveris_listesi, 1):
            print(f"{i}. {urun}")

# Test edelim
urun_ekle("süt")
urun_ekle("ekmek") 
urun_ekle("yumurta")
listeyi_goster()

urun_cikar("ekmek")
listeyi_goster()`,
          hints: [
            'Boş liste ile başla',
            'append() ile eleman ekle',
            'remove() ile eleman çıkar',
            'for döngüsü ile listele'
          ],
          validation: {
            mustContain: ['def', 'append(', 'remove(', 'for', 'in'],
            expectedOutput: ['liste', 'eklendi', 'çıkarıldı']
          }
        }
      },
      {
        id: 'step-3-4',
        title: 'Liste ve Fonksiyon Birlikte',
        content: `# 🎯 Listeler ve Fonksiyonlar

Fonksiyonlar listelerle çalışabilir:`,
        codeExample: `# Liste ile çalışan fonksiyonlar
def liste_ozeti(sayilar):
    print("Liste:", sayilar)
    print("Eleman sayısı:", len(sayilar))
    print("En büyük:", max(sayilar))
    print("En küçük:", min(sayilar))
    print("Toplam:", sum(sayilar))
    print("Ortalama:", sum(sayilar) / len(sayilar))

def cift_sayilari_bul(sayilar):
    cift_sayilar = []
    for sayi in sayilar:
        if sayi % 2 == 0:
            cift_sayilar.append(sayi)
    return cift_sayilar

# Test edelim
notlar = [85, 90, 78, 92, 88, 76, 95]
liste_ozeti(notlar)

print("\\nÇift sayılar:", cift_sayilari_bul(notlar))`,
        exercise: {
          id: 'ex-3-4',
          title: 'Öğrenci Not Sistemi',
          description: 'Öğrenci notlarını yöneten kapsamlı sistem',
          starterCode: `# Öğrenci not sistemi
ogrenci_notlari = []

# Fonksiyonları buraya yaz
`,
          solutionCode: `ogrenci_notlari = []

def not_ekle(not_puani):
    if 0 <= not_puani <= 100:
        ogrenci_notlari.append(not_puani)
        print(f"✅ {not_puani} notu eklendi!")
    else:
        print("❌ Not 0-100 arasında olmalı!")

def not_ortalamasi():
    if len(ogrenci_notlari) == 0:
        return "Henüz not girilmedi!"
    return sum(ogrenci_notlari) / len(ogrenci_notlari)

def harf_notu_hesapla(ortalama):
    if ortalama >= 90:
        return "AA"
    elif ortalama >= 80:
        return "BA"  
    elif ortalama >= 70:
        return "BB"
    elif ortalama >= 60:
        return "CB"
    elif ortalama >= 50:
        return "CC"
    else:
        return "FF"

def rapor_olustur():
    print("\\n📊 ÖĞRENCI NOT RAPORU")
    print("=" * 25)
    print("Notlar:", ogrenci_notlari)
    print("Not sayısı:", len(ogrenci_notlari))
    
    if len(ogrenci_notlari) > 0:
        ortalama = not_ortalamasi()
        print(f"Ortalama: {ortalama:.1f}")
        print("Harf notu:", harf_notu_hesapla(ortalama))
        print("En yüksek not:", max(ogrenci_notlari))
        print("En düşük not:", min(ogrenci_notlari))

# Test edelim
not_ekle(85)
not_ekle(92)
not_ekle(78)
not_ekle(88)
rapor_olustur()`,
          hints: [
            'Not girişinde 0-100 aralığı kontrol et',
            'Ortalama için sum() ve len() kullan',
            'Harf notunu if/elif ile belirle',
            'max() ve min() fonksiyonları kullan'
          ],
          validation: {
            mustContain: ['def', 'sum(', 'len(', 'max(', 'min(', 'if'],
            customValidation: (code: string, output: string) => {
              return code.includes('ortalama') && code.includes('append(') && code.split('def').length >= 3;
            }
          }
        }
      }
    ],
    finalProject: {
      id: 'project-3',
      title: 'Kişisel Finans Takip Sistemi',
      description: 'Gelir/gider takibi yapan kapsamlı program',
      starterCode: `# Kişisel Finans Takip Sistemi
print("💰 KİŞİSEL FİNANS TAKİP SİSTEMİ 💰")
print("=" * 35)

gelirler = []
giderler = []

# Fonksiyonları buraya yaz
`,
      solutionCode: `print("💰 KİŞİSEL FİNANS TAKİP SİSTEMİ 💰")
print("=" * 35)

gelirler = []
giderler = []

def gelir_ekle(miktar, aciklama=""):
    gelirler.append({"miktar": miktar, "aciklama": aciklama})
    print(f"✅ {miktar} TL gelir eklendi! ({aciklama})")

def gider_ekle(miktar, aciklama=""):
    giderler.append({"miktar": miktar, "aciklama": aciklama})
    print(f"❌ {miktar} TL gider eklendi! ({aciklama})")

def toplam_gelir():
    return sum(item["miktar"] for item in gelirler)

def toplam_gider():
    return sum(item["miktar"] for item in giderler)

def net_durum():
    return toplam_gelir() - toplam_gider()

def finansal_rapor():
    print("\\n📊 FİNANSAL RAPOR")
    print("=" * 20)
    
    print("\\n💚 GELİRLER:")
    if len(gelirler) == 0:
        print("Henüz gelir kaydı yok")
    else:
        for i, gelir in enumerate(gelirler, 1):
            print(f"{i}. {gelir['miktar']} TL - {gelir['aciklama']}")
    
    print("\\n❤️ GİDERLER:")  
    if len(giderler) == 0:
        print("Henüz gider kaydı yok")
    else:
        for i, gider in enumerate(giderler, 1):
            print(f"{i}. {gider['miktar']} TL - {gider['aciklama']}")
    
    print("\\n💰 ÖZET:")
    print(f"Toplam Gelir: {toplam_gelir()} TL")
    print(f"Toplam Gider: {toplam_gider()} TL")
    net = net_durum()
    print(f"Net Durum: {net} TL", end="")
    
    if net > 0:
        print(" 🎉 (Artı)")
    elif net < 0:
        print(" 😰 (Eksi)")
    else:
        print(" 😐 (Sıfır)")

def butce_onerileri():
    net = net_durum()
    toplam_gdr = toplam_gider()
    
    print("\\n💡 BÜTÇE ÖNERİLERİ:")
    
    if net < 0:
        print("⚠️ Giderleriniz gelirlerinizden fazla!")
        print("🔸 Gereksiz harcamaları azaltın")
        print("🔸 Ek gelir kaynakları arayın")
    elif net > toplam_gdr * 0.2:
        print("🎉 Harika! Güzel tasarruf yapıyorsunuz!")
        print("🔸 Tasarruflarınızı değerlendirin")
    else:
        print("👍 Dengeli bir bütçe yönetiyorsunuz")
        print("🔸 Tasarruf miktarını artırmaya çalışın")

# Test verisi
gelir_ekle(3000, "Maaş")
gelir_ekle(500, "Freelance iş")
gider_ekle(1200, "Kira")
gider_ekle(800, "Market")
gider_ekle(300, "Ulaşım")
gider_ekle(200, "Eğlence")

finansal_rapor()
butce_onerileri()`,
      hints: [
        'Dictionary yapısı kullan ({"miktar": ..., "aciklama": ...})',
        'sum() ile liste toplamları al',
        'enumerate() ile numaralı listeleme',
        'Net durum = gelir - gider',
        'Koşullara göre öneriler ver'
      ],
      validation: {
        mustContain: ['def', 'sum(', 'for', 'in', 'if', 'elif', 'print('],
        customValidation: (code: string, output: string) => {
          return code.includes('gelir') && code.includes('gider') && 
                 code.includes('toplam') && code.split('def').length >= 5;
        }
      }
    }
  }
];

// Lesson progress tracking helpers
export function getLessonById(id: string): Lesson | undefined {
  return LESSONS.find(lesson => lesson.id === id);
}

export function getStepById(lessonId: string, stepId: string): LessonStep | undefined {
  const lesson = getLessonById(lessonId);
  return lesson?.steps.find(step => step.id === stepId);
}

export function getExerciseById(lessonId: string, stepId: string, exerciseId: string): Exercise | undefined {
  const step = getStepById(lessonId, stepId);
  return step?.exercise?.id === exerciseId ? step.exercise : undefined;
}

export function getNextStep(lessonId: string, currentStepId: string): LessonStep | null {
  const lesson = getLessonById(lessonId);
  if (!lesson) return null;
  
  const currentIndex = lesson.steps.findIndex(step => step.id === currentStepId);
  if (currentIndex === -1 || currentIndex >= lesson.steps.length - 1) return null;
  
  return lesson.steps[currentIndex + 1];
}

export function getNextLesson(currentLessonId: string): Lesson | null {
  const currentIndex = LESSONS.findIndex(lesson => lesson.id === currentLessonId);
  if (currentIndex === -1 || currentIndex >= LESSONS.length - 1) return null;
  
  return LESSONS[currentIndex + 1];
}

export function isLessonCompleted(lessonId: string): boolean {
  const completedLessons = JSON.parse(localStorage.getItem('pykid:completedLessons') || '[]');
  return completedLessons.includes(lessonId);
}

export function markLessonCompleted(lessonId: string): void {
  const completedLessons = JSON.parse(localStorage.getItem('pykid:completedLessons') || '[]');
  if (!completedLessons.includes(lessonId)) {
    completedLessons.push(lessonId);
    localStorage.setItem('pykid:completedLessons', JSON.stringify(completedLessons));
  }
}

export function isStepCompleted(lessonId: string, stepId: string): boolean {
  const completedSteps = JSON.parse(localStorage.getItem('pykid:completedSteps') || '[]');
  return completedSteps.includes(`${lessonId}:${stepId}`);
}

export function markStepCompleted(lessonId: string, stepId: string): void {
  const completedSteps = JSON.parse(localStorage.getItem('pykid:completedSteps') || '[]');
  const stepKey = `${lessonId}:${stepId}`;
  if (!completedSteps.includes(stepKey)) {
    completedSteps.push(stepKey);
    localStorage.setItem('pykid:completedSteps', JSON.stringify(completedSteps));
  }
}