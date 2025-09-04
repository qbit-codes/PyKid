import jwt from 'jsonwebtoken';
import type { RequestEvent } from '@sveltejs/kit';
import { JWT_SECRET } from '$env/static/private';

export interface UserSession {
  phoneNumber: string;
  name: string;
  userId: number;
  loginTime: number;
}

export interface AuthResult {
  isAuthenticated: boolean;
  user?: UserSession;
  error?: string;
}

export function verifyToken(token: string): AuthResult {
  try {
    if (!token) {
      return { isAuthenticated: false, error: 'No token provided' };
    }

    const decoded = jwt.verify(token, JWT_SECRET || 'dev-secret-key') as UserSession;
    
    // Check if token is expired (additional safety check)
    const now = Date.now();
    const tokenAge = now - decoded.loginTime;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    
    if (tokenAge > thirtyDaysMs) {
      return { isAuthenticated: false, error: 'Token expired' };
    }

    return {
      isAuthenticated: true,
      user: decoded
    };
  } catch (error: any) {
    console.error('Token verification failed:', error.message);
    return {
      isAuthenticated: false,
      error: error.message || 'Invalid token'
    };
  }
}

export function getSessionFromRequest(event: RequestEvent): AuthResult {
  try {
    // Try to get token from HTTP-only cookie first
    const cookieToken = event.cookies.get('auth-token');
    if (cookieToken) {
      return verifyToken(cookieToken);
    }

    // Fallback to Authorization header for API requests
    const authHeader = event.request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      return verifyToken(token);
    }

    return { isAuthenticated: false, error: 'No authentication token found' };
  } catch (error: any) {
    console.error('Session extraction failed:', error);
    return { isAuthenticated: false, error: 'Authentication failed' };
  }
}

export function clearAuthCookie(event: RequestEvent) {
  event.cookies.delete('auth-token', {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  });
}