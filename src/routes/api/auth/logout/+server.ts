import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearAuthCookie } from '$lib/auth';

export const POST: RequestHandler = async (event) => {
  try {
    // Clear the authentication cookie
    clearAuthCookie(event);
    
    return json({ 
      success: true, 
      message: 'Başarıyla çıkış yapıldı.' 
    });
  } catch (error: any) {
    console.error('Logout error:', error);
    return json(
      { 
        success: false, 
        message: 'Çıkış işlemi başarısız.' 
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