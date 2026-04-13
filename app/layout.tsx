import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Fairway Society | Golf. Network. Connect.",
  description:
    "An exclusive golf networking group bringing together like-minded professionals on the fairway since 2025.",
  metadataBase: new URL("https://thefairwaysociety.com.au"),
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
