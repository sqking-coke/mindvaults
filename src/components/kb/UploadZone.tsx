"use client";

import React, { useState, useRef } from "react";
import { usemindvaults } from "@/context/mindvaultsContext";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { Upload } from "lucide-react";

interface UploadZoneProps {
  showToast: (message: string, type?: "success" | "error" | "warning") => void;
}

export default function UploadZone({ showToast }: UploadZoneProps) {
  const {
    activeKbId,
    uploadDocuments
  } = usemindvaults();

  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [demoBlock, setDemoBlock] = useState(false);

  const { isDemo } = usemindvaults();

  const handleFiles = (files: File[]) => {
    if (!activeKbId || files.length === 0) return;
    if (isDemo) {
      setDemoBlock(true);
      return;
    }
    uploadDocuments(activeKbId, files);
    showToast(`正在上传 ${files.length} 个文件到后端...`, "success");
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(Array.from(e.dataTransfer.files));
  };

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(Array.from(e.target.files || []));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`relative flex flex-col items-center justify-center border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-200 shadow-sm min-h-[120px] ${
        isDragging
          ? "border-indigo-500 bg-indigo-50/50 scale-[1.02] shadow-indigo-500/10"
          : "border-slate-300 bg-slate-50/30 hover:border-indigo-400 hover:bg-indigo-50/20 hover:scale-[1.01]"
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept=".pdf,.docx,.md,.txt"
        onChange={onFileSelect}
        aria-label="选择文档文件上传"
      />
      <div className="flex flex-col items-center gap-2 py-8 px-4 text-center pointer-events-none">
        <div className="h-12 w-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-500 shadow-sm">
          <Upload className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-700">
            拖拽文档到此处上传
          </p>
          <p className="text-xs text-slate-400 mt-1">
            支持 PDF、Word、Markdown、TXT
          </p>
        </div>
      </div>

      <ConfirmDialog
        open={demoBlock}
        onClose={() => setDemoBlock(false)}
        onConfirm={() => setDemoBlock(false)}
        title="演示环境"
        message="演示环境不支持上传文档，请自部署后体验完整功能。"
        confirmLabel="知道了"
        variant="warning"
      />
    </div>
  );
}