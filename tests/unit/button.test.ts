import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { Button } from '@/components/ui/button';

it('renders an accessible disabled button with merged styling', () => {
  const html = renderToStaticMarkup(createElement(Button, { disabled: true, className: 'custom' }, '创建链接'));
  expect(html).toContain('<button');
  expect(html).toContain('disabled');
  expect(html).toContain('custom');
  expect(html).toContain('创建链接');
});
it('supports composing a link without nested interactive elements', () => {
  const html = renderToStaticMarkup(createElement(Button, { asChild: true }, createElement('a', { href: '/admin' }, '管理')));
  expect(html).toContain('<a');
  expect(html).not.toContain('<button');
});
