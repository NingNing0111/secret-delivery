'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SecretMetadata } from '@/services/secrets';
import { Button } from '@/components/ui/button';
import { adminFetch, displayDate } from './client';
import { DeleteDialog } from './delete-dialog';

export function SecretDetail({ item }: { item: SecretMetadata }) {
  const router = useRouter();
  const [content, setContent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deleting, setDeleting] = useState(false);

  async function action(kind: 'reveal' | 'disable' | 'enable' | 'delete') {
    setBusy(true);
    setError('');
    try {
      const response = await adminFetch(
        `/api/admin/secrets/${item.id}${kind === 'delete' ? '' : `/${kind}`}`,
        undefined,
        kind === 'delete' ? 'DELETE' : 'POST'
      );
      if (kind === 'reveal') setContent((await response.json()).content);
      else if (kind === 'delete') router.push('/admin/secrets');
      else router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }

  const details = [
    { key: 'ID', value: item.id },
    { key: 'Token', value: item.token },
    { key: '链接', value: item.url },
    { key: '预览', value: item.preview },
    { key: '状态', value: item.status === 'DISABLED' ? '已禁用' : '启用' },
    { key: '创建时间', value: displayDate(item.createdAt) },
    { key: '到期时间', value: displayDate(item.expiresAt) },
    { key: '最近查看', value: displayDate(item.lastViewedAt) },
    { key: '查看次数', value: `${item.viewCount} / ${item.maxViews ?? '无限'}` },
    { key: '批次', value: item.batchId },
    { key: '批内序号', value: String(item.batchIndex + 1) },
  ];

  return (
    <section className="panel space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{item.preview}</h2>
          <p className="text-xs text-slate-500 font-mono mt-0.5">{item.id}</p>
        </div>
        <span
          className={`badge ${
            item.status === 'DISABLED'
              ? 'badge-disabled'
              : 'badge-active'
          }`}
        >
          {item.status === 'DISABLED' ? '已禁用' : '正常启用'}
        </span>
      </div>

      <dl className="detail-grid">
        {details.map(({ key, value }) => (
          <div key={key} className="detail-item">
            <dt>{key}</dt>
            <dd className="break-all select-all font-mono text-xs sm:text-sm">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
        ⚠️ 说明：恢复已禁用卡密不会重置有效期或已查看次数。
      </div>

      <div className="actions pt-2 border-t border-slate-100">
        <Button disabled={busy} onClick={() => action('reveal')}>
          Reveal 查看完整内容
        </Button>
        <Button
          disabled={busy}
          variant="outline"
          onClick={() => action(item.status === 'DISABLED' ? 'enable' : 'disable')}
        >
          {item.status === 'DISABLED' ? '恢复' : '禁用'}
        </Button>
        <Button variant="destructive" disabled={busy} onClick={() => setDeleting(true)}>
          删除
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(item.url);
              setNotice('已复制链接');
            } catch {
              setNotice('复制失败，请选中上方链接手动复制');
            }
          }}
        >
          复制链接
        </Button>
      </div>

      {content !== null && (
        <div className="space-y-2 p-4 rounded-xl bg-slate-900 text-slate-100 animate-in fade-in-50 duration-200 shadow-inner">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            解密后的敏感内容 (Plaintext Secret)
          </div>
          <pre data-testid="revealed-content" className="whitespace-pre-wrap break-all font-mono text-sm leading-relaxed text-emerald-300">
            {content}
          </pre>
        </div>
      )}

      {error && <p role="alert">{error}</p>}
      {notice && <p role="status" className="text-sm font-medium text-blue-600">{notice}</p>}

      {deleting && (
        <DeleteDialog
          count={1}
          busy={busy}
          onCancel={() => setDeleting(false)}
          onConfirm={() => action('delete')}
        />
      )}
    </section>
  );
}
