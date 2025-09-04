import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyOTP } from '$lib/otp';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '$env/static/private';

export const POST: RequestHandler = async ({ request, cookies }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const { phoneNumber, otpCode } = body;

    // Validation
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return json(
        { 
          success: false, 
          message: 'Telefon numarası gerekli.' 
        },
        { status: 400 }
      );
    }

    if (!otpCode || typeof otpCode !== 'string' || otpCode.length !== 6) {
      return json(
        { 
          success: false, 
          message: 'Doğrulama kodu 6 haneli olmalı.' 
        },
        { status: 400 }
      );
    }

    // Verify OTP
    const result = await verifyOTP(phoneNumber, otpCode);
    
    if (result.success && result.data) {
      // Create JWT token
      let token = '';
      try {
        token = jwt.sign(
          {
            phoneNumber: result.data.phoneNumber,
            name: result.data.name,
            userId: result.data.userId,
            loginTime: Date.now()
          },
          JWT_SECRET || 'dev-secret-key',
          { expiresIn: '30d' }
        );
      } catch (jwtError) {
        console.error('JWT creation error:', jwtError);
        // Continue without JWT in development
        if (process.env.NODE_ENV === 'development') {
          console.warn('JWT_SECRET not set, continuing without token in development');
        } else {
          return json(
            { success: false, message: 'Oturum oluşturulamadı.' },
            { status: 500 }
          );
        }
      }

      // Set secure HTTP-only cookie
      if (token) {
        cookies.set('auth-token', token, {
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 30 // 30 days
        });
      }

      return json({
        ...result,
        data: {
          ...result.data,
          token: token || undefined
        }
      });
    }
    
    return json(result, { 
      status: result.success ? 200 : 400 
    });

  } catch (error: any) {
    console.error('Verify OTP error:', error);
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
