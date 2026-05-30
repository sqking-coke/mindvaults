import type { Metadata } from "next";
import "./globals.css";
import { mindvaultsProvider as MindVaultsProvider } from "@/context/mindvaultsContext";

export const metadata: Metadata = {
  title: "mindvaults - 本地私有化知识库",
  description: "本地私有化知识库问答 Agent UI/UX 原型",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="h-full">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="h-full font-sans antialiased bg-slate-50 text-slate-900 selection:bg-indigo-100">
        <MindVaultsProvider>
          {children}
        </MindVaultsProvider>
      </body>
    </html>
  );
}
