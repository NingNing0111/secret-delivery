import { expect, it } from 'vitest';
import { normalizeLines, parseBatchInput } from '@/lib/batch-input';
import { secretPreview } from '@/lib/preview';
import { exportLinks } from '@/lib/exports';
it('normalizes all line endings, trims, ignores blanks and preserves duplicates/internal spaces', () => {
  expect(normalizeLines(' a  b\r\n \ra  b\nx ')).toEqual(['a  b', 'a  b', 'x']);
});
it('accepts byte and count boundaries', () => {
  expect(parseBatchInput({ text: 'a'.repeat(32768) }).secrets[0]).toHaveLength(32768);
  expect(parseBatchInput({ text: Array(5000).fill('same').join('\n') }).secrets).toHaveLength(5000);
});
it.each([{ text: 'a'.repeat(32769) }, { text: '你'.repeat(10923) }, { text: Array(5001).fill('x').join('\n') }, { text: '  ' }, { text: 'x', maxViews: 0 }, { text: 'x', maxViews: 1.5 }, { text: 'x', expiresAt: '2000-01-01T00:00:00Z' }])('rejects invalid batch %#', input => {
  expect(() => parseBatchInput(input)).toThrow();
});
it('parses expiry and finite limits', () => {
  expect(parseBatchInput({ text: ' x ', maxViews: 2, expiresAt: '2099-01-01T00:00:00Z' })).toEqual({ secrets: ['x'], maxViews: 2, expiresAt: new Date('2099-01-01T00:00:00Z') });
});
it('masks short contents completely and reveals at most three Unicode characters', () => {
  expect(secretPreview('1234567')).toBe('********');
  expect(secretPreview('12345678')).toBe('123********');
  expect(secretPreview('😀😀😀😀😀😀😀😀')).toBe('😀😀😀********');
});
it('exports only ordered links with one-based CSV indices', () => {
  const urls = ['https://example.com/k/a', 'https://example.com/k/b'];
  expect(exportLinks(urls, 'txt')).toBe(urls.join('\n'));
  expect(exportLinks(urls, 'csv')).toBe('index,url\n1,https://example.com/k/a\n2,https://example.com/k/b');
});
