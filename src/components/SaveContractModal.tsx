'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  CloudUpload,
  Download,
  Folder,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check,
  FileCheck,
  Sparkles,
  Loader2,
  FileText,
  CreditCard,
  Layers,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { CompressionLevel, PageOrientation, ScannedPage, GoogleUser } from '@/types';
import {
  downloadPdfBlob,
  estimatePdfSize,
  formatFileSize,
  generateContractPdf,
} from '@/lib/pdfGenerator';
import { uploadPdfToDrive } from '@/lib/googleDrive';
import { saveContractToHistory } from '@/lib/storage';

interface SaveContractModalProps {
  isOpen: boolean;
  pages: ScannedPage[];
  user: GoogleUser | null;
  selectedFolder: { id: string; name: string; path?: string };
  onOpenFolderPicker: () => void;
  onClose: () => void;
  onSuccess: () => void;
}

export const SaveContractModal: React.FC<SaveContractModalProps> = ({
  isOpen,
  pages,
  user,
  selectedFolder,
  onOpenFolderPicker,
  onClose,
  onSuccess,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];

  const [customerName, setCustomerName] = useState('');
  const [contractDate, setContractDate] = useState(todayStr);
  const [customFileName, setCustomFileName] = useState('');
  const [compression, setCompression] = useState<CompressionLevel>('balanced');
  const [orientation, setOrientation] = useState<PageOrientation>('portrait');
  const [isCCCDMode, setIsCCCDMode] = useState<boolean>(false);

  // Upload & Progress states
  const [status, setStatus] = useState<'idle' | 'generating' | 'uploading' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [uploadPercent, setUploadPercent] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  // Result state
  const [uploadedDriveLink, setUploadedDriveLink] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [cachedBlob, setCachedBlob] = useState<Blob | null>(null);

  // Keep file name synchronized with customer name and date
  useEffect(() => {
    const cleanCustomer = customerName
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove accents
      .replace(/[^a-zA-Z0-9]/g, '_');
    const baseName = cleanCustomer ? `HopDong_${cleanCustomer}_${contractDate}` : `HopDong_${contractDate}`;
    setCustomFileName(baseName);
  }, [customerName, contractDate]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStatus('idle');
      setStatusMessage('');
      setUploadPercent(0);
      setErrorMessage('');
      setUploadedDriveLink('');
      setCopiedLink(false);
      setCachedBlob(null);
      // Auto enable CCCD mode if exactly 2 pages
      if (pages.length === 2) {
        setIsCCCDMode(true);
      }
    }
  }, [isOpen, pages.length]);

  const estimatedSize = estimatePdfSize(pages.length, compression, isCCCDMode);

  // Trigger Confetti
  const fireCelebration = () => {
    try {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.7 },
      });
    } catch {}
  };

  // Generate PDF only (for download)
  const handleDownloadOnly = async () => {
    if (pages.length === 0) return;
    setStatus('generating');
    setStatusMessage('Đang kết xuất tệp PDF...');
    try {
      const result = await generateContractPdf(
        pages,
        { compression, orientation, isCCCDMode },
        (p) => setStatusMessage(p.message)
      );

      const fileName = `${customFileName}.pdf`;
      downloadPdfBlob(result.blob, fileName);
      setCachedBlob(result.blob);

      // Save to local history
      saveContractToHistory({
        id: `contract_${Date.now()}`,
        fileName,
        customerName: customerName.trim() || 'Khách hàng',
        createdAt: Date.now(),
        pageCount: pages.length,
        fileSizeBytes: result.fileSizeBytes,
        folderName: 'Tải về máy',
        thumbnailDataUrl: pages[0]?.thumbnailUrl,
      });

      setStatus('success');
      fireCelebration();
    } catch (err: any) {
      console.error('Lỗi tạo PDF:', err);
      setStatus('error');
      setErrorMessage(err?.message || 'Không thể tạo tệp PDF');
    }
  };

  // Generate PDF and Upload to Google Drive
  const handleUploadToDrive = async () => {
    if (!user) {
      setStatus('error');
      setErrorMessage('Bạn chưa đăng nhập tài khoản Google. Vui lòng đăng nhập hoặc chọn "Tải PDF về máy".');
      return;
    }

    setStatus('generating');
    setStatusMessage('Đang nén ảnh & kết xuất tệp PDF...');
    setErrorMessage('');

    try {
      // 1. Generate PDF
      const pdfResult = await generateContractPdf(
        pages,
        { compression, orientation, isCCCDMode },
        (p) => setStatusMessage(p.message)
      );

      setCachedBlob(pdfResult.blob);

      // 2. Upload to Google Drive
      setStatus('uploading');
      setStatusMessage('Đang tải lên Google Drive...');
      setUploadPercent(5);

      const uploadResult = await uploadPdfToDrive(
        user.accessToken,
        pdfResult.blob,
        `${customFileName}.pdf`,
        selectedFolder.id,
        (percent) => setUploadPercent(percent)
      );

      setUploadedDriveLink(uploadResult.driveLink);

      // 3. Save to local history
      saveContractToHistory({
        id: `contract_${Date.now()}`,
        fileName: `${customFileName}.pdf`,
        customerName: customerName.trim() || 'Khách hàng',
        createdAt: Date.now(),
        pageCount: pages.length,
        fileSizeBytes: pdfResult.fileSizeBytes,
        driveFileId: uploadResult.fileId,
        driveFileUrl: uploadResult.driveLink,
        folderId: selectedFolder.id,
        folderName: selectedFolder.name,
        thumbnailDataUrl: pages[0]?.thumbnailUrl,
      });

      setStatus('success');
      fireCelebration();
    } catch (err: any) {
      console.error('Lỗi tải lên Drive:', err);
      setStatus('error');
      setErrorMessage(err?.message || 'Tải lên Google Drive thất bại. Vui lòng thử lại hoặc tải về máy.');
    }
  };

  // Copy Drive Link
  const handleCopyLink = () => {
    if (!uploadedDriveLink) return;
    navigator.clipboard.writeText(uploadedDriveLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl text-white animate-in fade-in slide-in-from-bottom-6 duration-200">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <FileCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Xuất & Lưu Hợp Đồng PDF</h3>
              <p className="text-[11px] text-slate-400">
                {pages.length} trang đã quét • Ước tính ~{formatFileSize(estimatedSize)}
              </p>
            </div>
          </div>

          {status !== 'generating' && status !== 'uploading' && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          {/* SUCCESS VIEW */}
          {status === 'success' ? (
            <div className="py-6 text-center space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center border border-emerald-500/30 animate-bounce">
                <CheckCircle2 className="w-9 h-9" />
              </div>

              <div>
                <h4 className="font-bold text-base text-white">Xuất hợp đồng thành công!</h4>
                <p className="text-slate-400 text-xs mt-1">
                  {uploadedDriveLink
                    ? `Đã lưu tệp vào Google Drive (${selectedFolder.name})`
                    : 'Đã tải tệp PDF về máy thành công'}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 space-y-2 max-w-xs mx-auto">
                {uploadedDriveLink && (
                  <>
                    <a
                      href={uploadedDriveLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Mở file trên Google Drive</span>
                    </a>

                    <button
                      onClick={handleCopyLink}
                      className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold flex items-center justify-center gap-2 border border-slate-700 transition"
                    >
                      {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      <span>{copiedLink ? 'Đã sao chép link!' : 'Sao chép liên kết Drive'}</span>
                    </button>
                  </>
                )}

                {cachedBlob && (
                  <button
                    onClick={() => downloadPdfBlob(cachedBlob, `${customFileName}.pdf`)}
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium flex items-center justify-center gap-2 border border-slate-700 transition"
                  >
                    <Download className="w-4 h-4" />
                    <span>Tải bản sao về máy</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    onSuccess();
                    onClose();
                  }}
                  className="w-full py-2 px-4 rounded-xl text-slate-400 hover:text-white font-medium text-xs mt-2"
                >
                  Tiến hành quét hợp đồng mới
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* ERROR ALERT */}
              {status === 'error' && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300">
                  <p className="font-semibold text-xs mb-1">Lỗi xuất tệp:</p>
                  <p className="text-[11px] leading-relaxed">{errorMessage}</p>
                </div>
              )}

              {/* PROGRESS BAR VIEW */}
              {(status === 'generating' || status === 'uploading') && (
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="flex items-center gap-2 text-blue-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{statusMessage}</span>
                    </span>
                    {status === 'uploading' && <span>{uploadPercent}%</span>}
                  </div>

                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-emerald-400 h-full rounded-full transition-all duration-300"
                      style={{
                        width:
                          status === 'generating'
                            ? '45%'
                            : `${Math.max(10, uploadPercent)}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* File Info Form */}
              <div className="space-y-3">
                {/* Customer Name */}
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Tên khách hàng / Hợp đồng:</label>
                  <input
                    type="text"
                    placeholder="Ví dụ: Nguyen Van A - Xe AirBlade"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full bg-slate-800 text-white px-3 py-2 rounded-xl border border-slate-700 focus:outline-none focus:border-blue-500 text-xs"
                  />
                </div>

                {/* File Name Preview */}
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Tên file PDF xuất:</label>
                  <div className="flex items-center gap-2 bg-slate-950 px-3 py-2 rounded-xl border border-slate-800 text-slate-300 font-mono text-[11px]">
                    <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span className="truncate">{customFileName}.pdf</span>
                  </div>
                </div>

                {/* Destination Drive Folder */}
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Thư mục lưu trên Google Drive:</label>
                  <div className="flex items-center justify-between bg-slate-800 p-2.5 rounded-xl border border-slate-700">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <Folder className="w-4 h-4 text-amber-400 shrink-0" />
                      <div className="truncate">
                        <p className="font-semibold text-xs text-white truncate">{selectedFolder.name}</p>
                        {selectedFolder.path && (
                          <p className="text-[10px] text-slate-400 truncate">{selectedFolder.path}</p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={onOpenFolderPicker}
                      className="shrink-0 px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white text-[11px] font-semibold transition"
                    >
                      Đổi thư mục
                    </button>
                  </div>
                </div>

                {/* Compression Level Selector */}
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Mức nén ảnh:</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'high', label: 'Nhẹ', desc: 'Ảnh nét cao' },
                      { id: 'balanced', label: 'Cân bằng', desc: 'Gợi ý (~250KB)' },
                      { id: 'low', label: 'Nhỏ nhất', desc: 'Siêu nén' },
                    ].map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setCompression(c.id as CompressionLevel)}
                        className={`p-2 rounded-xl border text-center transition ${
                          compression === c.id
                            ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                        }`}
                      >
                        <p className="font-bold text-xs">{c.label}</p>
                        <p className="text-[10px] text-slate-400">{c.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* PDF Page Layout & CCCD Toggle */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {/* Orientation */}
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Khổ giấy A4:</label>
                    <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
                      <button
                        onClick={() => setOrientation('portrait')}
                        className={`flex-1 py-1 rounded-lg text-xs font-semibold ${
                          orientation === 'portrait' ? 'bg-blue-600 text-white' : 'text-slate-400'
                        }`}
                      >
                        Dọc
                      </button>
                      <button
                        onClick={() => setOrientation('landscape')}
                        className={`flex-1 py-1 rounded-lg text-xs font-semibold ${
                          orientation === 'landscape' ? 'bg-blue-600 text-white' : 'text-slate-400'
                        }`}
                      >
                        Ngang
                      </button>
                    </div>
                  </div>

                  {/* CCCD 2-sided Mode */}
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Chế độ CCCD:</label>
                    <button
                      onClick={() => setIsCCCDMode(!isCCCDMode)}
                      className={`w-full py-1.5 px-2 rounded-xl border flex items-center justify-center gap-1.5 transition text-xs font-semibold ${
                        isCCCDMode
                          ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>{isCCCDMode ? 'Ghép 2 mặt' : 'Từng trang'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer Controls */}
        {status !== 'success' && (
          <div className="p-4 bg-slate-900 border-t border-slate-800 flex flex-col sm:flex-row items-center gap-2">
            <button
              onClick={handleUploadToDrive}
              disabled={status === 'generating' || status === 'uploading'}
              className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition active:scale-95"
            >
              <CloudUpload className="w-4 h-4" />
              <span>{user ? 'Lưu thẳng lên Drive' : 'Đăng nhập & Lưu Drive'}</span>
            </button>

            <button
              onClick={handleDownloadOnly}
              disabled={status === 'generating' || status === 'uploading'}
              className="w-full sm:w-auto py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs flex items-center justify-center gap-2 border border-slate-700 transition active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>Tải PDF về máy</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
