'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  Image as ImageIcon,
  FileCheck,
  Folder,
  Trash2,
  Sparkles,
  Cloud,
  ShieldCheck,
  Zap,
  Info,
  Scan,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { CameraCaptureModal } from '@/components/CameraCaptureModal';
import { PageListSortable } from '@/components/PageListSortable';
import { CropAndFilterModal } from '@/components/CropAndFilterModal';
import { GoogleDriveFolderPickerModal } from '@/components/GoogleDriveFolderPickerModal';
import { SaveContractModal } from '@/components/SaveContractModal';
import { HistoryView } from '@/components/HistoryView';
import { PWAInstallPrompt } from '@/components/PWAInstallPrompt';
import { GoogleUser, ScannedPage, ContractHistoryItem } from '@/types';
import {
  clearGoogleUser,
  fetchGoogleUserInfo,
  getGoogleClientId,
  getSavedGoogleUser,
  requestGoogleAccessToken,
  saveGoogleUser,
} from '@/lib/googleDrive';
import {
  clearContractHistory,
  deleteContractHistoryItem,
  getContractHistory,
} from '@/lib/storage';
import { detectDocumentCorners, processScannedImage } from '@/lib/imageProcessing';
import { formatFileSize, estimatePdfSize } from '@/lib/pdfGenerator';

