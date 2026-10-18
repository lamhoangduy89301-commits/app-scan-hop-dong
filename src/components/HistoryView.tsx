'use client';

import React, { useState } from 'react';
import {
  Search,
  FileText,
  ExternalLink,
  Trash2,
  Calendar,
  Folder,
  Layers,
  HardDrive,
  Copy,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { ContractHistoryItem } from '@/types';
import { formatFileSize } from '@/lib/pdfGenerator';

interface HistoryViewProps {
  history: ContractHistoryItem[];
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onStartScan: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  history,
  onDelete,
  onClearAll,
  onStartScan,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const filtered = history.filter((item) => {
    const term = searchTerm.toLowerCase();
    return (
      item.fileName.toLowerCase().includes(term) ||
      item.customerName.toLowerCase().includes(term) ||
      (item.folderName && item.folderName.toLowerCase().includes(term))
    );
  });

  const handleCopyLink = (link: string, id: string) => {
    navigator.clipboard.writeText(link);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return `${d.toLocaleDateString('vi-VN')} ${d.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-12">
      {/* Search & Actions Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tìm theo tên khách hàng hoặc file..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900 text-xs text-white pl-9 pr-3 py-2.5 rounded-xl border border-slate-800 focus:outline-none focus:border-blue-500 shadow-sm"
          />
        </div>

        {history.length > 0 && (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 border border-slate-800 text-xs transition active:scale-95 shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Xoá lịch sử</span>
          </button>
        )}
      </div>

      {/* Confirm Clear All Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl max-w-xs w-full text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 mx-auto flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-sm text-white">Xoá toàn bộ lịch sử?</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Các tệp đã tải lên Google Drive vẫn được an toàn. Thao tác này chỉ xoá danh sách ghi nhớ trên máy này.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  onClearAll();
                  setShowClearConfirm(false);
                }}
                className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs"
              >
                Xác nhận xoá
              </button>
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
              >
                Huỷ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Items List */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center bg-slate-900/40 border border-dashed border-slate-800 rounded-3xl p-6">
          <div className="w-16 h-16 rounded-2xl bg-slate-800/80 text-slate-500 mx-auto flex items-center justify-center mb-3">
            <FileText className="w-8 h-8" />
          </div>
          <h3 className="font-bold text-slate-300 text-sm mb-1">
            {searchTerm ? 'Không tìm thấy hợp đồng phù hợp' : 'Chưa có hợp đồng nào trong lịch sử'}
          </h3>
          <p className="text-xs text-slate-500 max-w-xs mx-auto mb-5">
            {searchTerm
              ? 'Thử tìm với từ khoá khác hoặc xoá bộ lọc.'
              : 'Các tệp hợp đồng sau khi quét và xuất PDF sẽ hiển thị ở đây.'}
          </p>
          <button
            onClick={onStartScan}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-600/30 transition active:scale-95"
          >
            <FileText className="w-4 h-4" />
            <span>Bắt đầu quét ngay</span>
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="p-3.5 bg-slate-900/90 hover:bg-slate-850 rounded-2xl border border-slate-800/80 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition"
            >
              {/* Left Info */}
              <div className="flex items-start gap-3 overflow-hidden">
                {item.thumbnailDataUrl ? (
                  <img
                    src={item.thumbnailDataUrl}
                    alt={item.fileName}
                    className="w-11 h-14 object-cover rounded-lg border border-slate-700 shrink-0 shadow-xs"
                  />
                ) : (
                  <div className="w-11 h-14 rounded-lg bg-blue-600/10 text-blue-400 border border-blue-500/20 flex items-center justify-center shrink-0">
                    <FileText className="w-6 h-6" />
                  </div>
                )}

                <div className="space-y-1 overflow-hidden">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-xs sm:text-sm text-white truncate">{item.fileName}</h4>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1 text-slate-300 font-medium">
                      👤 {item.customerName}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-500" />
                      <span>{formatDate(item.createdAt)}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Layers className="w-3 h-3 text-slate-500" />
                      <span>{item.pageCount} trang</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <HardDrive className="w-3 h-3 text-slate-500" />
                      <span>{formatFileSize(item.fileSizeBytes)}</span>
                    </span>
                  </div>

                  {item.folderName && (
                    <div className="flex items-center gap-1 text-[10px] text-blue-400 font-semibold truncate">
                      <Folder className="w-3 h-3 shrink-0" />
                      <span className="truncate">{item.folderName}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Action Buttons */}
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                {item.driveFileUrl ? (
                  <>
                    <a
                      href={item.driveFileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 sm:flex-initial flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white text-xs font-semibold transition"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Mở Drive</span>
                    </a>

                    <button
                      onClick={() => handleCopyLink(item.driveFileUrl!, item.id)}
                      title="Sao chép link Drive"
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                    >
                      {copiedId === item.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </>
                ) : (
                  <span className="text-[11px] text-slate-500 italic">Đã lưu trên máy</span>
                )}

                <button
                  onClick={() => onDelete(item.id)}
                  title="Xoá mục này"
                  className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
