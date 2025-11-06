'use client';

import { useContext } from 'react';
import { FirebaseContext, type UserHookResult } from '@/firebase/provider';

/**
 * Hook specifically for accessing the authenticated user's state.
 * This provides the User object, loading status, and any auth errors.
 * @returns {UserHookResult} Object with user, isUserLoading, userError.
 */
export const useUser = (): UserHookResult => {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    // This might happen if used outside the provider, so we return a "loading" state.
    return { user: null, isUserLoading: true, userError: null };
  }
  const { user, isUserLoading, userError } = context; 
  return { user, isUserLoading, userError };
};
