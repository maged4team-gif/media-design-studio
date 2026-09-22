import type { Metadata } from 'next';
import { Cairo } from 'next/font/google';
import './globals.css';

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-cairo',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'استوديو التصميم | Media Design Studio',
  description: 'منصة استعراض واعتماد مشاريع التصميم والهويات التلفزيونية',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className={cairo.variable}>
      <body className="min-h-screen bg-studio-bg text-studio-text-primary antialiased selection:bg-studio-blue selection:text-white">
        {children}
      </body>
    </html>
  );
}
