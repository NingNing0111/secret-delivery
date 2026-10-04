import Link from 'next/link';
import { requireAdminPage } from '@/lib/admin-page';
import { LogoutButton } from '@/components/admin/login-form';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <a href="#main" className="skip-link">跳到主要内容</a>
      <header className="admin-header sticky top-0 z-30 shadow-xs backdrop-blur-md bg-white/90">
        <div className="admin-header-brand">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
            SD
          </div>
          <span>Secret Delivery</span>
        </div>
        <nav aria-label="管理导航" className="admin-header-nav">
          <Link href="/admin" className="admin-nav-link">仪表盘</Link>
          <Link href="/admin/secrets" className="admin-nav-link">卡密列表</Link>
          <Link href="/admin/secrets/create" className="admin-nav-link">批量生成</Link>
        </nav>
        <LogoutButton />
      </header>
      <main id="main" className="flex-1 w-full max-w-6xl mx-auto px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
