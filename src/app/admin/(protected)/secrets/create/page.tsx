import { requireAdminPage } from '@/lib/admin-page';
import { BatchForm } from '@/components/admin/batch-form';
export default async function CreatePage() { await requireAdminPage(); return <><h1>批量生成</h1><BatchForm /></>; }
