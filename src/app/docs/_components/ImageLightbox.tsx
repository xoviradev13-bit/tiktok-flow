"use client";

import React, { useEffect } from "react";
import { X, ZoomIn } from "lucide-react";

interface ImageLightboxProps {
  src: string | null;
  alt?: string;
  onClose: () => void;
}

export function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (src) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [src, onClose]);

  if (!src) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-6 cursor-zoom-out animate-fadeIn"
      onClick={onClose}
    >
      {/* Fixed, highly visible close button */}
      <button
        type="button"
        onClick={onClose}
        className="fixed top-4 right-4 z-[1010] flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-slate-900/90 hover:bg-rose-600 text-white text-xs font-bold border border-white/20 shadow-2xl transition-all cursor-pointer hover:scale-105"
        aria-label="Đóng hình ảnh phóng to"
      >
        <X className="w-4 h-4" />
        <span>Đóng (Esc)</span>
      </button>

      <div
        className="relative max-w-6xl max-h-[92vh] w-full flex flex-col items-center cursor-default pt-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-none overflow-hidden border border-white/20 bg-black/90 shadow-2xl max-h-[84vh] flex items-center justify-center">
          <img
            src={src}
            alt={alt || "Ảnh phóng to"}
            className="w-auto h-auto max-w-full max-h-[84vh] object-contain select-none rounded-none"
          />
        </div>

        {alt && (
          <p className="text-xs sm:text-sm text-slate-300 mt-2.5 text-center bg-black/80 px-4 py-1.5 rounded-full border border-white/10 backdrop-blur-sm max-w-2xl shadow-lg">
            {alt}
          </p>
        )}
      </div>
    </div>
  );
}

interface ZoomableImageProps {
  src: string;
  alt: string;
  className?: string;
  containerClassName?: string;
  onZoom: (src: string, alt: string) => void;
}

export function ZoomableImage({
  src,
  alt,
  className = "w-full h-auto object-cover",
  containerClassName = "",
  onZoom,
}: ZoomableImageProps) {
  return (
    <div
      className={`relative group cursor-zoom-in overflow-hidden ${containerClassName}`}
      onClick={() => onZoom(src, alt)}
      title="Nhấp để phóng to ảnh"
    >
      <img src={src} alt={alt} className={`${className} transition-transform duration-300 group-hover:scale-[1.015]`} loading="lazy" />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/75 text-white text-xs font-semibold backdrop-blur-xs border border-white/20 shadow-lg transform translate-y-1 group-hover:translate-y-0 transition-all">
          <ZoomIn className="w-3.5 h-3.5" />
          <span>Phóng to ảnh</span>
        </span>
      </div>
    </div>
  );
}
