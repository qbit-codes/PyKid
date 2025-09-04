import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sendOTP } from '$lib/otp';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const { name, phoneNumber } = body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return json(
        { 
          success: false, 
          message: 'İsim en az 2 karakter olmalı.' 
        },
        { status: 400 }
      );
    }

    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return json(
        { 
          success: false, 
          message: 'Telefon numarası gerekli.' 
        },
        { status: 400 }
      );
    }

    // Validate Turkish phone number format
    const phoneRegex = /^5\d{9}$/;
    const cleanPhone = phoneNumber.replace(/\s/g, '');
    if (!phoneRegex.test(cleanPhone)) {
      return json(
        { 
          success: false, 
          message: 'Geçerli bir telefon numarası girin (5XX XXX XX XX).' 
        },
        { status: 400 }
      );
    }

    // Send OTP
    const result = await sendOTP(name.trim(), cleanPhone);
    
    return json(result, { 
      status: result.success ? 200 : 429 
    });

  } catch (error: any) {
    console.error('Send OTP error:', error);
    return json(
      { 
        success: false, 
        message: 'Sunucu hatası. Lütfen tekrar deneyin.' 
      },
      { status: 500 }
    );
  }
};

export const OPTIONS: RequestHandler = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
};