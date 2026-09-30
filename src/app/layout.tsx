import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SYNCHRO.VN | AI Commerce Copilot",
  description: "Giải pháp quản lý và bán hàng đa sàn bằng AI",
  icons: {
    icon: '/logo.png',
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
