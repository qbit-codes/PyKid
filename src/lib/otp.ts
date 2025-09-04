import crypto from 'crypto';
import { statements, cleanupDatabase } from './db.js';
import { IletiMerkeziClient } from '@iletimerkezi/iletimerkezi-node';
import { env } from '$env/dynamic/private';

export interface OTPResult {
  success: boolean;
  message: string;
  data?: any;
}

export interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  send_otp: { maxAttempts: 3, windowMs: 5 * 60 * 1000 }, // 3 attempts per 5 minutes
  verify_otp: { maxAttempts: 5, windowMs: 15 * 60 * 1000 } // 5 attempts per 15 minutes
};

function generateOTP(): string {
  // Generate a cryptographically secure 6-digit OTP
  const buffer = crypto.randomBytes(3);
  const num = buffer.readUIntBE(0, 3);
  return String(num % 1000000).padStart(6, '0');
}

function normalizePhoneNumber(phone: string): string {
  // Remove all non-digits and ensure it starts with country code
  const digits = phone.replace(/\D/g, '');
  
  // If it's a Turkish number starting with 5, add country code
  if (digits.length === 10 && digits.startsWith('5')) {
    return '90' + digits;
  }
  
  // If it already has country code
  if (digits.length === 12 && digits.startsWith('90')) {
    return digits;
  }
  
  throw new Error('Invalid phone number format');
}

function checkRateLimit(phoneNumber: string, requestType: string): boolean {
  const config = RATE_LIMITS[requestType];
  if (!config) return true;

  const now = Date.now();
  const windowStart = Math.floor(now / config.windowMs) * config.windowMs;

  // Upsert rate limit record
  statements.upsertRateLimit.run(phoneNumber, requestType, windowStart);
  
  // Check current count
  const rateLimit = statements.getRateLimit.get(phoneNumber, requestType, windowStart) as any;
  
  return rateLimit ? rateLimit.request_count <= config.maxAttempts : true;
}

async function sendSMS(phoneNumber: string, message: string): Promise<{ success: boolean; message: string }> {
  try {
    // Check if SMS credentials are configured
    const apiKey = env.ILETIMERKEZI_API_KEY;
    const apiHash = env.ILETIMERKEZI_API_HASH;
    const sender = env.ILETIMERKEZI_SENDER;
    
    if (!apiKey || !apiHash) {
      console.warn('İletimerkezi SMS credentials not configured');
      return {
        success: false,
        message: 'SMS servisi yapılandırılmamış'
      };
    }

    if (!sender) {
      console.warn('Iletimerkezi SENDER not configured');
      return {
        success: false,
        message: 'SMS servisi yapılandırılmamış'
      };
    }

    const client = new IletiMerkeziClient(apiKey, apiHash, sender);
    
    // İletimerkezi expects Turkish numbers without country code (5051234567 format)
    const smsPhoneNumber = phoneNumber.startsWith('90') ? phoneNumber.substring(2) : phoneNumber;
    
    const result = await client.sms().disableIysConsent().send(smsPhoneNumber, message);

    // Check if SMS was sent successfully
    if (result.statusCode === 200 && result.data?.status?.code === 200) {
      return {
        success: true,
        message: 'SMS gönderildi'
      };
    } else {
      console.error('SMS sending failed:', result);
      return {
        success: false,
        message: `SMS gönderilemedi: ${result.data?.status?.message || 'Bilinmeyen hata'}`
      };
    }

  } catch (error: any) {
    console.error('SMS sending error:', error);
    return {
      success: false,
      message: 'SMS gönderilemedi: ' + error.message
    };
  }
}

