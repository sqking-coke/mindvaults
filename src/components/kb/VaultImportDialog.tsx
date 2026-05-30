"use client";

import React, { useState, useRef } from "react";
import { usemindvaults } from "@/context/mindvaultsContext";
import { 
  X, 
  FolderOpen, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  HelpCircle, 
  Upload, 
  Files, 
  Terminal 
} from "lucide-react";

interface VaultImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (message: string, type?: "info" | "success" | "warning") => void;
}

// Utility to recursively read entries from DirectoryReader
async function readAllEntries(dirReader: any): Promise<any[]> {
  const allEntries: any[] = [];
  const read = async (): Promise<any[]> => {
    return new Promise((resolve) => {
      dirReader.readEntries((entries: any[]) => {
        resolve(entries || []);
      }, (err: any) => {
        console.error("Error reading directory entries:", err);
        resolve([]);
      });
    });
  };
  while (true) {
    const entries = await read();
    if (entries.length === 0) break;
    allEntries.push(...entries);
  }
  return allEntries;
}

// Recursively traverse dropped folders/files using webkitGetAsEntry
async function getAllFilesFromEntry(entry: any): Promise<File[]> {
  const files: File[] = [];
  if (entry.isFile) {
    const file = await new Promise<File>((resolve) => entry.file(resolve));
    if (file.name.endsWith(".md") && !entry.fullPath.includes("/.")) {
      // Preserve relative path of dropped files by writing webkitRelativePath
      const relPath = entry.fullPath.startsWith("/") ? entry.fullPath.substring(1) : entry.fullPath;
      Object.defineProperty(file, 'webkitRelativePath', {
        value: relPath,
        writable: false,
        configurable: true
      });
      files.push(file);
    }
  } else if (entry.isDirectory) {
    // Skip hidden directories (starting with ".") like .obsidian, .git
    if (entry.name.startsWith(".")) return [];

    const dirReader = entry.createReader();
    const entries = await readAllEntries(dirReader);
    for (const child of entries) {
      const childFiles = await getAllFilesFromEntry(child);
      files.push(...childFiles);
    }
  }
  return files;
}

