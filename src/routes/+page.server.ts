import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getSessionFromRequest } from '$lib/auth';

export const load: PageServerLoad = async (event) => {
  const authResult = getSessionFromRequest(event);
  
  // If user is not authenticated, redirect to login
  if (!authResult.isAuthenticated) {
    throw redirect(302, '/login');
  }

  // Return user data to the page
  return {
    user: authResult.user
  };
};