export async function sendOTP(name: string, phoneNumber: string): Promise<OTPResult> {
  try {
    // Clean up old records periodically
    if (Math.random() < 0.1) {
      cleanupDatabase();
    }

    // Normalize phone number
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    
    // Check rate limiting
    if (!checkRateLimit(normalizedPhone, 'send_otp')) {
      return {
        success: false,
        message: 'Çok fazla deneme yaptınız. Lütfen 5 dakika sonra tekrar deneyin.'
      };
    }

    // Check if there's a recent valid OTP
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    const recentOTPs = statements.getRecentOTPs.all(normalizedPhone, fiveMinutesAgo) as any[];
    
    const validRecentOTP = recentOTPs.find(otp => 
      otp.expires_at > Date.now() && !otp.is_used
    );

    if (validRecentOTP) {
      return {
        success: false,
        message: 'Zaten aktif bir doğrulama kodunuz var. Lütfen bekleyin veya mevcut kodu kullanın.'
      };
    }

    // Generate new OTP
    const otpCode = generateOTP();
    const now = Date.now();
    const expiresAt = now + (10 * 60 * 1000); // 10 minutes expiry

    // Save to database
    statements.insertOTP.run(normalizedPhone, name.trim(), otpCode, now, expiresAt);

    // Send SMS with OTP
    const smsMessage = `PyKid doğrulama kodunuz: ${otpCode}\n\nKod 10 dakika geçerlidir. Kodu kimseyle paylaşmayın.`;
    
    const smsResult = await sendSMS(normalizedPhone, smsMessage);
    
    // In development, always log the OTP
    if (env.NODE_ENV === 'development') {
      console.log(`[DEV] OTP Code for ${name} (${normalizedPhone}): ${otpCode}`);
    }
    
    // If SMS sending fails in production, we might still want to continue
    if (!smsResult.success && env.NODE_ENV === 'production') {
      console.error('SMS sending failed but OTP saved to database');
      return {
        success: false,
        message: 'SMS gönderilemedi. Lütfen daha sonra tekrar deneyin.'
      };
    }

    return {
      success: true,
      message: 'Doğrulama kodu gönderildi.',
      data: {
        phoneNumber: normalizedPhone,
        expiresAt
      }
    };

  } catch (error: any) {
    console.error('Error sending OTP:', error);
    return {
      success: false,
      message: error.message || 'Doğrulama kodu gönderilemedi. Lütfen tekrar deneyin.'
    };
  }
}

export async function verifyOTP(phoneNumber: string, otpCode: string): Promise<OTPResult> {
  try {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    
    // Check rate limiting
    if (!checkRateLimit(normalizedPhone, 'verify_otp')) {
      return {
        success: false,
        message: 'Çok fazla yanlış deneme. Lütfen 15 dakika sonra tekrar deneyin.'
      };
    }

    const now = Date.now();
    
    // Find valid OTP
    const otpRecord = statements.findValidOTP.get(normalizedPhone, otpCode, now) as any;

    if (!otpRecord) {
      // Increment attempts for any matching OTP
      statements.incrementOTPAttempts.run(normalizedPhone, otpCode);
      
      return {
        success: false,
        message: 'Doğrulama kodu yanlış veya süresi dolmuş.'
      };
    }

    // Check attempt limits (max 3 attempts per OTP)
    if (otpRecord.attempts >= 3) {
      return {
        success: false,
        message: 'Bu doğrulama kodu için çok fazla yanlış deneme yapıldı.'
      };
    }

    // Mark OTP as used
    statements.markOTPAsUsed.run(now, otpRecord.id);

    // Create or update user
    statements.createUser.run(normalizedPhone, otpRecord.name, otpRecord.created_at, now);

    return {
      success: true,
      message: 'Doğrulama başarılı.',
      data: {
        phoneNumber: normalizedPhone,
        name: otpRecord.name,
        userId: otpRecord.id
      }
    };

  } catch (error: any) {
    console.error('Error verifying OTP:', error);
    return {
      success: false,
      message: error.message || 'Doğrulama işlemi başarısız. Lütfen tekrar deneyin.'
    };
  }
}

export function getOTPStatus(phoneNumber: string): any {
  try {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    const recentOTPs = statements.getRecentOTPs.all(normalizedPhone, fiveMinutesAgo) as any[];
    
    const activeOTP = recentOTPs.find(otp => 
      otp.expires_at > Date.now() && !otp.is_used
    );

    return {
      hasActiveOTP: !!activeOTP,
      expiresAt: activeOTP?.expires_at,
      attempts: activeOTP?.attempts || 0
    };
  } catch (error) {
    return { hasActiveOTP: false, expiresAt: null, attempts: 0 };
  }
}
