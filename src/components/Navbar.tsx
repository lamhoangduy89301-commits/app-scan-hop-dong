'use client';

import React, { useState, useEffect } from 'react';
import { FileText, History, LogIn, LogOut, Download, CheckCircle2, AlertCircle } from 'lucide-react';
import { GoogleUser } from '@/types';

interface NavbarProps {
  activeTab: 'scan' | 'history';
  onTabChange: (tab: 'scan' | 'history') => void;
  user: GoogleUser | null;
  onLogin: () => void;
  onLogout: () => void;
  historyCount: number;
  isInstallable: boolean;
  onInstall: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  user,
  onLogin,
  onLogout,
  historyCount,
  isInstallable,
  onInstall,
}) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-white">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Brand / Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/25">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base md:text-lg tracking-tight text-white leading-tight">
                Scan Hợp Đồng
              </h1>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/30">
                PWA
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  isOnline ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <span>{isOnline ? 'Sẵn sàng' : 'Ngoại tuyến'}</span>
            </div>
          </div>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-2">
          {/* PWA Install Button if available */}
          {isInstallable && (
            <button
              onClick={onInstall}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition active:scale-95"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Cài ứng dụng</span>
            </button>
          )}

          {/* User Account / Google Login Button */}
          {user ? (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 p-1.5 pl-2.5 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 transition"
              >
                <span className="text-xs font-medium text-slate-200 max-w-[100px] truncate hidden md:inline">
                  {user.name}
                </span>
                {user.picture ? (
                  <img
                    src={user.picture}
                    alt={user.name}
                    className="w-7 h-7 rounded-full border border-blue-400 object-cover"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </button>

              {/* Dropdown Menu */}
              {showUserMenu && (
                <div
                  className="absolute right-0 mt-2 w-64 bg-slate-800 rounded-xl shadow-xl border border-slate-700 p-3 z-50 animate-in fade-in zoom-in-95 duration-150"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="pb-3 border-b border-slate-700/80 mb-2">
                    <p className="font-semibold text-sm text-white truncate">{user.name}</p>
                    <p className="text-xs text-slate-400 truncate">{user.email}</p>
                    <div className="flex items-center gap-1.5 mt-2 text-[11px] text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Đã liên kết Google Drive</span>
                    </div>
                  </div>

                  {isInstallable && (
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        onInstall();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-slate-700/60 rounded-lg transition mb-1 sm:hidden"
                    >
                      <Download className="w-4 h-4 text-emerald-400" />
                      <span>Cài app ra màn hình chính</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      onLogout();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Đăng xuất Google</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={onLogin}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium shadow-md shadow-blue-600/30 transition active:scale-95"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Đăng nhập Drive</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="max-w-4xl mx-auto px-4 flex gap-2 border-t border-slate-800/80">
        <button
          onClick={() => onTabChange('scan')}
          className={`flex-1 py-2.5 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 border-b-2 transition ${
            activeTab === 'scan'
              ? 'border-blue-500 text-blue-400 bg-blue-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Quét văn bản</span>
        </button>

        <button
          onClick={() => onTabChange('history')}
          className={`flex-1 py-2.5 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 border-b-2 transition ${
            activeTab === 'history'
              ? 'border-blue-500 text-blue-400 bg-blue-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Lịch sử hợp đồng</span>
          {historyCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[11px] text-slate-300 font-bold border border-slate-700">
              {historyCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};
