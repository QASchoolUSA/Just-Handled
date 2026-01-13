import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
// import AppLayout from '@/components/app-layout'; // handled in AuthWrapper
import { FirebaseClientProvider } from '@/firebase';

export const metadata: Metadata = {
  title: 'Just Handled',
  description: 'Bridge the gap between Operations and Accounting.',
};

import AuthWrapper from '@/components/auth-wrapper';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body antialiased">
        <FirebaseClientProvider>
          <AuthWrapper>{children}</AuthWrapper>
          <Toaster />
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
