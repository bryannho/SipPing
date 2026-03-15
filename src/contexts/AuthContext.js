import React, { createContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { registerPushToken } from '../utils/pushNotifications';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

export const AuthContext = createContext(null);

// Configure Google Sign-In
GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
});

// Ensure a public.users row exists for the auth user (handles users
// created before the on_auth_user_created trigger was in place).
async function ensurePublicUser(authUser) {
  if (!authUser) return;
  const meta = authUser.user_metadata || {};
  const name = meta.full_name || meta.name || authUser.email?.split('@')[0] || '';
  const avatarUrl = meta.avatar_url || meta.picture || null;

  const upsertData = {
    id: authUser.id,
    name,
    email: authUser.email || '',
  };
  if (avatarUrl) {
    upsertData.avatar_url = avatarUrl;
  }

  await supabase.from('users').upsert(
    upsertData,
    { onConflict: 'id', ignoreDuplicates: true }
  );
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      if (currentSession?.user) {
        ensurePublicUser(currentSession.user);
        registerPushToken(currentSession.user.id);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        if (newSession?.user) {
          ensurePublicUser(newSession.user);
          registerPushToken(newSession.user.id);
        }
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  };

  const signUp = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    return { data, error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  const resetPassword = async (email) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email);
    return { data, error };
  };

  const signInWithGoogle = async () => {
    try {
      await GoogleSignin.hasPlayServices();
      const signInResult = await GoogleSignin.signIn();
      const idToken = signInResult.data?.idToken;

      if (!idToken) {
        throw new Error('No ID token received from Google');
      }

      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });

      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  };

  const updateProfile = async ({ name, avatar_url }) => {
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (avatar_url !== undefined) updates.avatar_url = avatar_url;

    const { error: dbError } = await supabase
      .from('users')
      .update(updates)
      .eq('id', user.id);

    if (dbError) return { error: dbError };

    // Sync auth user_metadata so it stays consistent
    const metaUpdates = {};
    if (name !== undefined) metaUpdates.name = name;
    if (avatar_url !== undefined) metaUpdates.avatar_url = avatar_url;

    const { data, error: authError } = await supabase.auth.updateUser({
      data: metaUpdates,
    });

    if (data?.user) setUser(data.user);

    return { error: authError };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signIn,
        signUp,
        signOut,
        resetPassword,
        signInWithGoogle,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
