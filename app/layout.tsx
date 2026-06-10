import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  themeColor: "#00C896",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "OpenBell Portfolio",
  description: "Your personal portfolio intelligence platform — monitor holdings, track performance, understand market-moving news.",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="OpenBell" />
      </head>
      <body style={{ margin: 0, padding: 0, background: "#07090D" }}>
        {children}
      </body>
    </html>
  );
}
