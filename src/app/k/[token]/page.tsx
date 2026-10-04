import { retrieveSecret } from '@/services/retrieval';
import { SecretViewer } from '@/components/secret-viewer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const titles = {
  not_found: '提取链接不存在',
  disabled: '该提取链接已失效',
  expired: '提取链接已过期',
  exhausted: '该提取链接已达到最大查看次数',
};

export default async function RetrievalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let result;
  try {
    result = await retrieveSecret(token);
  } catch {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 sm:p-6">
        <main className="w-full max-w-lg p-6 sm:p-8 bg-white rounded-2xl border border-slate-200 shadow-md space-y-4 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-rose-100 text-rose-600 flex items-center justify-center font-bold text-xl">
            !
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">服务暂时不可用</h1>
          <p className="text-sm text-slate-500">请稍后再试。</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 sm:p-6">
      <main className="w-full max-w-lg p-6 sm:p-8 bg-white rounded-2xl border border-slate-200 shadow-md">
        {result.ok ? (
          <SecretViewer content={result.content} expiresAt={result.expiresAt?.toISOString() ?? null} />
        ) : (
          <div className="space-y-4 text-center py-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-amber-100 text-amber-600 flex items-center justify-center font-bold text-xl">
              !
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{titles[result.reason]}</h1>
            <p className="text-sm text-slate-500">
              {result.reason === 'not_found' ? '请确认链接是否完整。' : '请联系商品卖家处理。'}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
