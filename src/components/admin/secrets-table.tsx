'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import type { SecretMetadata } from '@/services/secrets';
import { adminFetch, displayDate, downloadLinks } from './client';
import { DeleteDialog } from './delete-dialog';

export function SecretsTable({
  items,
  total,
  page,
  query,
  now,
}: {
  items: SecretMetadata[];
  total: number;
  page: number;
  query: Record<string, string>;
  now: number;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function action(kind: 'delete' | 'disable') {
    setBusy(true);
    setError('');
    try {
      await adminFetch(`/api/admin/secrets/batch/${kind}`, { ids: selected });
      setDeleting(false);
      setSelected([]);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }

  function pageUrl(value: number) {
    const params = new URLSearchParams(query);
    params.set('page', String(value));
    return `/admin/secrets?${params}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200">
        <div className="text-sm text-slate-600">
          共 <span className="font-semibold text-slate-900">{total}</span> 条 · 第{' '}
          <span className="font-semibold text-slate-900">{page}</span> 页，每页 50 条。
          <span className="ml-2 font-medium text-blue-600">已选 {selected.length} 条</span>
          <span className="text-xs text-slate-400">（仅本页，不跨页全选）</span>
        </div>

        <div className="actions">
          <Button size="sm" variant="outline" disabled={!selected.length || busy} onClick={() => action('disable')}>
            批量禁用
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={!selected.length || busy}
            onClick={() => setDeleting(true)}
          >
            批量删除
          </Button>
          {(['txt', 'csv'] as const).map((format) => (
            <Button
              key={format}
              size="sm"
              variant="outline"
              disabled={!selected.length || busy}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  const response = await adminFetch('/api/admin/secrets/export', { ids: selected, format });
                  downloadLinks(await response.text(), format);
                } catch (error) {
                  setError(error instanceof Error ? error.message : '导出失败');
                } finally {
                  setBusy(false);
                }
              }}
            >
              导出 {format.toUpperCase()}
            </Button>
          ))}
        </div>
      </div>

      {error && <p role="alert">{error}</p>}

      <div className="flex items-center gap-2 px-1">
        <label className="checkbox">
          <input
            type="checkbox"
            aria-label="选择本页"
            checked={items.length > 0 && selected.length === items.length}
            onChange={(event) => setSelected(event.target.checked ? items.map((item) => item.id) : [])}
          />
          全选本页记录
        </label>
      </div>

      {!items.length ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200 text-slate-400">
          暂无记录
        </div>
      ) : (
        <div className="record-grid">
          {items.map((item) => {
            const isExhausted = item.maxViews !== null && item.viewCount >= item.maxViews;
            const isExpired = item.expiresAt && new Date(item.expiresAt).getTime() <= now;
            const statusLabel =
              item.status === 'DISABLED'
                ? '已禁用'
                : isExpired
                  ? '已过期'
                  : '有效';
            const badgeClass =
              item.status === 'DISABLED'
                ? 'badge-disabled'
                : isExpired
                  ? 'badge-expired'
                  : 'badge-active';

            return (
              <article className="record-card" key={item.id}>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <label className="checkbox font-medium text-slate-800">
                      <input
                        type="checkbox"
                        aria-label={`选择 ${item.id}`}
                        checked={selected.includes(item.id)}
                        onChange={(event) =>
                          setSelected(
                            event.target.checked
                              ? [...selected, item.id]
                              : selected.filter((id) => id !== item.id)
                          )
                        }
                      />
                      <span className="truncate max-w-[12rem]">{item.preview}</span>
                    </label>
                    <span className={`badge ${badgeClass}`}>{statusLabel}</span>
                  </div>

                  <code className="record-token break-all block">{item.token}</code>

                  <div className="text-xs text-slate-500 space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">状态：</span>
                      <span>{statusLabel} · 查看 {item.viewCount} / {item.maxViews ?? '无限'}{isExhausted ? '（次数耗尽）' : ''}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>创建时间：</span>
                      <span>{displayDate(item.createdAt)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>到期时间：</span>
                      <span>{displayDate(item.expiresAt)}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex justify-end">
                  <Link
                    href={`/admin/secrets/${item.id}`}
                    prefetch={false}
                    className="inline-flex items-center justify-center min-h-8 px-3 py-1 text-xs rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-medium"
                  >
                    详情
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <nav aria-label="分页" className="actions justify-between pt-2">
        <div>
          {page > 1 && (
            <Link
              href={pageUrl(page - 1)}
              className="inline-flex items-center justify-center min-h-9 px-4 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              上一页
            </Link>
          )}
        </div>
        <div>
          {page * 50 < total && (
            <Link
              href={pageUrl(page + 1)}
              className="inline-flex items-center justify-center min-h-9 px-4 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              下一页
            </Link>
          )}
        </div>
      </nav>

      {deleting && (
        <DeleteDialog
          count={selected.length}
          busy={busy}
          onCancel={() => setDeleting(false)}
          onConfirm={() => action('delete')}
        />
      )}
    </div>
  );
}
