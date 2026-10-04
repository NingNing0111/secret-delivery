import { LoginForm } from '@/components/admin/login-form';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 sm:p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex w-12 h-12 rounded-xl bg-blue-600 text-white items-center justify-center font-bold text-lg shadow-md shadow-blue-500/20">
            SD
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-0">管理员登录</h1>
          <p className="text-sm text-slate-500">Secret Delivery 卡密管理后台</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
