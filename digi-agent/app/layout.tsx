import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from '@clerk/nextjs';
import { shadcn } from '@clerk/ui/themes';
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AppHeader } from "@/components/app-header";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: 'Digifianz - HubSpot Onboarding',
  description: 'Personalized HubSpot implementation onboarding with guided discovery',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('theme');document.documentElement.classList.toggle('dark',t==='dark');})();`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ClerkProvider
          appearance={{
            theme: shadcn,
            captcha: { theme: 'auto', size: 'normal' },
          }}
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInForceRedirectUrl="/onboarding/sync"
          signInFallbackRedirectUrl="/onboarding/sync"
          signUpForceRedirectUrl="/onboarding/sync"
          signUpFallbackRedirectUrl="/onboarding/sync"
          afterSignOutUrl="/"
          dynamic
        >
          <ThemeProvider>
            <AppHeader />
            {children}
            <Toaster />
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
