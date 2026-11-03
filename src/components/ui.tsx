'use client';
import { useEffect, useState } from 'react';

type T = { id: number; msg: string; kind?: 'ok' | 'err' };
let push: ((t: Omit<T, 'id'>) => void) | null = null;

export function toast(msg: string, kind?: 'ok' | 'err') { push?.({ msg, kind }); }

export function Toaster() {
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => {
    push = t => {
      const id = Date.now() + Math.random();
      setItems(x => [...x, { ...t, id }]);
      setTimeout(() => setItems(x => x.filter(i => i.id !== id)), t.kind === 'err' ? 7000 : 3500);
    };
    return () => { push = null; };
  }, []);
  return <div id="toasts" aria-live="polite">{items.map(t => <div key={t.id} className={'toast' + (t.kind ? ' ' + t.kind : '')}>{t.msg}</div>)}</div>;
}

export function Modal({ title, children, onClose, footer }: { title: string; children: React.ReactNode; onClose: () => void; footer?: React.ReactNode }) {
  return (
    <div className="modal-back" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head"><h2>{title}</h2><button className="btn sm" onClick={onClose}>닫기</button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Lvl({ level }: { level: number }) {
  return <span className={`lvl l${level}`}>{['정상', '조정', '중단'][level]}</span>;
}
