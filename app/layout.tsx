import type { Metadata } from 'next';
import type { ReactElement, ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'MedLens — Clinical Information Intelligence',
  description:
    'Turn fragmented medical documents and patient-entered data into a structured, traceable, reviewable patient record.',
};

export default function RootLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
