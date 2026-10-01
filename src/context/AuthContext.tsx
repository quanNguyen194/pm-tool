import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, describeError } from '../lib/supabase';
import { Profile, mapProfile } from '../api/mappers';

interface AuthContextType {
  session: Session | null;
  profile: Profile | null;
  /** Đang khôi phục phiên đăng nhập / tải hồ sơ. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  /** Trả về `needsConfirm: true` khi dự án Supabase đang bật xác nhận email. */
  signUp: (
    email: string,
    password: string,
    name: string
  ) => Promise<{ error: string | null; needsConfirm: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    // Trigger tạo profile chạy ngay khi đăng ký, nhưng thử lại vài lần phòng trường hợp trễ.
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (data) {
        setProfile(mapProfile(data));
        return;
      }
      await new Promise(r => setTimeout(r, 400));
    }
    setProfile(null);
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session) await loadProfile(data.session.user.id);
      if (active) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        setProfile(null);
        return;
      }
      // Không await trực tiếp trong callback để tránh deadlock với client auth.
      setTimeout(() => {
        void loadProfile(next.user.id);
      }, 0);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (!error) return null;
    if (/Invalid login credentials/i.test(error.message)) return 'Email hoặc mật khẩu không đúng.';
    if (/Email not confirmed/i.test(error.message)) return 'Email chưa được xác nhận. Hãy kiểm tra hộp thư.';
    return describeError(error);
  };

  const signUp = async (email: string, password: string, name: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name.trim() } }
    });
    if (error) {
      if (/already registered/i.test(error.message)) {
        return { error: 'Email này đã được đăng ký. Hãy đăng nhập.', needsConfirm: false };
      }
      if (/at least \d+ characters/i.test(error.message)) {
        return { error: 'Mật khẩu quá ngắn (tối thiểu 6 ký tự).', needsConfirm: false };
      }
      return { error: describeError(error), needsConfirm: false };
    }
    return { error: null, needsConfirm: !data.session };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, profile, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
