import React, { createContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { registerPushToken } from '../utils/pushNotifications';

export const AuthContext = createContext(null);

// Ensure a public.users row exists for the auth user (handles users
// created before the on_auth_user_created trigger was in place).
async function ensurePublicUser(authUser) {
  if (!authUser) return;
  const name = authUser.user_metadata?.name || authUser.email?.split('@')[0] || '';
  await supabase.from('users').upsert(
    { id: authUser.id, name, email: authUser.email || '' },
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

  return (
    <AuthContext.Provider
      value={{ user, session, loading, signIn, signUp, signOut, resetPassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}
