import type { Metadata } from "next";
import "./globals.css";
import { brand } from "../config/brand";

export const metadata: Metadata = {
  title: `${brand.name} | Electronics marketplace`,
  description: brand.description
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
