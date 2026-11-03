'use client';
export function PrintButton() {
  return <button className="btn primary" onClick={() => window.print()}>인쇄 / PDF 저장</button>;
}
