import type { Metadata } from "next";
import "./globals.css";
import "./mobile.css";
import { Providers } from "./providers";
import { Header } from "../components/Header";

export const metadata: Metadata = {
  title: "Arcadia — stake-to-play games on Celo",
  description: "An arcade of skill games where your stake rides a live multiplier. Built on Celo.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/logo.svg", type: "image/svg+xml" },
    ],
    apple: "/logo.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/logo.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/logo.svg" />
      </head>
      <body>
        <Header />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
