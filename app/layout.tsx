import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  themeColor: "#00C896",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export const metadata: Metadata = {
  title: "Stock Profile",
  description: "Stock Profile - your personal portfolio intelligence platform. Monitor holdings, track performance and market-moving news.",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Stock Profile" />
        <meta name="format-detection" content="telephone=no" />
      </head>
      <body style={{ margin: 0, padding: 0, background: "#07090D", overflowX: "hidden" }}>
        {children}
      </body>
    </html>
  );
}
