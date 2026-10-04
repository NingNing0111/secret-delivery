import { requireAdminPage } from '@/lib/admin-page';
import { getDashboard } from '@/services/dashboard';

export default async function DashboardPage() {
  await requireAdminPage();
  const stats = await getDashboard();

  const cardConfig: Record<string, { label: string; desc: string; color: string }> = {
    总数: { label: '总数', desc: '系统内生成的所有卡密记录', color: 'text-slate-900' },
    有效: { label: '有效', desc: '状态处于 ACTIVE 且未过期', color: 'text-emerald-600' },
    已过期: { label: '已过期', desc: '已超过预设的截止时间', color: 'text-rose-600' },
    已禁用: { label: '已禁用', desc: '管理员手动禁用的卡密', color: 'text-slate-500' },
    总访问次数: { label: '总访问次数', desc: '所有卡密的累计有效提取次数', color: 'text-blue-600' },
  };

  const statEntries = [
    { key: '总数', value: stats.total },
    { key: '有效', value: stats.active },
    { key: '已过期', value: stats.expired },
    { key: '已禁用', value: stats.disabled },
    { key: '总访问次数', value: stats.views },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">仪表盘</h1>
        <p className="text-sm text-slate-500">查看全局卡密指标与提取概况</p>
      </div>

      <div className="stats">
        {statEntries.map(({ key, value }) => {
          const cfg = cardConfig[key];
          return (
            <section className="stat-card" key={key}>
              <h2>{cfg.label}</h2>
              <strong className={cfg.color}>{value}</strong>
              <span className="text-xs text-slate-400">{cfg.desc}</span>
            </section>
          );
        })}
      </div>

      <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 text-sm text-blue-900">
        💡 提示：有效状态不代表仍有剩余查看次数；恢复已禁用卡密不会重置有效期或已查看次数。
      </div>
    </div>
  );
}
