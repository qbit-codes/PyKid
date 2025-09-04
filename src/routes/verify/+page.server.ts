import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getSessionFromRequest } from '$lib/auth';

export const load: PageServerLoad = async (event) => {
  const authResult = getSessionFromRequest(event);
  
  // If user is already authenticated, redirect to main page
  if (authResult.isAuthenticated) {
    throw redirect(302, '/');
  }

  return {};
};