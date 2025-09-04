<script lang="ts">
  import { goto } from '$app/navigation';
  
  let name = '';
  let phoneNumber = '';
  let isLoading = false;
  let errors: { name?: string; phone?: string } = {};

  function validateForm() {
    errors = {};
    
    if (!name.trim()) {
      errors.name = 'İsim gerekli';
    } else if (name.trim().length < 2) {
      errors.name = 'İsim en az 2 karakter olmalı';
    }

    if (!phoneNumber.trim()) {
      errors.phone = 'Telefon numarası gerekli';
    } else {
      // Turkish phone number validation (5XX XXX XX XX format)
      const phoneRegex = /^5\d{9}$/;
      const cleanPhone = phoneNumber.replace(/\s/g, '');
      if (!phoneRegex.test(cleanPhone)) {
        errors.phone = 'Geçerli bir telefon numarası girin (5XX XXX XX XX)';
      }
    }

    return Object.keys(errors).length === 0;
  }

  function formatPhoneNumber(value: string) {
    // Remove all non-digits
    const digits = value.replace(/\D/g, '');
    
    // Limit to 10 digits
    const limited = digits.slice(0, 10);
    
    // Format as XXX XXX XX XX
    if (limited.length >= 7) {
      return limited.replace(/(\d{3})(\d{3})(\d{2})(\d{0,2})/, '$1 $2 $3 $4').trim();
    } else if (limited.length >= 6) {
      return limited.replace(/(\d{3})(\d{3})(\d{0,2})/, '$1 $2 $3').trim();
    } else if (limited.length >= 3) {
      return limited.replace(/(\d{3})(\d{0,3})/, '$1 $2').trim();
    }
    
    return limited;
  }

  function handlePhoneInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const formatted = formatPhoneNumber(target.value);
    phoneNumber = formatted;
  }

  async function handleSubmit() {
    if (!validateForm()) return;
    
    isLoading = true;
    errors = {}; // Clear any previous errors
    
    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          phoneNumber: phoneNumber.replace(/\s/g, '')
        })
      });

      const result = await response.json();
      
      if (result.success) {
        // Store phone number for verification page
        localStorage.setItem('pendingPhone', phoneNumber.replace(/\s/g, ''));
        localStorage.setItem('pendingName', name.trim());
        
        // Navigate to verification page
        goto(`/verify?phone=${encodeURIComponent(phoneNumber.replace(/\s/g, ''))}`);
      } else {
        // Show error message
        if (result.message.includes('telefon') || result.message.includes('phone')) {
          errors.phone = result.message;
        } else if (result.message.includes('isim') || result.message.includes('name')) {
          errors.name = result.message;
        } else {
          errors.phone = result.message;
        }
      }
    } catch (error) {
      console.error('Error sending OTP:', error);
      errors.phone = 'Ağ hatası. Lütfen internet bağlantınızı kontrol edin.';
    } finally {
      isLoading = false;
    }
  }
</script>

<style>
  :global(:root){
    --bg: #c9c8c5;
    --text: #0f172a;
    --line: #e8edf5;
    --accent: #6f757e;
    --accent-weak: #eaf2ff;
    --radius: .3rem;
    --glass-bg: rgba(255,255,255,.45);
    --glass-border: rgba(255,255,255,.36);
    --glass-blur: 14px;
  }

  :global(html, body){
    height:100%; margin:0; overflow:hidden; color:var(--text);
    background:
      radial-gradient(1100px 700px at 8% -10%, #99b9da 0%, rgba(207,230,255,0) 40%),
      radial-gradient(900px 700px at 100% -5%, #b8a0a9 0%, rgba(255,228,239,0) 45%),
      var(--bg);
  }
</style>

<div class="min-h-screen flex items-center justify-center p-4">
  <div class="relative w-full max-w-md">
    <!-- Glass card -->
    <div
      class="relative rounded-[var(--radius)] border border-[var(--glass-border)]
             bg-[var(--glass-bg)] shadow-[0_12px_32px_rgba(130,135,146,.15)]
             [backdrop-filter:saturate(160%)_blur(var(--glass-blur))]
             [-webkit-backdrop-filter:saturate(160%)_blur(var(--glass-blur))]
             overflow-hidden p-8"
    >
      <!-- Glass shimmer overlay -->
      <div
        class="pointer-events-none absolute inset-0 [border-radius:inherit] mix-blend-soft-light z-0"
        style="background:
          linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,0) 42%) top/100% 50% no-repeat,
          linear-gradient(0deg,  rgba(0,0,0,.06),       rgba(0,0,0,0) 42%) bottom/100% 50% no-repeat;"
      ></div>
      
      <div class="relative z-[1]">
        <!-- Header -->
        <div class="text-center mb-8">
          <h1 class="text-2xl font-bold text-[var(--text)] mb-2">PyKid'e Hoş Geldin!</h1>
          <p class="text-[var(--accent)] text-sm">
            Giriş yapmak için bilgilerini gir
          </p>
        </div>

        <!-- Form -->
        <form on:submit|preventDefault={handleSubmit} class="space-y-6">
          <!-- Name field -->
          <div>
            <label for="name" class="block text-sm font-medium text-[var(--text)] mb-2">
              İsmin
            </label>
            <input
              id="name"
              type="text"
              bind:value={name}
              disabled={isLoading}
              class="w-full px-4 py-3 rounded-lg border border-[var(--line)] 
                     bg-white/70 backdrop-blur-sm
                     focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent
                     disabled:opacity-50 disabled:cursor-not-allowed
                     text-[var(--text)] placeholder-[var(--accent)]"
              placeholder="Adını yaz..."
              autocomplete="given-name"
            />
            {#if errors.name}
              <p class="mt-1 text-sm text-red-600">{errors.name}</p>
            {/if}
          </div>

          <!-- Phone field -->
          <div>
            <label for="phone" class="block text-sm font-medium text-[var(--text)] mb-2">
              Telefon Numarası
            </label>
            <div class="relative">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span class="text-[var(--accent)] sm:text-sm">+90</span>
              </div>
              <input
                id="phone"
                type="tel"
                bind:value={phoneNumber}
                on:input={handlePhoneInput}
                disabled={isLoading}
                class="w-full pl-12 pr-4 py-3 rounded-lg border border-[var(--line)] 
                       bg-white/70 backdrop-blur-sm
                       focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent
                       disabled:opacity-50 disabled:cursor-not-allowed
                       text-[var(--text)] placeholder-[var(--accent)]"
                placeholder="5XX XXX XX XX"
                autocomplete="tel"
                maxlength="13"
              />
            </div>
            {#if errors.phone}
              <p class="mt-1 text-sm text-red-600">{errors.phone}</p>
            {/if}
          </div>

          <!-- Submit button -->
          <button
            type="submit"
            disabled={isLoading || !name.trim() || !phoneNumber.trim()}
            class="w-full px-4 py-3 rounded-lg bg-[var(--accent)] text-white font-medium
                   shadow-[0_8px_18px_rgba(37,99,235,.28)]
                   hover:bg-[var(--accent)]/90 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-all duration-200"
          >
            {#if isLoading}
              <div class="flex items-center justify-center space-x-2">
                <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>Gönderiliyor...</span>
              </div>
            {:else}
              Doğrulama Kodu Gönder
            {/if}
          </button>
        </form>

        <!-- Footer -->
        <div class="mt-6 text-center">
          <p class="text-xs text-[var(--accent)]">
            Telefonuna bir doğrulama kodu göndereceğiz
          </p>
        </div>
      </div>
    </div>
  </div>
</div>