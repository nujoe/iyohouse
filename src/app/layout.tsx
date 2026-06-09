import type { Metadata } from "next";
import { Gowun_Batang, Noto_Serif_KR, Noto_Sans_KR } from "next/font/google";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";
import "./globals.css";

const gowunBatang = Gowun_Batang({
  variable: "--font-gowun-batang",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const notoSerif = Noto_Serif_KR({
  variable: "--font-noto-serif",
  subsets: ["latin"],
  weight: ["400", "700", "900"],
});

const notoSans = Noto_Sans_KR({
  variable: "--font-noto-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
});

export const metadata: Metadata = {
  title: "IYOHOUSE",
  description: "이요하우스는 창작자를 위한 워크숍, 실험, 모임을 운영하는 서울 기반 크리에이티브 공간입니다.",
  openGraph: {
    title: "IYOHOUSE",
    description: "이요하우스는 창작자를 위한 워크숍, 실험, 모임을 운영하는 서울 기반 크리에이티브 공간입니다.",
    siteName: "IYOHOUSE",
  },
  icons: {
    icon: "/favicon.webp",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${gowunBatang.variable} ${notoSerif.variable} ${notoSans.variable}`}>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