export default function VaultImportDialog({ isOpen, onClose, showToast }: VaultImportDialogProps) {
  const { importVault, uploadVault } = usemindvaults();

  // Active Mode: "upload" (browser-side folder upload) or "scan" (server-side path scan)
  const [activeTab, setActiveTab] = useState<"upload" | "scan">("upload");

  // State for server-side path scan
  const [path, setPath] = useState("");

  // State for browser-side folder upload
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [vaultName, setVaultName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // General Status State
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Unified results structure matching VaultImportResponse
  const [result, setResult] = useState<{
    total_found: number;
    imported: number;
    failed: number;
    errors: { file: string; reason: string }[];
  } | null>(null);

  if (!isOpen) return null;

  // Folder selection via input box change
  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Filter only .md files and ignore hidden folder parts (starting with .)
    const filteredMd = files.filter(f => 
      f.name.endsWith(".md") && 
      !f.webkitRelativePath.split("/").some(part => part.startsWith("."))
    );

    if (filteredMd.length === 0) {
      setError("未在该文件夹中找到任何 Markdown (.md) 文档，请确认是否选择了正确的 Vault。");
      return;
    }

    // Capture the vault directory root name
    const firstPathPart = filteredMd[0].webkitRelativePath.split("/")[0];
    setVaultName(firstPathPart || "Obsidian Vault");
    setSelectedFiles(filteredMd);
    setError(null);
  };

  // Drag & Drop handlers for folder upload area
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setError(null);

    const items = Array.from(e.dataTransfer.items || []);
    if (items.length === 0) return;

    setIsImporting(true);
    try {
      const allFilesPromises = items.map(item => {
        const entry = item.webkitGetAsEntry();
        return entry ? getAllFilesFromEntry(entry) : Promise.resolve([]);
      });

      const filesArrays = await Promise.all(allFilesPromises);
      const mdFiles = filesArrays.flat();

      if (mdFiles.length === 0) {
        setError("未拖入有效的 Obsidian 文件夹或未检测到 Markdown 文档（已忽略隐藏文件及非 .md 附件）。");
        setIsImporting(false);
        return;
      }

      // Extract vault root folder name
      const samplePath = mdFiles[0].webkitRelativePath || mdFiles[0].name;
      const rootFolder = samplePath.includes("/") ? samplePath.split("/")[0] : "My Vault";

      setVaultName(rootFolder);
      setSelectedFiles(mdFiles);
    } catch (err) {
      console.error("Failed to parse dropped folder:", err);
      setError("读取文件夹失败，请尝试使用点击“选择文件夹”进行导入。");
    } finally {
      setIsImporting(false);
    }
  };

  // Perform the actual import / upload
  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsImporting(true);
    setError(null);
    setResult(null);

    try {
      if (activeTab === "scan") {
        // Server path scan
        if (!path.trim()) {
          setError("请输入 Obsidian Vault 目录的绝对路径");
          setIsImporting(false);
          return;
        }
        const resp = await importVault(path.trim());
        setResult({
          total_found: resp.total_found,
          imported: resp.imported,
          failed: resp.failed,
          errors: resp.errors,
        });
        showToast(`Obsidian Vault 导入成功！共导入 ${resp.imported} 个文件`, "success");
      } else {
        // Folder drag-and-drop / multiple upload
        if (selectedFiles.length === 0) {
          setError("请先拖入或选择您的 Obsidian 文件夹");
          setIsImporting(false);
          return;
        }
        const resp = await uploadVault(selectedFiles);
        setResult({
          total_found: resp.total_found,
          imported: resp.imported,
          failed: resp.failed,
          errors: resp.errors,
        });
        showToast(`Obsidian Vault 文件夹上传成功！共上传并导入 ${resp.imported} 个文档`, "success");
      }
    } catch (err) {
      console.error("Vault import/upload error:", err);
      setError(
        err instanceof Error 
          ? err.message 
          : "导入失败。请确认路径可达、容器已挂载或文件内容编码为 utf-8。"
      );
    } finally {
      setIsImporting(false);
    }
  };

  const handleClearSelection = () => {
    setSelectedFiles([]);
    setVaultName(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClose = () => {
    setPath("");
    setSelectedFiles([]);
    setVaultName(null);
    setError(null);
    setResult(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
      <div 
        className="w-full max-w-xl bg-white border border-slate-200 rounded-2xl shadow-xl flex flex-col max-h-[90vh] overflow-hidden transform transition-all duration-300 scale-100"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-modal-title"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-150 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
              <FolderOpen className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 id="import-modal-title" className="font-semibold text-slate-800 text-sm">
                导入 Obsidian Vault 知识库
              </h3>
              <p className="text-[10px] text-slate-400 mt-0.5">
                支持直接将整个本地文件夹拖入上传或在容器内路径扫描
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isImporting}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors focus:outline-none disabled:opacity-50"
            aria-label="关闭窗口"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Tab Selector */}
        {!result && (
          <div className="px-6 pt-3 flex border-b border-slate-100 bg-slate-50/50 select-none">
            <button
              onClick={() => { setActiveTab("upload"); setError(null); }}
              disabled={isImporting}
              className={`flex-1 py-2 text-xs font-bold border-b-2 text-center transition-all ${
                activeTab === "upload" 
                  ? "border-indigo-600 text-indigo-600 font-bold" 
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              一键文件夹拖拽上传 (推荐)
            </button>
            <button
              onClick={() => { setActiveTab("scan"); setError(null); }}
              disabled={isImporting}
              className={`flex-1 py-2 text-xs font-bold border-b-2 text-center transition-all ${
                activeTab === "scan" 
                  ? "border-indigo-600 text-indigo-600 font-bold" 
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              本地绝对路径扫描 (极客模式)
            </button>
          </div>
        )}

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto space-y-4">
          
          {/* Universal Tip Area */}
          {!result && (
            <div className="text-xs text-slate-500 bg-slate-50 border border-slate-150 p-3.5 rounded-xl leading-relaxed flex gap-2.5 shadow-sm">
              <Sparkles className="h-4.5 w-4.5 text-indigo-500 shrink-0 mt-0.5 animate-pulse" />
              <div>
                <span className="font-semibold text-slate-700">导入特性：</span>
                系统将递归扫描该目录下所有的 <span className="font-semibold text-indigo-600">.md</span> 纯文本。自动提取 YAML Frontmatter，并将双链 <code className="bg-slate-100 px-1 py-0.2 rounded font-mono text-[10px]">[[wiki]]</code> 转化为语义平滑的文本并暂存，最后自动触发多线程切片向量计算管道。
              </div>
            </div>
          )}

          {!result ? (
            <form onSubmit={handleImportSubmit} className="space-y-4">
              {activeTab === "upload" ? (
                /* Tab A: Folder Drag & Drop Upload */
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                    选择或拖入 Obsidian 文件夹
                    <span className="text-red-500">*</span>
                  </label>

                  {selectedFiles.length === 0 ? (
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer flex flex-col items-center justify-center space-y-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                        isDragging 
                          ? "border-indigo-500 bg-indigo-50/50 scale-[0.99]" 
                          : "border-slate-200 hover:border-indigo-400 hover:bg-slate-50/50"
                      }`}
                    >
                      <div className="h-12 w-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-sm">
                        <Upload className="h-5.5 w-5.5 animate-bounce" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">
                          将 Obsidian 文件夹拖拽到此处，或点击浏览选择
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1.5 max-w-[360px] mx-auto leading-relaxed">
                          支持拖拽本地知识库文件夹，前端将自动过滤出 Markdown 文档并极速上传，已安全忽略配置大附件。
                        </p>
                      </div>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFolderSelect}
                        // HTML5 folder selection attributes
                        {...{
                          webkitdirectory: "",
                          directory: "",
                          multiple: true
                        } as any}
                        className="hidden"
                      />
                    </div>
                  ) : (
                    /* Folder Selected State */
                    <div className="p-4 bg-indigo-50/30 border border-indigo-100 rounded-2xl flex items-center justify-between gap-4 animate-fade-in">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 shrink-0">
                          <Files className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate">
                            已就绪: {vaultName}
                          </p>
                          <p className="text-[10px] text-indigo-600 mt-0.5 flex items-center gap-1 font-semibold">
                            <span>共扫描到 {selectedFiles.length} 个 Markdown 笔记</span>
                            <span className="text-slate-300">|</span>
                            <span className="text-slate-400 font-normal">已自动跳过隐藏文件和多媒体附件</span>
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleClearSelection}
                        disabled={isImporting}
                        className="text-xs text-slate-400 hover:text-slate-600 px-3 py-1.5 hover:bg-slate-100 rounded-lg transition-all shrink-0 font-medium disabled:opacity-50"
                      >
                        清除并重选
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* Tab B: Server Path Scan */
                <div className="space-y-3">
                  <div className="flex flex-col space-y-1.5">
                    <label htmlFor="vault-path-input" className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                      宿主主机目录路径 (Absolute Path)
                      <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        id="vault-path-input"
                        type="text"
                        value={path}
                        onChange={(e) => setPath(e.target.value)}
                        disabled={isImporting}
                        className="w-full pl-3 pr-10 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono text-slate-700 bg-white"
                        placeholder="例如: /Users/username/Documents/MyObsidianVault"
                        required
                      />
                      <div className="absolute right-3 top-2.5 text-slate-400">
                        <Terminal className="h-4.5 w-4.5" />
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-400 flex items-start gap-1 leading-normal mt-1 bg-slate-50/50 p-2 rounded-lg border border-slate-100">
                      <HelpCircle className="h-3.5 w-3.5 shrink-0 text-slate-400 mt-0.5" />
                      <span>
                        <strong>Docker 环境注意：</strong>此模式为后端直接读取磁盘。若使用 Docker 部署运行，该路径必须是容器内挂载可访问的路径。例如宿主 <code className="bg-slate-100 px-0.5 py-0.1 rounded font-mono">/home/user/vaults</code> 已映射，此处应填写容器内路径。
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-50 border border-red-150 text-red-600 text-xs rounded-xl flex items-start gap-2 animate-shake shadow-sm">
                  <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Actions Footer */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isImporting}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-all focus:outline-none disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isImporting || (activeTab === "upload" && selectedFiles.length === 0)}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 focus:outline-none shadow-sm shadow-indigo-500/10"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {activeTab === "upload" ? "正在传输并解析 Vault..." : "正在扫描并入库..."}
                    </>
                  ) : (
                    "开始导入"
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* Results Summary View */
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50/80 border border-emerald-150 rounded-xl text-xs text-slate-700 space-y-2 shadow-sm">
                <div className="flex items-center gap-2 text-emerald-700 font-bold">
                  <CheckCircle2 className="h-5 w-5 shrink-0 animate-scale-in" />
                  <span>Obsidian Vault 智能导入流程已执行完毕</span>
                </div>
                
                <div className="grid grid-cols-3 gap-2.5 pt-2 select-none text-center">
                  <div className="bg-white border border-slate-100 p-2.5 rounded-lg shadow-sm">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">扫描到文档</span>
                    <span className="text-base font-black text-slate-700 font-mono mt-0.5 block">{result.total_found}</span>
                  </div>
                  <div className="bg-white border border-slate-100 p-2.5 rounded-lg shadow-sm">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block text-emerald-600">成功暂存</span>
                    <span className="text-base font-black text-emerald-600 font-mono mt-0.5 block">{result.imported}</span>
                  </div>
                  <div className="bg-white border border-slate-100 p-2.5 rounded-lg shadow-sm">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block text-red-500">导入失败</span>
                    <span className={`text-base font-black font-mono mt-0.5 block ${result.failed > 0 ? "text-red-500 font-bold" : "text-slate-400"}`}>{result.failed}</span>
                  </div>
                </div>
              </div>

              {/* Failed Files Details List */}
              {result.errors.length > 0 && (
                <div className="space-y-1.5 animate-fade-in">
                  <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                    部分文件解析异常明细 ({result.failed} 项)
                  </span>
                  <div className="border border-slate-150 rounded-xl overflow-hidden text-[10px] max-h-32 overflow-y-auto font-mono divide-y divide-slate-100 bg-white">
                    {result.errors.map((err, idx) => (
                      <div key={idx} className="p-2.5 bg-slate-50/30 flex justify-between gap-4 hover:bg-slate-50">
                        <span className="text-slate-600 truncate max-w-xs">{err.file}</span>
                        <span className="text-red-500 text-right shrink-0 font-sans">{err.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-[10px] text-slate-400 bg-slate-50 p-3 rounded-lg border border-slate-100 leading-relaxed shadow-sm">
                提示: 成功导入的文档已录入物理节点，系统正在后台进行
                <span className="font-semibold text-indigo-600"> 异步向量切片与向量索引(FAISS)构建 </span>。
                您可以关闭此窗口并回到文档列表，实时刷新并观察文档的处理状态。
              </div>

              {/* Close Button */}
              <div className="pt-2 border-t border-slate-100 flex justify-end shrink-0">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-all focus:outline-none shadow-sm shadow-indigo-500/10 hover:shadow-indigo-500/20"
                >
                  我知道了，关闭
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
