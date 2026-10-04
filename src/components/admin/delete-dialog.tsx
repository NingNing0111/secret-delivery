'use client';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
export function DeleteDialog({ count, busy, onCancel, onConfirm }: { count: number; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} aria-labelledby="delete-title" onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }} className="panel"><h2 id="delete-title">确认删除 {count} 条记录？</h2><p>永久删除后无法恢复，提取链接将立即失效。</p><div className="actions"><Button variant="outline" autoFocus disabled={busy} onClick={onCancel}>取消</Button><Button variant="destructive" disabled={busy} onClick={onConfirm}>确认永久删除</Button></div></dialog>;
}
