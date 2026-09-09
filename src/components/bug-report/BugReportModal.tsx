"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Bug,
  X,
  Send,
  AlertTriangle,
  Sparkles,
  ShieldAlert,
  Bot,
  Puzzle,
  DollarSign,
  Palette,
  Laptop,
  CheckCircle2,
  RefreshCw,
  HelpCircle,
  UploadCloud,
  ImageIcon,
  Loader2,
  Trash2,
  Lock,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { APP_ROUTES } from "@/constants/routes.config";

interface BugReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCategory?: string;
}

const CATEGORIES = [
  { id: "GPM_SYNC", label: "GPMLogin Fleet", icon: Bot, desc: "Lỗi mở profile, đồng bộ cookie hoặc port 9495" },
  { id: "EXTENSION", label: "Companion Extension", icon: Puzzle, desc: "Lỗi cào dữ liệu, icon hoặc kết nối extension" },
  { id: "CLIENT_AGENT", label: "Client Agent Worker", icon: Laptop, desc: "Lỗi chạy ngầm Node.js Playwright" },
  { id: "REVENUE_DATA", label: "Số Liệu & Doanh Thu", icon: DollarSign, desc: "Sai lệch Creator Rewards, Views, RPM" },
  { id: "UI_UX", label: "Giao Diện & Trải Nghiệm", icon: Palette, desc: "Lỗi hiển thị, vỡ layout, theme" },
  { id: "SECURITY", label: "An Toàn & Bảo Mật", icon: ShieldAlert, desc: "Nghi vấn rò rỉ token, quyền truy cập" },
  { id: "OTHER", label: "Vấn Đề Khác", icon: HelpCircle, desc: "Các đề xuất hoặc lỗi hệ thống khác" },
];

