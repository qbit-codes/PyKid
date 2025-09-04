<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';

  let otpInputs: HTMLInputElement[] = [];
  let otpValues = ['', '', '', '', '', ''];
  let isLoading = false;
  let isResending = false;
  let error = '';
  let resendCooldown = 0;
  let cooldownInterval: number;

  // Get phone number from URL params or localStorage
  $: phoneNumber = $page.url.searchParams.get('phone') || localStorage.getItem('pendingPhone') || '';

  onMount(() => {
    // Focus first input on mount
    if (otpInputs[0]) {
      otpInputs[0].focus();
    }

    // Start cooldown if there's a stored timestamp
    const lastSent = localStorage.getItem('otpLastSent');
    if (lastSent) {
      const elapsed = Date.now() - parseInt(lastSent);
      const remaining = Math.max(0, 60000 - elapsed); // 60 second cooldown
      if (remaining > 0) {
        startCooldown(Math.ceil(remaining / 1000));
      }
    }

    return () => {
      if (cooldownInterval) {
        clearInterval(cooldownInterval);
      }
    };
  });

  function startCooldown(seconds: number) {
    resendCooldown = seconds;
    cooldownInterval = setInterval(() => {
      resendCooldown--;
      if (resendCooldown <= 0) {
        clearInterval(cooldownInterval);
      }
    }, 1000);
  }

  function handleInput(index: number, event: Event) {
    const target = event.target as HTMLInputElement;
    const value = target.value.replace(/\D/g, ''); // Only digits
    
    // Update the value
    otpValues[index] = value;
    
    // Clear error when user starts typing
    if (error) error = '';
    
    // Auto-advance to next input
    if (value && index < 5) {
      otpInputs[index + 1]?.focus();
    }
    
    // Auto-submit when all fields are filled
    if (otpValues.every(v => v !== '') && otpValues.join('').length === 6) {
      handleVerify();
    }
  }

  function handleKeyDown(index: number, event: KeyboardEvent) {
    // Handle backspace
    if (event.key === 'Backspace') {
      if (!otpValues[index] && index > 0) {
        // If current field is empty, move to previous field
        otpInputs[index - 1]?.focus();
      } else {
        // Clear current field
        otpValues[index] = '';
      }
    }
    
    // Handle arrow keys
    if (event.key === 'ArrowLeft' && index > 0) {
      otpInputs[index - 1]?.focus();
    }
    if (event.key === 'ArrowRight' && index < 5) {
      otpInputs[index + 1]?.focus();
    }
    
    // Handle paste
    if (event.key === 'v' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      navigator.clipboard.readText().then(text => {
        const digits = text.replace(/\D/g, '').slice(0, 6);
        for (let i = 0; i < 6; i++) {
          otpValues[i] = digits[i] || '';
        }
        if (digits.length === 6) {
          handleVerify();
        }
      });
    }
  }

  function handlePaste(event: ClipboardEvent) {
    event.preventDefault();
    const paste = event.clipboardData?.getData('text') || '';
    const digits = paste.replace(/\D/g, '').slice(0, 6);
    
    for (let i = 0; i < 6; i++) {
      otpValues[i] = digits[i] || '';
    }
    
    if (digits.length === 6) {
      handleVerify();
    } else if (digits.length > 0) {
      // Focus the next empty field
      const nextEmpty = otpValues.findIndex(v => !v);
      if (nextEmpty !== -1 && nextEmpty < 6) {
        otpInputs[nextEmpty]?.focus();
      }
    }
  }

  async function handleVerify() {
    const otpCode = otpValues.join('');
    if (otpCode.length !== 6) {
      error = 'Lütfen 6 haneli kodu tamamen girin';
      return;
    }

    isLoading = true;
    error = '';

    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumber: phoneNumber,
          otpCode: otpCode
        })
      });

      const result = await response.json();
      
      if (result.success) {
        // Clear stored data
        localStorage.removeItem('pendingPhone');
        localStorage.removeItem('pendingName');
        localStorage.removeItem('otpLastSent');
        
        // Store user info if needed (token is set as HTTP-only cookie)
        if (result.data) {
          localStorage.setItem('user', JSON.stringify({
            name: result.data.name,
            phoneNumber: result.data.phoneNumber
          }));
        }
        
        // Navigate to main app
        goto('/');
      } else {
        error = result.message;
        // Clear inputs and focus first
        otpValues = ['', '', '', '', '', ''];
        otpInputs[0]?.focus();
      }
    } catch (error) {
      console.error('Error verifying OTP:', error);
      error = 'Ağ hatası. Lütfen internet bağlantınızı kontrol edin.';
    } finally {
      isLoading = false;
    }
  }

  async function handleResend() {
    if (resendCooldown > 0 || isResending) return;
    
    isResending = true;
    error = '';

    try {
      // Get stored name for resend
      const storedName = localStorage.getItem('pendingName') || 'Kullanıcı';
      
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: storedName,
          phoneNumber: phoneNumber
        })
      });

      const result = await response.json();
      
      if (result.success) {
        // Start cooldown
        localStorage.setItem('otpLastSent', Date.now().toString());
        startCooldown(60);
        
        // Clear current inputs
        otpValues = ['', '', '', '', '', ''];
        otpInputs[0]?.focus();
        
        // Show success message briefly
        error = 'Yeni kod gönderildi!';
        setTimeout(() => { if (error === 'Yeni kod gönderildi!') error = ''; }, 3000);
      } else {
        error = result.message;
      }
      
    } catch (error) {
      console.error('Error resending OTP:', error);
      error = 'Ağ hatası. Lütfen internet bağlantınızı kontrol edin.';
    } finally {
      isResending = false;
    }
  }

  function formatPhoneForDisplay(phone: string) {
    if (!phone) return '';
    const clean = phone.replace(/\D/g, '');
    if (clean.length === 10) {
      return `+90 ${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6, 8)} ${clean.slice(8)}`;
    }
    return `+90 ${phone}`;
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

  .otp-input {
    transition: all 0.2s ease;
  }
  
  .otp-input:focus {
    transform: scale(1.05);
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
          <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--accent-weak)] flex items-center justify-center">
            <svg class="w-8 h-8 text-[var(--accent)]" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
              <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
            </svg>
          </div>
          <h1 class="text-2xl font-bold text-[var(--text)] mb-2">Doğrulama Kodu</h1>
          <p class="text-[var(--accent)] text-sm">
            {formatPhoneForDisplay(phoneNumber)} numarasına gönderilen<br>
            6 haneli kodu girin
          </p>
        </div>

        <!-- OTP Input -->
        <div class="mb-6">
          <div class="flex justify-center space-x-3 mb-4">
            {#each otpValues as value, index}
              <input
                bind:this={otpInputs[index]}
                bind:value={otpValues[index]}
                on:input={(e) => handleInput(index, e)}
                on:keydown={(e) => handleKeyDown(index, e)}
                on:paste={handlePaste}
                type="text"
                inputmode="numeric"
                maxlength="1"
                disabled={isLoading}
                class="otp-input w-12 h-12 text-center text-lg font-semibold
                       border border-[var(--line)] rounded-lg
                       bg-white/70 backdrop-blur-sm
                       focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent
                       disabled:opacity-50 disabled:cursor-not-allowed
                       text-[var(--text)]"
                aria-label={`Doğrulama kodu ${index + 1}. hane`}
              />
            {/each}
          </div>
          
          {#if error}
            <p class="text-center text-sm" class:text-red-600={!error.includes('gönderildi')} class:text-green-600={error.includes('gönderildi')}>
              {error}
            </p>
          {/if}
        </div>

        <!-- Action Buttons -->
        <div class="space-y-4">
          <!-- Verify Button -->
          <button
            type="button"
            on:click={handleVerify}
            disabled={isLoading || otpValues.some(v => !v)}
            class="w-full px-4 py-3 rounded-lg bg-[var(--accent)] text-white font-medium
                   shadow-[0_8px_18px_rgba(37,99,235,.28)]
                   hover:bg-[var(--accent)]/90 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-all duration-200"
          >
            {#if isLoading}
              <div class="flex items-center justify-center space-x-2">
                <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>Doğrulanıyor...</span>
              </div>
            {:else}
              Doğrula
            {/if}
          </button>

          <!-- Resend Button -->
          <button
            type="button"
            on:click={handleResend}
            disabled={isResending || resendCooldown > 0}
            class="w-full px-4 py-2 rounded-lg border border-[var(--line)] bg-white/50
                   text-[var(--accent)] font-medium hover:bg-white/70
                   focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-all duration-200"
          >
            {#if isResending}
              <div class="flex items-center justify-center space-x-2">
                <div class="w-4 h-4 border-2 border-[var(--accent)]/30 border-t-[var(--accent)] rounded-full animate-spin"></div>
                <span>Gönderiliyor...</span>
              </div>
            {:else if resendCooldown > 0}
              Tekrar gönder ({resendCooldown}s)
            {:else}
              Kodu Tekrar Gönder
            {/if}
          </button>
        </div>

        <!-- Back to Login -->
        <div class="mt-6 text-center">
          <button
            type="button"
            on:click={() => goto('/login')}
            class="text-sm text-[var(--accent)] hover:text-[var(--text)] transition-colors"
          >
            ← Giriş sayfasına dön
          </button>
        </div>
      </div>
    </div>
  </div>
</div>