export function exportLinks(urls: string[], format: 'txt' | 'csv'): string {
  if (format === 'txt') return urls.join('\n');
  const cell = (value: string) => /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  return ['index,url', ...urls.map((url, index) => `${index + 1},${cell(url)}`)].join('\n');
}
