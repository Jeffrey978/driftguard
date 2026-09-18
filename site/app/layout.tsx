import type { Metadata, Viewport } from "next";
import type React from "react";
import { Manrope } from "next/font/google";
import { MotionProvider } from "@/components/MotionProvider";
import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from "@/lib/site";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

const title = "DriftGuard — catch the drift, keep the hour";

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title,
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  icons: {
    icon: [
      { url: "/icons/icon32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon48.png", sizes: "48x48", type: "image/png" },
      { url: "/icons/icon128.png", sizes: "128x128", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon128.png", sizes: "128x128" }],
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title,
    description:
      "Blockers guess. DriftGuard asks. A local-first focus companion for Chrome, Edge and Brave.",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description:
      "Blockers guess. DriftGuard asks. A local-first focus companion for Chrome, Edge and Brave.",
  },
};

export const viewport: Viewport = {
  themeColor: "#F7F6F4",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${manrope.variable} antialiased`}>
      <body className="min-h-dvh font-sans">
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
