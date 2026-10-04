'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function LoginForm() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="panel stack shadow-lg border-slate-200"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError('');
        const password = new FormData(event.currentTarget).get('password');
        try {
          const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }),
          });
          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
          }
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Auth boundary must discard cached client/RSC state.
          window.location.assign('/admin');
        } catch (error) {
          setError(error instanceof Error ? error.message : '登录失败');
          setBusy(false);
        }
      }}
    >
      <div className="space-y-1.5">
        <label htmlFor="admin-password-input" className="text-sm font-semibold text-slate-900">
          管理员密码
        </label>
        <input
          id="admin-password-input"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="请输入系统管理密码"
          required
          disabled={busy}
          className="w-full text-base sm:text-sm"
        />
      </div>

      <Button disabled={busy} size="lg" className="w-full mt-2 font-medium">
        {busy ? '登录中…' : '登录'}
      </Button>

      {error && <p role="alert" className="text-sm">{error}</p>}
    </form>
  );
}

export function LogoutButton() {
  const [error, setError] = useState('');

  return (
    <div className="inline-flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        className="text-slate-600 hover:text-slate-900 text-xs font-normal"
        onClick={async () => {
          try {
            const response = await fetch('/api/admin/logout', { method: 'POST' });
            if (!response.ok) throw new Error();
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Discard revealed secrets and authenticated client state on logout.
            window.location.assign('/admin/login');
          } catch {
            setError('退出失败，请重试');
          }
        }}
      >
        退出登录
      </Button>
      {error && <span role="alert" className="text-xs text-rose-600">{error}</span>}
    </div>
  );
}
