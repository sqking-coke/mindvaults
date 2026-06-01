"use client";

import React, { useState, useRef } from "react";
import { usemindvaults } from "@/context/mindvaultsContext";
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

  const { isDemo } = usemindvaults();

  const handleFiles = (files: File[]) => {
    if (!activeKbId || files.length === 0) return;
    if (isDemo) {
      showToast("演示环境不支持上传文档，请自部署后体验完整功能", "warning");
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
    if (isDemo) {
      showToast("演示环境不支持上传文档，请自部署后体验完整功能", "warning");
      return;
    }
    handleFiles(Array.from(e.dataTransfer.files));
  };

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isDemo) {
      showToast("演示环境不支持上传文档，请自部署后体验完整功能", "warning");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    handleFiles(Array.from(e.target.files || []));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => {
        if (isDemo) {
          showToast("演示环境不支持上传文档，请自部署后体验完整功能", "warning");
          return;
        }
        fileInputRef.current?.click();
      }}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !isDragging) {
          e.preventDefault();
          if (isDemo) {
            showToast("演示环境不支持上传文档，请自部署后体验完整功能", "warning");
            return;
          }
          fileInputRef.current?.click();
        }
      }}
      aria-label="上传文档区域，拖放 PDF、DOCX、TXT 文件至此，或点击选择文件"
      className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer flex flex-col items-center justify-center space-y-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
        isDragging
          ? "border-indigo-500 bg-indigo-50/50 scale-[0.99]"
          : "border-slate-200 hover:border-indigo-400 hover:bg-slate-50/50"
      }`}
    >
      <div className="h-12 w-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-sm">
        <Upload className="h-5.5 w-5.5" />
      </div>
      <div>
        <p className="text-xs font-bold text-slate-800">
          拖拽 PDF、DOCX、TXT 文件到此处上传，或点击浏览选择
        </p>
        <p className="text-[10px] text-slate-400 mt-1.5 max-w-[360px] mx-auto leading-relaxed">
          支持 PDF、Microsoft Word、Markdown、TXT 与 CSV 等常见离线文档格式，支持批量多选
        </p>
      </div>
      <input
        type="file"
        ref={fileInputRef}
        onChange={onFileSelect}
        multiple
        accept=".pdf,.docx,.doc,.txt,.md,.csv,.xlsx,.pptx,.json,.html"
        className="hidden"
      />
    </div>
  );
}
