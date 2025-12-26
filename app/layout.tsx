import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Renzo ezETH Dashboard | On-Chain Analytics",
  description: "Real-time on-chain analytics for Renzo ezETH protocol - TVL, operators, fund distribution, and more.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
