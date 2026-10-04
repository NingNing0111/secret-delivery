import { notFound } from 'next/navigation';
import { requireAdminPage } from '@/lib/admin-page';
import { getSecret } from '@/services/secrets';
import { ServiceError } from '@/lib/errors';
import { SecretDetail } from '@/components/admin/secret-detail';
export default async function DetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  let item;
  try { item = await getSecret((await params).id); }
  catch (error) { if (error instanceof ServiceError && error.code === 'NOT_FOUND') notFound(); throw error; }
  return <><h1>卡密详情</h1><SecretDetail item={item} /></>;
}
