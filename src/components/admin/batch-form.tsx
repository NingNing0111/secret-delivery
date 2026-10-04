'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { BatchResult } from '@/services/types';
import { exportLinks } from '@/lib/exports';
import { downloadLinks } from './client';

export function BatchForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<BatchResult | null>(null);
  const [expiry, setExpiry] = useState('permanent');
  const [notice, setNotice] = useState('');
  const [recognized, setRecognized] = useState(0);

  return (
    <div className="space-y-8 max-w-4xl">
      <form
        className="panel stack"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError('');
          setResult(null);
          setNotice('');
          const form = event.currentTarget;
          const data = new FormData(form);
          try {
            const expiresAt =
              expiry === 'permanent'
                ? null
                : expiry === '30days'
                  ? new Date(Date.now() + 30 * 86400000).toISOString()
                  : new Date(String(data.get('expiresAt'))).toISOString();
            const response = await fetch('/api/admin/secrets/batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: data.get('text'),
                expiresAt,
                maxViews: data.get('maxViews') ? Number(data.get('maxViews')) : null,
              }),
            });
            if (!response.ok) {
              const body = await response.json();
              setError(body.error ?? '创建失败');
              return;
            }
            setResult(await response.json());
            form.reset();
            setRecognized(0);
            setExpiry('permanent');
          } catch {
            setError('提交结果不确定，请先检查卡密列表中的最近批次，不要直接重复提交。');
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="space-y-1">
          <label htmlFor="batch-textarea" className="text-sm font-semibold text-slate-900">
            卡密内容
          </label>
          <textarea
            id="batch-textarea"
            name="text"
            rows={9}
            required
            disabled={busy}
            placeholder="在此粘贴卡密数据，每行一条..."
            onChange={(event) =>
              setRecognized(event.target.value.split(/\r\n|\r|\n/).filter((line) => line.trim()).length)
            }
            className="w-full font-mono text-xs sm:text-sm p-3 border rounded-lg focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 border-b border-slate-100 pb-3">
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 bg-slate-100 px-2.5 py-1 rounded-full">
            已识别：{recognized} 条
          </span>
          <span>每行一条；自动忽略空行、保留重复。单批次最多 5,000 条，每条最多 32 KB。</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label htmlFor="expiry-select" className="text-sm font-semibold text-slate-900">
              有效期
            </label>
            <select
              id="expiry-select"
              value={expiry}
              onChange={(event) => setExpiry(event.target.value)}
              disabled={busy}
              className="w-full"
            >
              <option value="permanent">永久有效</option>
              <option value="30days">30 天</option>
              <option value="custom">自定义时间</option>
            </select>
          </div>

          {expiry === 'custom' && (
            <div className="space-y-1">
              <label htmlFor="expires-at-input" className="text-sm font-semibold text-slate-900">
                到期时间
              </label>
              <input
                id="expires-at-input"
                type="datetime-local"
                name="expiresAt"
                required
                disabled={busy}
                className="w-full"
              />
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="max-views-input" className="text-sm font-semibold text-slate-900">
              最大查看次数
            </label>
            <input
              id="max-views-input"
              name="maxViews"
              type="number"
              min="1"
              max="2147483647"
              placeholder="留空表示不限制查看次数"
              disabled={busy}
              className="w-full"
            />
          </div>
        </div>

        <div className="pt-2">
          <Button disabled={busy} size="lg" className="w-full sm:w-auto font-medium">
            {busy ? '生成中…' : '生成链接'}
          </Button>
        </div>

        {error && <p role="alert" className="text-sm">{error}</p>}
      </form>

      {result && (
        <section className="panel stack animate-in fade-in-50 duration-200">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">生成结果</h2>
              <p role="status" className="text-xs text-slate-600 mt-0.5">
                共 {result.total} 条，成功 {result.success}，失败 {result.failed}。
                {notice && <span className="ml-2 font-medium text-blue-600">{notice}</span>}
              </p>
            </div>
            <div className="actions">
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(result.items.map((item) => item.url).join('\n'));
                    setNotice('已复制');
                  } catch {
                    setNotice('复制失败，请从下方手动复制链接');
                  }
                }}
              >
                复制全部链接
              </Button>
              {(['txt', 'csv'] as const).map((format) => (
                <Button
                  variant="outline"
                  size="sm"
                  key={format}
                  onClick={() => downloadLinks(exportLinks(result.items.map((item) => item.url), format), format)}
                >
                  导出 {format.toUpperCase()}
                </Button>
              ))}
            </div>
          </div>

          <ol className="divide-y divide-slate-100 text-sm">
            {result.items.map((item) => (
              <li key={item.index} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-slate-400">#{item.index + 1}</span>
                    <span className="font-medium text-slate-800 text-xs sm:text-sm">{item.preview}</span>
                  </div>
                  <code className="text-xs font-mono text-blue-600 break-all select-all block bg-slate-50 p-1.5 rounded border border-slate-100">
                    {item.url}
                  </code>
                </div>
                <div className="shrink-0 self-end sm:self-center">
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`复制第 ${item.index + 1} 条链接`}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(item.url);
                        setNotice(`已复制第 ${item.index + 1} 条链接`);
                      } catch {
                        setNotice('复制失败，请选中链接手动复制');
                      }
                    }}
                  >
                    复制
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
