import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Public / Degoo Index', description: 'A thoughtfully simple public file collection.',
  robots: { index: false, follow: false }
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
