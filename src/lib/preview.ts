export function secretPreview(content: string): string {
  const chars = Array.from(content);
  return (chars.length >= 8 ? chars.slice(0, 3).join('') : '') + '********';
}
