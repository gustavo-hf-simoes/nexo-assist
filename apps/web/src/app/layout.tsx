import type { Metadata } from "next";
import { Newsreader, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

const schibsted = Schibsted_Grotesk({
  variable: "--font-schibsted",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nexo Assist",
  description: "Service desk de TI da Nexo: descreva o problema e o assistente cuida do chamado.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${schibsted.variable} ${newsreader.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
