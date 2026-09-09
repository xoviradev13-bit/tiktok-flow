"use client";

import { useEffect, useState } from "react";
import { Download, X, Smartphone, Monitor, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    // 1. Register Service Worker
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      const registerSW = () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => {
            console.log("[PWA] Service Worker registered successfully with scope:", reg.scope);
          })
          .catch((err) => {
            console.warn("[PWA] Service Worker registration failed:", err);
          });
      };

      if (document.readyState === "complete") {
        registerSW();
      } else {
        window.addEventListener("load", registerSW);
      }
    }

    // 2. Check if already running in standalone mode (installed)
    if (
      typeof window !== "undefined" &&
      (window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as any).standalone === true)
    ) {
      setIsInstalled(true);
      return;
    }

    // 3. Detect iOS device
    const userAgent = typeof window !== "undefined" ? window.navigator.userAgent.toLowerCase() : "";
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // 4. Check if user recently dismissed prompt
    const dismissedAt = localStorage.getItem("pwa_install_dismissed");
    if (dismissedAt) {
      const hoursSinceDismiss = (Date.now() - parseInt(dismissedAt, 10)) / (1000 * 60 * 60);
      if (hoursSinceDismiss < 48) {
        setIsDismissed(true);
      }
    }

    // 5. Capture beforeinstallprompt event for Chromium browsers
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      console.log("[PWA] TIKTOKFLOW installed successfully!");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      if (isIOS) {
        setShowIOSGuide(true);
      }
      return;
    }

    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === "accepted") {
        console.log("[PWA] User accepted the install prompt");
        setIsInstalled(true);
        setIsInstallable(false);
      }
      setDeferredPrompt(null);
    } catch (err) {
      console.error("[PWA] Error triggering install prompt:", err);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem("pwa_install_dismissed", Date.now().toString());
  };

  // Don't show if already installed, dismissed, or not installable and not iOS
  if (isInstalled || isDismissed || (!isInstallable && !isIOS)) {
    return null;
  }

  return (
    <>
      {/* Floating PWA Install Notification Bar */}
      <div className="fixed bottom-5 right-5 z-50 max-w-sm w-[calc(100vw-40px)] sm:w-auto animate-in fade-in slide-in-from-bottom-5 duration-300">
        <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-900/95 dark:bg-slate-900/95 border border-pink-500/30 text-white shadow-2xl shadow-pink-500/10 backdrop-blur-xl ring-1 ring-white/10">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-pink-600 to-rose-600 flex items-center justify-center shrink-0 shadow-md shadow-pink-500/30">
            <Download className="w-5 h-5 text-white animate-bounce" />
          </div>

          <div className="flex-1 min-w-0 pr-1">
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
              <span>Cài Đặt TIKTOKFLOW</span>
              <span className="px-1.5 py-0.2 rounded-md bg-pink-500/20 text-pink-400 text-xs font-extrabold uppercase">
                App
              </span>
            </h4>
            <p className="text-xs text-slate-400 truncate mt-0.5">
              Truy cập nhanh từ màn hình chính & thanh tác vụ
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              onClick={handleInstallClick}
              className="h-8 px-3 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-bold text-xs shadow-md shadow-pink-600/20 cursor-pointer"
            >
              Cài Đặt
            </Button>
            <button
              onClick={handleDismiss}
              className="w-7 h-7 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* iOS Safari Guide Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full text-white shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-pink-500" />
                Cài Đặt Trên iOS (iPhone / iPad)
              </h3>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-6 h-6 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-xs"
              >
                ✕
              </button>
            </div>

            <ol className="text-xs space-y-3 text-slate-300">
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-pink-500/20 text-pink-400 font-bold flex items-center justify-center shrink-0 text-xs">
                  1
                </span>
                <span>
                  Nhấn vào biểu tượng <strong>Chia Sẻ (Share)</strong> ở thanh dưới cùng Safari.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-pink-500/20 text-pink-400 font-bold flex items-center justify-center shrink-0 text-xs">
                  2
                </span>
                <span>
                  Cuộn xuống và chọn <strong>&quot;Thêm vào Màn hình chính&quot; (Add to Home Screen)</strong>.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-pink-500/20 text-pink-400 font-bold flex items-center justify-center shrink-0 text-xs">
                  3
                </span>
                <span>
                  Nhấn <strong>Thêm (Add)</strong> ở góc trên bên phải để hoàn tất.
                </span>
              </li>
            </ol>

            <Button
              onClick={() => setShowIOSGuide(false)}
              className="w-full h-10 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 text-white font-bold text-xs"
            >
              Đã Hiểu
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

export default PwaInstallPrompt;