export default function HomePage() {
  // Navigation & View state
  const [activeTab, setActiveTab] = useState<'scan' | 'history'>('scan');

  // Google Auth state
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Auto Crop & Detection setting (Default: Bật)
  const [autoCropEnabled, setAutoCropEnabled] = useState<boolean>(true);

  // Scanned pages state
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [editingPage, setEditingPage] = useState<ScannedPage | null>(null);

  // Target Google Drive folder state
  const [selectedFolder, setSelectedFolder] = useState<{ id: string; name: string; path?: string }>({
    id: 'root',
    name: 'Drive của tôi',
    path: 'Drive của tôi',
  });

  // Modal open states
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);

  // History state
  const [historyItems, setHistoryItems] = useState<ContractHistoryItem[]>([]);

  // PWA install state
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  // Hidden file input for main hero import
  const mainFileInputRef = useRef<HTMLInputElement>(null);

  // Load initial data
  useEffect(() => {
    // 1. Load saved user
    const savedUser = getSavedGoogleUser();
    if (savedUser) {
      setUser(savedUser);
    }

    // 2. Load contract history
    setHistoryItems(getContractHistory());

    // 3. Listen for PWA install prompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  // Handle Google Login
  const handleLogin = async () => {
    const clientId = getGoogleClientId();
    if (!clientId) {
      alert(
        'Chưa cấu hình NEXT_PUBLIC_GOOGLE_CLIENT_ID trong biến môi trường (.env.local).\n' +
        'Bạn vẫn có thể chụp ảnh, chỉnh sửa và bấm "Tải PDF về máy".\n' +
        'Xem file README.md để biết cách tạo Client ID từ Google Cloud Console.'
      );
      return;
    }

    setIsLoggingIn(true);
    setAuthError(null);
    try {
      const accessToken = await requestGoogleAccessToken(clientId);
      const info = await fetchGoogleUserInfo(accessToken);

      const loggedUser: GoogleUser = {
        name: info.name,
        email: info.email,
        picture: info.picture,
        accessToken,
        expiresAt: Date.now() + 3500 * 1000, // ~1 hour
      };

      saveGoogleUser(loggedUser);
      setUser(loggedUser);
    } catch (err: any) {
      console.error('Login error:', err);
      setAuthError(err?.message || 'Đăng nhập Google thất bại');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Handle Google Logout
  const handleLogout = () => {
    clearGoogleUser();
    setUser(null);
  };

  // Add pages from Camera
  const handlePagesCapturedFromCamera = (newPages: ScannedPage[]) => {
    setPages((prev) => [...prev, ...newPages]);
  };

  // Add pages from File picker
  const handleAddFromGallery = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newItems: ScannedPage[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      // Pass autoCropEnabled toggle
      const quad = await detectDocumentCorners(dataUrl, autoCropEnabled);
      // Default to "Màu" (magic_color)
      const processed = await processScannedImage(
        dataUrl,
        quad,
        0,
        'magic_color',
        0,
        0,
        2000,
        0.75
      );

      newItems.push({
        id: `page_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 7)}`,
        originalDataUrl: dataUrl,
        processedDataUrl: processed.processedDataUrl,
        thumbnailUrl: processed.thumbnailUrl,
        width: processed.width,
        height: processed.height,
        rotation: 0,
        cropQuad: quad,
        filter: 'magic_color',
        brightness: 0,
        contrast: 0,
        warning: processed.warning,
        createdAt: Date.now() + i,
      });
    }

    setPages((prev) => [...prev, ...newItems]);
    if (e.target) e.target.value = '';
  };

  // Reorder pages
  const handleReorderPages = (newPages: ScannedPage[]) => {
    setPages(newPages);
  };

  // Rotate a page 90 degrees
  const handleRotatePage = async (pageId: string) => {
    const target = pages.find((p) => p.id === pageId);
    if (!target) return;

    const newRotation = (target.rotation + 90) % 360;
    const res = await processScannedImage(
      target.originalDataUrl,
      target.cropQuad,
      newRotation,
      target.filter,
      target.brightness,
      target.contrast,
      2000,
      0.75
    );

    setPages((prev) =>
      prev.map((p) =>
        p.id === pageId
          ? {
              ...p,
              rotation: newRotation,
              processedDataUrl: res.processedDataUrl,
              thumbnailUrl: res.thumbnailUrl,
              width: res.width,
              height: res.height,
              warning: res.warning,
            }
          : p
      )
    );
  };

  // Delete single page
  const handleDeletePage = (pageId: string) => {
    setPages((prev) => prev.filter((p) => p.id !== pageId));
  };

  // Clear all pages
  const handleClearAllPages = () => {
    if (confirm('Bạn có chắc chắn muốn xoá tất cả các trang đã quét hiện tại?')) {
      setPages([]);
    }
  };

  // Save changes from Crop & Filter Modal
  const handleSaveEditedPage = async (updatedPage: ScannedPage, applyFilterToAll: boolean) => {
    if (applyFilterToAll) {
      // Re-apply same filter, brightness, contrast to all other pages
      const updatedList = await Promise.all(
        pages.map(async (p) => {
          if (p.id === updatedPage.id) return updatedPage;
          const res = await processScannedImage(
            p.originalDataUrl,
            p.cropQuad,
            p.rotation,
            updatedPage.filter,
            updatedPage.brightness,
            updatedPage.contrast,
            2000,
            0.75
          );
          return {
            ...p,
            filter: updatedPage.filter,
            brightness: updatedPage.brightness,
            contrast: updatedPage.contrast,
            processedDataUrl: res.processedDataUrl,
            thumbnailUrl: res.thumbnailUrl,
            warning: res.warning,
          };
        })
      );
      setPages(updatedList);
    } else {
      setPages((prev) => prev.map((p) => (p.id === updatedPage.id ? updatedPage : p)));
    }
  };

  // Delete history item
  const handleDeleteHistory = (id: string) => {
    deleteContractHistoryItem(id);
    setHistoryItems(getContractHistory());
  };

  // Clear all history
  const handleClearHistory = () => {
    clearContractHistory();
    setHistoryItems([]);
  };

  // When a contract is successfully saved/uploaded
  const handleSaveSuccess = () => {
    setHistoryItems(getContractHistory());
    setPages([]); // Reset scan session
  };

  // Trigger PWA install
  const handleInstallPWA = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setIsInstallable(false);
      }
      setDeferredPrompt(null);
    }
  };

  const estimatedSize = estimatePdfSize(pages.length, 'balanced');
  const hasWarnings = pages.some((p) => p.warning);

  return (
    <div className="flex-1 flex flex-col bg-slate-950 text-slate-100">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        user={user}
        onLogin={handleLogin}
        onLogout={handleLogout}
        historyCount={historyItems.length}
        isInstallable={isInstallable}
        onInstall={handleInstallPWA}
      />

      {/* Auth Error Banner if any */}
      {authError && (
        <div className="max-w-4xl mx-auto px-4 pt-3 w-full">
          <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
            <span>{authError}</span>
            <button onClick={() => setAuthError(null)} className="font-bold underline ml-2">
              Đóng
            </button>
          </div>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-4 md:py-6 flex flex-col">
        {activeTab === 'history' ? (
          /* TAB 2: HISTORY VIEW */
          <HistoryView
            history={historyItems}
            onDelete={handleDeleteHistory}
            onClearAll={handleClearHistory}
            onStartScan={() => setActiveTab('scan')}
          />
        ) : (
          /* TAB 1: SCAN VIEW */
          <div className="flex-1 flex flex-col">
            {pages.length === 0 ? (
              /* EMPTY HERO VIEW */
              <div className="flex-1 flex flex-col items-center justify-center py-8 text-center max-w-lg mx-auto">
                {/* Hero Badge Icon */}
                <div className="relative mb-5">
                  <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-xl shadow-blue-500/25">
                    <Camera className="w-10 h-10 text-white" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center border-2 border-slate-950 shadow">
                    <Sparkles className="w-4 h-4 fill-current" />
                  </div>
                </div>

                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mb-2">
                  Quét Hợp Đồng & Giấy Tờ
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 max-w-sm mb-6 leading-relaxed">
                  Chụp ảnh liên tục nhiều trang, tự động nắn thẳng góc, tăng độ nét văn bản và lưu trực tiếp lên Google Drive.
                </p>

                {/* Primary Action Buttons */}
                <div className="w-full space-y-3 mb-5">
                  <button
                    onClick={() => setIsCameraOpen(true)}
                    className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-xl shadow-blue-600/30 transition active:scale-95"
                  >
                    <Camera className="w-5 h-5" />
                    <span>Chụp bằng Camera</span>
                  </button>

                  <button
                    onClick={() => mainFileInputRef.current?.click()}
                    className="w-full py-3.5 px-6 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-200 font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 border border-slate-800 transition active:scale-95"
                  >
                    <ImageIcon className="w-4 h-4 text-blue-400" />
                    <span>Chọn ảnh từ Thư viện máy</span>
                  </button>

                  <input
                    ref={mainFileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleAddFromGallery}
                    className="hidden"
                  />
                </div>

                {/* Auto Crop & Detection Toggle Switch */}
                <div className="flex items-center justify-center mb-6">
                  <button
                    onClick={() => setAutoCropEnabled(!autoCropEnabled)}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition ${
                      autoCropEnabled
                        ? 'bg-blue-600/20 border-blue-500/80 text-blue-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <Scan className="w-3.5 h-3.5" />
                    <span>Tự động cắt & nhận dạng: {autoCropEnabled ? 'BẬT' : 'TẮT'}</span>
                  </button>
                </div>

                {/* Quick Google Drive Connection Box */}
                {!user ? (
                  <div className="w-full p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 text-left flex items-center justify-between gap-3 mb-6">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
                        <Cloud className="w-5 h-5" />
                      </div>
                      <div className="overflow-hidden">
                        <p className="font-bold text-xs text-white">Lưu thẳng Google Drive</p>
                        <p className="text-[11px] text-slate-400 truncate">
                          Đăng nhập để chọn thư mục và lưu tự động
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={handleLogin}
                      disabled={isLoggingIn}
                      className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shrink-0 transition"
                    >
                      {isLoggingIn ? 'Đang kết nối...' : 'Kết nối'}
                    </button>
                  </div>
                ) : (
                  <div className="w-full p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-left flex items-center justify-between gap-3 mb-6">
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                      <div className="overflow-hidden">
                        <p className="font-bold text-xs text-emerald-300">Đã kết nối: {user.name}</p>
                        <p className="text-[11px] text-slate-400 truncate">Thư mục: {selectedFolder.name}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => setIsFolderPickerOpen(true)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold shrink-0 transition"
                    >
                      Đổi thư mục
                    </button>
                  </div>
                )}

                {/* Feature highlights */}
                <div className="grid grid-cols-2 gap-2.5 w-full text-left">
                  <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800/60">
                    <Zap className="w-4 h-4 text-amber-400 mb-1.5" />
                    <p className="font-bold text-xs text-slate-200">Xử lý ngay tại máy</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Tốc độ cực nhanh, bảo mật tuyệt đối</p>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800/60">
                    <FileCheck className="w-4 h-4 text-emerald-400 mb-1.5" />
                    <p className="font-bold text-xs text-slate-200">Xuất PDF chuẩn A4</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Hỗ trợ ghép 2 mặt CCCD vào 1 trang</p>
                  </div>
                </div>
              </div>
            ) : (
              /* ACTIVE SCAN SESSION VIEW */
              <div className="flex-1 flex flex-col pb-24">
                {/* Warning Notification if any image was restored */}
                {hasWarnings && (
                  <div className="mb-3 p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2.5">
                    <Info className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Một số ảnh có độ sáng quá tối, hệ thống đã tự động khôi phục ảnh gốc để đảm bảo chất lượng văn bản.</span>
                  </div>
                )}

                {/* Session Top Status Bar */}
                <div className="mb-4 p-3 bg-slate-900/90 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold text-xs">
                      {pages.length}
                    </div>
                    <div>
                      <h3 className="font-bold text-xs sm:text-sm text-white">
                        {pages.length} trang đã quét
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Ước tính PDF ~{formatFileSize(estimatedSize)} • Kéo thả để đổi thứ tự
                      </p>
                    </div>
                  </div>

                  {/* Destination Folder button, Auto Crop toggle, Clear button */}
                  <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
                    <button
                      onClick={() => setAutoCropEnabled(!autoCropEnabled)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition ${
                        autoCropEnabled
                          ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                      title="Bật/Tắt tự động nhận dạng viền"
                    >
                      <Scan className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Tự nhận diện:</span>
                      <span>{autoCropEnabled ? 'Bật' : 'Tắt'}</span>
                    </button>

                    <button
                      onClick={() => {
                        if (!user) {
                          handleLogin();
                        } else {
                          setIsFolderPickerOpen(true);
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold border border-slate-700 transition"
                    >
                      <Folder className="w-3.5 h-3.5 text-amber-400" />
                      <span className="max-w-[120px] truncate">{selectedFolder.name}</span>
                    </button>

                    <button
                      onClick={handleClearAllPages}
                      title="Xoá tất cả trang"
                      className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Sortable Grid of Pages */}
                <PageListSortable
                  pages={pages}
                  onReorder={handleReorderPages}
                  onRotatePage={handleRotatePage}
                  onEditPage={(page) => setEditingPage(page)}
                  onDeletePage={handleDeletePage}
                  onOpenAddCamera={() => setIsCameraOpen(true)}
                  onAddFromGallery={handleAddFromGallery}
                />
              </div>
            )}
          </div>
        )}
      </main>

      {/* Sticky Bottom Floating Bar (When pages exist) */}
      {activeTab === 'scan' && pages.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-30 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 p-3 pb-safe shadow-2xl">
          <div className="max-w-4xl mx-auto flex items-center gap-3">
            <button
              onClick={() => setIsCameraOpen(true)}
              className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 border border-slate-700 transition active:scale-95 shrink-0"
            >
              <Camera className="w-4 h-4 text-blue-400" />
              <span>Thêm ảnh</span>
            </button>

            <button
              onClick={() => setIsSaveModalOpen(true)}
              className="flex-1 py-3 px-5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition active:scale-95"
            >
              <FileCheck className="w-4 h-4" />
              <span>Xuất PDF & Lưu ({pages.length} trang)</span>
            </button>
          </div>
        </div>
      )}

      {/* MODALS */}
      {/* 1. Camera Capture Modal */}
      <CameraCaptureModal
        isOpen={isCameraOpen}
        autoCropEnabled={autoCropEnabled}
        onToggleAutoCrop={setAutoCropEnabled}
        onClose={() => setIsCameraOpen(false)}
        onPagesCaptured={handlePagesCapturedFromCamera}
      />

      {/* 2. Crop and Filter Precision Modal */}
      <CropAndFilterModal
        isOpen={Boolean(editingPage)}
        page={editingPage}
        onClose={() => setEditingPage(null)}
        onSave={handleSaveEditedPage}
      />

      {/* 3. Google Drive Folder Picker Modal */}
      {user && (
        <GoogleDriveFolderPickerModal
          isOpen={isFolderPickerOpen}
          accessToken={user.accessToken}
          initialFolderId={selectedFolder.id}
          initialFolderName={selectedFolder.name}
          onClose={() => setIsFolderPickerOpen(false)}
          onSelectFolder={(folder) => setSelectedFolder(folder)}
        />
      )}

      {/* 4. Save Contract PDF & Upload Modal */}
      <SaveContractModal
        isOpen={isSaveModalOpen}
        pages={pages}
        user={user}
        selectedFolder={selectedFolder}
        onOpenFolderPicker={() => {
          setIsSaveModalOpen(false);
          setIsFolderPickerOpen(true);
        }}
        onClose={() => setIsSaveModalOpen(false)}
        onSuccess={handleSaveSuccess}
      />

      {/* 5. PWA Install Prompt Banner */}
      <PWAInstallPrompt
        deferredPrompt={deferredPrompt}
        onInstallClicked={handleInstallPWA}
      />
    </div>
  );
}
