import "./globals.css";
import type { Metadata } from "next";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";

export const metadata: Metadata = {
  title: "Forecast Studio · S&OP Demo",
  description:
    "Interactive S&OP decision support tool using Kaggle M5 data, reframed for K-beauty.",
  // Open Graph for shareable previews (LinkedIn, Slack, etc.)
  openGraph: {
    title: "Forecast Studio · S&OP Demo",
    description:
      "Interactive S&OP decision support tool — predictive intervals, What-if scenarios, SHAP explanations, inventory simulator.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* Pretendard via CDN — single brand font, no extra weights needed */}
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-screen flex flex-col bg-bg text-text">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
