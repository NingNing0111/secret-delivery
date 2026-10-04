import Link from 'next/link';
import { requireAdminPage } from '@/lib/admin-page';
import { listSecrets } from '@/services/secrets';
import { SecretsTable } from '@/components/admin/secrets-table';
import { ServiceError } from '@/lib/errors';
import { Button } from '@/components/ui/button';

export default async function SecretsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage();
  const raw = await searchParams;
  const query = Object.fromEntries(
    Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '')
  );

  let result;
  try {
    result = await listSecrets(query);
  } catch (error) {
    if (!(error instanceof ServiceError)) throw error;
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">卡密列表</h1>
        <p role="alert">{error.publicMessage}</p>
        <Link href="/admin/secrets" className="text-sm font-medium">重置筛选</Link>
      </div>
    );
  }

  // Dynamic server request snapshot, not a client render-time clock.
  const now = new Date().getTime();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-0">卡密列表</h1>
          <p className="text-sm text-slate-500">查看、搜索、筛选及批量操作所有卡密记录</p>
        </div>
        <Link
          href="/admin/secrets/create"
          className="inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 min-h-9 px-4 py-2 shadow-sm shadow-blue-500/20"
        >
          + 批量生成
        </Link>
      </div>

      <form className="panel filter-grid" action="/admin/secrets">
        <label>
          Token 或 ID
          <input
            name="search"
            placeholder="精确搜索 Token 或 ID"
            defaultValue={query.search}
          />
        </label>

        <label htmlFor="status-filter">
          状态
          <select id="status-filter" aria-label="状态" name="status" defaultValue={query.status ?? ''}>
            <option value="">全部</option>
            <option value="ACTIVE">有效</option>
            <option value="EXPIRED">已过期</option>
            <option value="DISABLED">已禁用</option>
          </select>
        </label>

        {Object.entries({
          createdFrom: '创建起始时间',
          createdTo: '创建截止时间',
          expiresFrom: '到期起始时间',
          expiresTo: '到期截止时间',
        }).map(([name, label]) => (
          <label key={name}>
            {label}（UTC）
            <input name={name} type="datetime-local" defaultValue={query[name]} />
          </label>
        ))}

        <div className="flex items-center gap-2 pt-1 sm:col-span-2 md:col-span-1">
          <Button className="flex-1">筛选</Button>
          <Link
            href="/admin/secrets"
            className="inline-flex items-center justify-center min-h-9 px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          >
            重置筛选
          </Link>
        </div>
      </form>

      <SecretsTable key={JSON.stringify(query)} {...result} page={Number(query.page ?? 1)} query={query} now={now} />
    </div>
  );
}
