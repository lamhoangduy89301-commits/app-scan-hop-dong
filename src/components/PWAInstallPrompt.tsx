'use client';

import React, { useState, useEffect } from 'react';
import { Download, X, Share2, PlusSquare } from 'lucide-react';

interface PWAInstallPromptProps {
  deferredPrompt: any;
  onInstallClicked: () => void;
}

export const PWAInstallPrompt: React.FC<PWAInstallPromptProps> = ({
  deferredPrompt,
  onInstallClicked,
}) => {
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if already running as installed PWA
    const isStandaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(isStandaloneMode);

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);
  }, []);

  // If already installed or dismissed, do not show banner
  if (isStandalone || dismissed) return null;

  // Show banner only if either native prompt is ready OR on iOS Safari
  if (!deferredPrompt && !isIOS) return null;

  return (
    <>
      {/* Floating Bottom Install Banner */}
      <div className="fixed bottom-4 inset-x-4 max-w-md mx-auto z-40 bg-slate-900/95 backdrop-blur-md border border-blue-500/40 rounded-2xl p-3.5 shadow-2xl text-white flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-5">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shrink-0 shadow-md shadow-blue-600/30">
            <Download className="w-5 h-5 text-white" />
          </div>
          <div className="overflow-hidden">
            <p className="font-bold text-xs text-white truncate">Cài đặt ứng dụng Scan HĐ</p>
            <p className="text-[11px] text-slate-400 truncate">Dùng nhanh và mượt như app thật</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => {
              if (deferredPrompt) {
                onInstallClicked();
              } else if (isIOS) {
                setShowIOSModal(true);
              }
            }}
            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md shadow-blue-600/30 transition active:scale-95"
          >
            Cài đặt
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* iOS Safari Instruction Modal */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl max-w-sm w-full space-y-4 text-white">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="font-bold text-sm">Cài đặt trên iPhone / iPad</h4>
              <button
                onClick={() => setShowIOSModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-800/80">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
                  1
                </div>
                <div className="flex items-center gap-1.5">
                  <span>Bấm vào biểu tượng</span>
                  <Share2 className="w-4 h-4 text-blue-400 inline" />
                  <span>(Chia sẻ) ở thanh dưới Safari</span>
                </div>
              </div>

              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-800/80">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
                  2
                </div>
                <div className="flex items-center gap-1.5">
                  <span>Cuộn xuống và chọn</span>
                  <span className="font-bold text-white flex items-center gap-1">
                    <PlusSquare className="w-4 h-4 text-emerald-400" /> Thêm vào MH chính
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-800/80">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
                  3
                </div>
                <span>Bấm "Thêm" ở góc trên bên phải để hoàn tất</span>
              </div>
            </div>

            <button
              onClick={() => setShowIOSModal(false)}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs"
            >
              Đã hiểu
            </button>
          </div>
        </div>
      )}
    </>
  );
};
