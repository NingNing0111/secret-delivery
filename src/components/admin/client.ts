export async function adminFetch(path: string, body?: unknown, method = 'POST'): Promise<Response> {
  const response = await fetch(path, { method, cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (response.status === 401) {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Expired auth must clear sensitive client/RSC state via a full navigation.
    window.location.assign('/admin/login');
    throw new Error('会话已失效，请重新登录');
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error ?? '请求失败，请稍后再试');
  }
  return response;
}
export function downloadLinks(content: string, format: 'txt' | 'csv') {
  const url = URL.createObjectURL(new Blob([content], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url;
  link.download = `secret-links-${new Date().toISOString().replaceAll(':', '-')}.${format}`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function displayDate(value: string | Date | null) { return value ? new Date(value).toLocaleString('zh-CN') : '永久 / 无'; }
