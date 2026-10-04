import { expect, it } from 'vitest';
import { readJsonLimited } from '@/lib/request-body';
function request(body: string, length?: string) {
  return new Request('http://localhost', { method: 'POST', body, headers: length ? { 'content-length': length } : {} });
}
it('reads valid JSON without content length', async () => {
  expect(await readJsonLimited(request('{"a":1}'), 20)).toEqual({ a: 1 });
});
it.each([undefined, '1', '100'])('rejects actual byte overflow despite length %s', async length => {
  await expect(readJsonLimited(request('"你好你好"', length), 10)).rejects.toMatchObject({ code: 'TOO_LARGE' });
});
it('rejects malformed JSON with a public validation error', async () => {
  await expect(readJsonLimited(request('{secret'), 20)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
});
it('cancels a chunked body when it crosses the limit', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(8)); }, cancel() { cancelled = true; } });
  const req = new Request('http://localhost', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
  await expect(readJsonLimited(req, 10)).rejects.toMatchObject({ code: 'TOO_LARGE' });
  expect(cancelled).toBe(true);
});
