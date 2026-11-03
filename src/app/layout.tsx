import type { Metadata } from 'next';
import './globals.css';
import { Topbar } from '@/components/Topbar';
import { Toaster } from '@/components/ui';

export const metadata: Metadata = {
  title: '기상 브리핑·부대운용 건의',
  description: '공군 기상전문과 민간기상 수치로 부대활동별 운용 건의를 만드는 도구'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <Topbar />
        <main>{children}</main>
        <Toaster />
      </body>
    </html>
  );
}
