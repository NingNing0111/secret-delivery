'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function SecretViewer({ content, expiresAt }: { content: string; expiresAt: string | null }) {
  const [message, setMessage] = useState('');

  async function copy() {
    try {
      await navigator.clipboard.writeText(content);
      setMessage('已复制');
    } catch {
      setMessage('复制失败，请选中上方内容手动复制');
    }
  }

  return (
    <section className="min-w-0 space-y-6">
      <div className="text-center space-y-1 border-b border-slate-100 pb-4">
        <div className="w-10 h-10 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-lg mb-2">
          ✓
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mb-0">商品提取成功</h1>
        <p className="text-xs text-slate-500">您的卡密/虚拟商品凭据如下，请妥善保存</p>
      </div>

      <div className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          商品内容
        </h2>
        <div className="relative">
          <pre
            data-testid="secret-content"
            tabIndex={0}
            className="max-w-full whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-900 p-4 sm:p-5 font-mono text-sm leading-relaxed text-emerald-300 [overflow-wrap:anywhere] shadow-inner select-all focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {content}
          </pre>
        </div>
      </div>

      <div className="space-y-3 pt-2">
        <Button onClick={copy} size="lg" className="w-full font-medium">
          一键复制全部内容
        </Button>
        {message && (
          <p
            role="status"
            className="text-center text-sm font-medium text-emerald-600 bg-emerald-50 py-1.5 rounded-lg border border-emerald-100 animate-in fade-in-50"
          >
            {message}
          </p>
        )}
      </div>

      <div className="pt-2 border-t border-slate-100 text-center">
        <p className="text-xs text-slate-400">
          {expiresAt
            ? `本链接将在 ${expiresAt.replace('T', ' ').replace('.000Z', ' UTC')} 过期`
            : '本链接长期有效'}
        </p>
      </div>
    </section>
  );
}
