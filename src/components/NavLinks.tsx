'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLinks({ role }: { role: string }) {
  const path = usePathname();
  const editor = role === 'admin' || role === 'unit_admin' || role === 'operator';
  const manager = role === 'admin' || role === 'unit_admin';
  const links = [
    { href: '/', label: '현황' },
    ...(editor ? [{ href: '/briefings/new', label: '새 브리핑' }] : []),
    { href: '/history', label: '이력' },
    ...(manager ? [{ href: '/settings', label: '기준 설정' }, { href: '/admin/users', label: '사용자' }] : [])
  ];
  const active = (h: string) => (h === '/' ? path === '/' : path.startsWith(h));
  return (
    <nav className="tabs">
      {links.map(l => <Link key={l.href} href={l.href} className={'tab' + (active(l.href) ? ' active' : '')}>{l.label}</Link>)}
    </nav>
  );
}
