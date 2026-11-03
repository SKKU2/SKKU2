'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLinks({ role }: { role: string }) {
  const path = usePathname();
  const links = [
    { href: '/', label: '현황' },
    ...(role !== 'viewer' ? [{ href: '/briefings/new', label: '새 브리핑' }] : []),
    { href: '/history', label: '이력' },
    ...(role !== 'viewer' ? [{ href: '/settings', label: '설정' }] : [])
  ];
  const active = (h: string) => (h === '/' ? path === '/' : path.startsWith(h));
  return (
    <nav className="tabs">
      {links.map(l => <Link key={l.href} href={l.href} className={'tab' + (active(l.href) ? ' active' : '')}>{l.label}</Link>)}
    </nav>
  );
}
