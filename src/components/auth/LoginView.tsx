import React, { useState } from 'react';
import { Loader2, LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const LoginView: React.FC = () => {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        const err = await signIn(email, password);
        if (err) setError(err);
      } else {
        const res = await signUp(email, password, name);
        if (res.error) setError(res.error);
        else if (res.needsConfirm) {
          setInfo('Đăng ký thành công. Hãy mở email để xác nhận tài khoản rồi quay lại đăng nhập.');
          setMode('login');
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <div className="w-10 h-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold">
            PM
          </div>
          <div>
            <div className="text-base font-bold text-slate-900 tracking-wide">OMNIPROJECT</div>
            <div className="text-[10px] text-slate-500 tracking-wider uppercase font-mono">Quản Trị Dự Án & QA</div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
          <h1 className="text-base font-bold text-slate-900">
            {mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
          </h1>
          <p className="text-xs text-slate-500 mt-1 mb-5">
            {mode === 'login'
              ? 'Đăng nhập để xem các dự án bạn tham gia.'
              : 'Tài khoản mới chỉ thấy các dự án mà quản trị viên hoặc PM thêm bạn vào.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="name">
                  Họ và tên
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoComplete="name"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-indigo-500"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="password">
                Mật khẩu
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-indigo-500"
              />
            </div>

            {error && (
              <div role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
            {info && (
              <div role="status" className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                {info}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg transition-colors"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : mode === 'login' ? (
                <LogIn className="w-4 h-4" />
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
              <span>{mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}</span>
            </button>
          </form>

          <div className="mt-4 text-center text-xs text-slate-500">
            {mode === 'login' ? 'Chưa có tài khoản?' : 'Đã có tài khoản?'}{' '}
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError(null);
                setInfo(null);
              }}
              className="font-semibold text-indigo-600 hover:text-indigo-800"
            >
              {mode === 'login' ? 'Đăng ký' : 'Đăng nhập'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
