import './globals.css';

export const metadata = {
  title: '현장 기상특보 판정',
  description: '현장 위치를 입력하면 기상특보가 발효 중인지, 발효 예정인지 판정합니다.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
