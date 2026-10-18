'use client';

import React, { useState, useEffect } from 'react';
import {
  Folder,
  FolderPlus,
  ChevronRight,
  ArrowLeft,
  X,
  Check,
  Clock,
  Search,
  Loader2,
  HardDrive,
  RefreshCw,
} from 'lucide-react';
import { DriveFolder } from '@/types';
import {
  createDriveFolder,
  getRecentFolders,
  listDriveFolders,
  RecentFolder,
  saveRecentFolder,
} from '@/lib/googleDrive';

interface BreadcrumbItem {
  id: string;
  name: string;
}

interface GoogleDriveFolderPickerModalProps {
  isOpen: boolean;
  accessToken: string;
  initialFolderId?: string;
  initialFolderName?: string;
  onClose: () => void;
  onSelectFolder: (folder: { id: string; name: string; path: string }) => void;
}

export const GoogleDriveFolderPickerModal: React.FC<GoogleDriveFolderPickerModalProps> = ({
  isOpen,
  accessToken,
  initialFolderId = 'root',
  initialFolderName = 'Drive của tôi',
  onClose,
  onSelectFolder,
}) => {
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
    { id: 'root', name: 'Drive của tôi' },
  ]);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [recentFolders, setRecentFolders] = useState<RecentFolder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Create new folder state
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isSubmittingNewFolder, setIsSubmittingNewFolder] = useState(false);

  const currentFolder = breadcrumbs[breadcrumbs.length - 1];

  // Load recent folders
  useEffect(() => {
    if (isOpen) {
      setRecentFolders(getRecentFolders());
    }
  }, [isOpen]);

  // Fetch folders for current directory
  const loadFolders = async (folderId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const list = await listDriveFolders(accessToken, folderId);
      setFolders(list);
    } catch (err: any) {
      console.error('Lỗi tải thư mục Drive:', err);
      setError(err?.message || 'Không thể tải danh sách thư mục từ Google Drive');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && accessToken) {
      loadFolders(currentFolder.id);
    }
  }, [isOpen, accessToken, currentFolder.id]);

  // Navigate into subfolder
  const handleOpenFolder = (folder: DriveFolder) => {
    setSearchQuery('');
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
  };

  // Navigate back to ancestor via breadcrumb
  const handleBreadcrumbClick = (index: number) => {
    setSearchQuery('');
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
  };

  // Navigate back 1 level
  const handleGoBack = () => {
    if (breadcrumbs.length > 1) {
      setBreadcrumbs((prev) => prev.slice(0, -1));
    }
  };

  // Create new folder
  const handleCreateNewFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim() || isSubmittingNewFolder) return;

    setIsSubmittingNewFolder(true);
    setError(null);
    try {
      const created = await createDriveFolder(accessToken, newFolderName.trim(), currentFolder.id);
      setFolders((prev) => [created, ...prev]);
      setNewFolderName('');
      setIsCreatingFolder(false);
      // Automatically step into the created folder
      setBreadcrumbs((prev) => [...prev, { id: created.id, name: created.name }]);
    } catch (err: any) {
      setError(err?.message || 'Không thể tạo thư mục mới');
    } finally {
      setIsSubmittingNewFolder(false);
    }
  };

  // Select current folder
  const handleConfirmSelect = (folderId: string, folderName: string) => {
    const fullPath = breadcrumbs.map((b) => b.name).join(' / ');
    saveRecentFolder({ id: folderId, name: folderName, breadcrumb: fullPath });
    onSelectFolder({ id: folderId, name: folderName, path: fullPath });
    onClose();
  };

  // Filter folders by search
  const filteredFolders = folders.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl max-h-[88vh] flex flex-col overflow-hidden shadow-2xl text-white animate-in fade-in slide-in-from-bottom-6 duration-200">
        {/* Top Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
              <Folder className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Chọn thư mục lưu trên Google Drive</h3>
              <p className="text-[11px] text-slate-400">Chọn hoặc tạo thư mục khách hàng mới</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Recent Folders Quick Selection */}
        {recentFolders.length > 0 && (
          <div className="px-4 py-2 bg-slate-950/60 border-b border-slate-800/80">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 mb-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              <span>Thư mục gần đây:</span>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {recentFolders.map((rf) => (
                <button
                  key={rf.id}
                  onClick={() => handleConfirmSelect(rf.id, rf.name)}
                  className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-800 hover:bg-blue-600 text-[11px] text-slate-200 hover:text-white border border-slate-700 transition"
                  title={rf.breadcrumb || rf.name}
                >
                  <Folder className="w-3 h-3 text-blue-400" />
                  <span className="max-w-[120px] truncate">{rf.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Breadcrumb Navigation Bar */}
        <div className="px-4 py-2.5 bg-slate-800/50 border-b border-slate-800 flex items-center gap-1 overflow-x-auto text-xs">
          {breadcrumbs.length > 1 && (
            <button
              onClick={handleGoBack}
              className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white mr-1"
              title="Quay lại thư mục cha"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          )}

          <div className="flex items-center gap-1 whitespace-nowrap">
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <React.Fragment key={crumb.id}>
                  {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
                  <button
                    onClick={() => handleBreadcrumbClick(idx)}
                    className={`px-1.5 py-0.5 rounded transition ${
                      isLast
                        ? 'font-bold text-blue-400 bg-blue-500/10'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                    }`}
                  >
                    {crumb.name}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Search & New Folder Toolbar */}
        <div className="p-3 border-b border-slate-800 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm thư mục con..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-800 text-xs text-white pl-8 pr-3 py-1.5 rounded-xl border border-slate-700 focus:outline-none focus:border-blue-500"
            />
          </div>

          <button
            onClick={() => setIsCreatingFolder(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-emerald-400 border border-slate-700 transition shrink-0 active:scale-95"
          >
            <FolderPlus className="w-4 h-4" />
            <span>Tạo mới</span>
          </button>
        </div>

        {/* Create Folder Form Modal / Inline Box */}
        {isCreatingFolder && (
          <form
            onSubmit={handleCreateNewFolder}
            className="p-3 bg-slate-800/80 border-b border-slate-700 flex items-center gap-2 animate-in fade-in duration-150"
          >
            <input
              type="text"
              placeholder="Nhập tên thư mục mới..."
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              autoFocus
              className="flex-1 bg-slate-900 text-xs text-white px-3 py-2 rounded-xl border border-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!newFolderName.trim() || isSubmittingNewFolder}
              className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
            >
              {isSubmittingNewFolder ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              <span>Tạo</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsCreatingFolder(false);
                setNewFolderName('');
              }}
              className="px-2.5 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs"
            >
              Huỷ
            </button>
          </form>
        )}

        {/* Folder List Content */}
        <div className="flex-1 overflow-y-auto p-3 min-h-[200px]">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              <span className="text-xs">Đang tải danh sách thư mục...</span>
            </div>
          ) : error ? (
            <div className="py-8 text-center text-rose-400 text-xs px-4">
              <p className="mb-3">{error}</p>
              <button
                onClick={() => loadFolders(currentFolder.id)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs border border-slate-700"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Thử lại</span>
              </button>
            </div>
          ) : filteredFolders.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              <Folder className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="font-semibold text-slate-300">
                {searchQuery ? 'Không tìm thấy thư mục nào phù hợp' : 'Chưa có thư mục con nào'}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Bạn có thể chọn lưu trực tiếp vào thư mục hiện tại này.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredFolders.map((folder) => (
                <div
                  key={folder.id}
                  onClick={() => handleOpenFolder(folder)}
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-800/80 cursor-pointer border border-transparent hover:border-slate-700/60 transition group"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 group-hover:bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 transition">
                      <Folder className="w-4 h-4 fill-current" />
                    </div>
                    <span className="text-xs font-semibold text-slate-200 group-hover:text-white truncate">
                      {folder.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleConfirmSelect(folder.id, folder.name);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white text-[11px] font-semibold transition"
                    >
                      Chọn
                    </button>
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Confirmation */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-3">
          <div className="overflow-hidden">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Thư mục chọn:</p>
            <p className="text-xs font-bold text-blue-400 truncate">{currentFolder.name}</p>
          </div>

          <button
            onClick={() => handleConfirmSelect(currentFolder.id, currentFolder.name)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/30 transition active:scale-95 shrink-0"
          >
            <Check className="w-4 h-4 stroke-[2.5]" />
            <span>Chọn thư mục này</span>
          </button>
        </div>
      </div>
    </div>
  );
};
