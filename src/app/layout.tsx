import type { Metadata } from "next";
import "./globals.css";
import { mindvaultsProvider as MindVaultsProvider } from "@/context/mindvaultsContext";
import Toast from "@/components/shared/Toast";

export const metadata: Metadata = {
  title: "mindvaults v0.0.1 — 本地私有化 RAG 知识库",
  description:
    "开源、隐私至上的本地 RAG 知识库。支持本地 Ollama / 云端 API 双模式，PDF/Markdown/Word 文档导入，pgvector 向量检索，SSE 流式对话，引用溯源。你的数据，永远归你所有。",
  icons: {
    icon: "/logo.svg",
  },
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
          <Toast />
        </MindVaultsProvider>
      </body>
    </html>
  );
}