const SEVERITIES = [
  { id: "LOW", label: "Thấp", color: "border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400" },
  { id: "MEDIUM", label: "Trung Bình", color: "border-amber-400/60 bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  { id: "HIGH", label: "Nghiêm Trọng", color: "border-orange-500/60 bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  { id: "CRITICAL", label: "Khẩn Cấp (Blocker)", color: "border-rose-500/60 bg-rose-500/10 text-rose-600 dark:text-rose-400" },
];

export default function BugReportModal({
  isOpen,
  onClose,
  defaultCategory = "GPM_SYNC",
}: BugReportModalProps) {
  const { data: session } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<any>(defaultCategory);
  const [severity, setSeverity] = useState<any>("MEDIUM");
  const [description, setDescription] = useState("");
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const [systemInfo, setSystemInfo] = useState<{
    url: string;
    userAgent: string;
    screen: string;
    timestamp: string;
  } | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSystemInfo({
        url: window.location.href,
        userAgent: navigator.userAgent,
        screen: `${window.innerWidth}x${window.innerHeight}`,
        timestamp: new Date().toISOString(),
      });
    }
  }, [isOpen]);

  const submitMutation = trpc.support.createBugReport.useMutation({
    onSuccess: (res) => {
      toast.success(res.message || "Báo cáo sự cố thành công!");
      handleReset();
      onClose();
    },
    onError: (err) => {
      toast.error(err.message || "Không thể gửi báo cáo. Vui lòng thử lại.");
    },
  });

  const handleReset = () => {
    setTitle("");
    setDescription("");
    setUploadedImages([]);
    setSeverity("MEDIUM");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (uploadedImages.length + files.length > 5) {
      toast.error("Tối đa chỉ được tải lên 5 ảnh.");
      return;
    }

    // Validate size and mime type
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.size > 5 * 1024 * 1024) {
        toast.error(`Ảnh "${f.name}" vượt quá giới hạn 5MB cho phép (${(f.size / (1024 * 1024)).toFixed(1)}MB).`);
        return;
      }
      if (!f.type.startsWith("image/")) {
        toast.error(`Tệp "${f.name}" không phải định dạng ảnh hợp lệ.`);
        return;
      }
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append("files", files[i]);
      }

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể tải ảnh lên máy chủ.");
      }

      const newUrls = data.urls || [];
      setUploadedImages((prev) => [...prev, ...newUrls].slice(0, 5));
      toast.success(`Đã tải lên ${newUrls.length} ảnh thành công!`);
    } catch (err: any) {
      toast.error(err.message || "Lỗi tải ảnh lên.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const removeImage = (index: number) => {
    setUploadedImages((prev) => prev.filter((_, i) => i !== index));
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      toast.error("Vui lòng nhập tiêu đề và mô tả sự cố.");
      return;
    }

    submitMutation.mutate({
      title: title.trim(),
      description: description.trim(),
      category,
      severity,
      screenshotUrl: uploadedImages[0] || undefined,
      screenshotUrls: uploadedImages,
      systemInfo: systemInfo || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-xl w-full shadow-2xl relative max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header - Always pinned at top */}
        <div className="p-5 sm:p-6 pb-3 sm:pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 text-white flex items-center justify-center shadow-lg shadow-pink-500/20 shrink-0">
              <Bug className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Báo Cáo Sự Cố & Góp Ý Kỹ Thuật
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Dành riêng cho thành viên nội bộ và đội ngũ kỹ thuật TikTokFlow.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form - Flex column with scrollable body and pinned footer */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-5 sm:p-6 py-4 overflow-y-auto flex-1 space-y-4 pr-3 sm:pr-4">
            {/* Category Selector */}
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">
                Phân Loại Sự Cố
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isSelected = category === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategory(cat.id)}
                      className={`flex items-center gap-2 p-2.5 rounded-xl text-left border transition-all cursor-pointer ${
                        isSelected
                          ? "border-pink-500 bg-pink-50/20 dark:bg-pink-950/30 text-pink-600 dark:text-pink-400 font-bold shadow-xs"
                          : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700"
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="text-xs truncate">{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Severity Selector */}
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">
                Mức Độ Ảnh Hưởng (Severity)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {SEVERITIES.map((sev) => {
                  const isSelected = severity === sev.id;
                  return (
                    <button
                      key={sev.id}
                      type="button"
                      onClick={() => setSeverity(sev.id)}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer text-center ${
                        isSelected
                          ? `${sev.color} ring-2 ring-pink-500/20 shadow-xs scale-[1.02]`
                          : "border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      }`}
                    >
                      {sev.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">
                Tiêu Đề Sự Cố <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ví dụ: Profile GPM không tự động mở khi nhấn Start"
                className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-pink-500"
              />
            </div>

            {/* Detailed Description */}
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">
                Mô Tả Chi Tiết & Các Bước Tái Hiện <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Mô tả cụ thể: Đang thực hiện hành động gì thì lỗi xảy ra? Mã lỗi hiện trên màn hình (nếu có)..."
                className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-pink-500 resize-y"
              />
            </div>

            {/* Supabase Image Uploader: Authenticated Users Only, Max 5 images, Max 5MB */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-pink-500" />
                  <span>Ảnh Chụp Màn Hình (Tối đa 5 ảnh, ≤ 5MB/ảnh)</span>
                </label>
                <span className="text-xs font-mono text-slate-400">
                  {uploadedImages.length}/5 ảnh
                </span>
              </div>

              {!session ? (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-500 space-y-1.5">
                  <div className="flex items-center justify-center gap-1.5 text-amber-500 font-semibold">
                    <Lock className="w-4 h-4" />
                    <span>Yêu cầu đăng nhập để tải ảnh</span>
                  </div>
                  <p className="text-xs">
                    Vui lòng <Link href={APP_ROUTES.SIGNIN} className="text-pink-500 underline font-bold">đăng nhập</Link> để tải trực tiếp ảnh chụp màn hình lên hệ thống lưu trữ.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Upload Dropzone / Button */}
                  {uploadedImages.length < 5 && (
                    <div
                      onClick={() => !isUploading && fileInputRef.current?.click()}
                      className={`p-4 rounded-xl border-2 border-dashed transition-all cursor-pointer text-center space-y-1.5 ${
                        isUploading
                          ? "border-pink-500/50 bg-pink-50/10 dark:bg-pink-950/20 cursor-wait"
                          : "border-slate-300 dark:border-slate-700 hover:border-pink-500 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-pink-50/10 dark:hover:bg-pink-950/20"
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/png, image/jpeg, image/webp, image/gif"
                        onChange={handleFileUpload}
                        className="hidden"
                        disabled={isUploading}
                      />

                      {isUploading ? (
                        <div className="flex items-center justify-center gap-2 text-xs font-semibold text-pink-500">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Đang tải ảnh lên Supabase Storage...</span>
                        </div>
                      ) : (
                        <>
                          <div className="w-8 h-8 rounded-full bg-pink-500/10 text-pink-500 flex items-center justify-center mx-auto">
                            <UploadCloud className="w-4 h-4" />
                          </div>
                          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Nhấp để chọn ảnh chụp lỗi từ máy tính
                          </div>
                          <p className="text-xs text-slate-400">
                            Hỗ trợ PNG, JPG, WEBP • Giới hạn 5MB mỗi ảnh • Tối đa 5 ảnh
                          </p>
                        </>
                      )}
                    </div>
                  )}

                  {/* Thumbnail Gallery Preview */}
                  {uploadedImages.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
                      {uploadedImages.map((url, idx) => (
                        <div
                          key={idx}
                          className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 aspect-square shadow-xs"
                        >
                          <img
                            src={url}
                            alt={`Ảnh sự cố ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removeImage(idx)}
                            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center opacity-90 hover:opacity-100 shadow-md transition-opacity cursor-pointer"
                            title="Xóa ảnh này"
                          >
                            <X className="w-3 h-3" />
                          </button>
                          <div className="absolute bottom-1 left-1 px-1.5 py-0.2 rounded text-xs font-mono bg-black/60 text-white">
                            #{idx + 1}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* System Diagnostic Badge */}
            {systemInfo && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span className="font-mono truncate max-w-[280px]">
                  URL: {systemInfo.url.replace(/https?:\/\/[^/]+/, "")}
                </span>
                <span className="font-mono font-bold">Màn hình: {systemInfo.screen}</span>
              </div>
            )}
          </div>

          {/* Submit Actions - Always pinned and visible at bottom */}
          <div className="p-4 sm:p-5 pt-3 sm:pt-4 border-t border-slate-100 dark:border-slate-800 shrink-0 flex items-center justify-end gap-3 bg-slate-50/60 dark:bg-slate-900/90 backdrop-blur-xs">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-all cursor-pointer"
            >
              Đóng
            </button>

            <button
              type="submit"
              disabled={submitMutation.isPending || isUploading || !title.trim() || !description.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white shadow-md shadow-pink-600/20 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
            >
              {submitMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Đang gửi...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Gửi Báo Cáo Kỹ Thuật</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
