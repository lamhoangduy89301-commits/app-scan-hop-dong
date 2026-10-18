'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Check, RotateCw, Crop, Sliders, Wand2, RefreshCw, Sun, Contrast } from 'lucide-react';
import { CropQuad, FilterMode, Point, ScannedPage } from '@/types';
import { detectDocumentCorners, getDefaultCropQuad, processScannedImage } from '@/lib/imageProcessing';

interface CropAndFilterModalProps {
  page: ScannedPage | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedPage: ScannedPage, applyFilterToAll: boolean) => void;
}

export const CropAndFilterModal: React.FC<CropAndFilterModalProps> = ({
  page,
  isOpen,
  onClose,
  onSave,
}) => {
  const [activeTab, setActiveTab] = useState<'crop' | 'filter'>('crop');
  const [quad, setQuad] = useState<CropQuad>(getDefaultCropQuad());
  const [rotation, setRotation] = useState<number>(0);
  const [filter, setFilter] = useState<FilterMode>('magic_color');
  const [brightness, setBrightness] = useState<number>(0);
  const [contrast, setContrast] = useState<number>(0);
  const [applyToAll, setApplyToAll] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');

  // Dragging corner state
  const [draggingCorner, setDraggingCorner] = useState<keyof CropQuad | null>(null);
  const [touchPoint, setTouchPoint] = useState<Point | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Initialize state when modal opens with page data
  useEffect(() => {
    if (page && isOpen) {
      setQuad({ ...page.cropQuad });
      setRotation(page.rotation);
      setFilter(page.filter);
      setBrightness(page.brightness);
      setContrast(page.contrast);
      setPreviewUrl(page.processedDataUrl);
      setApplyToAll(false);
      setActiveTab('crop');
    }
  }, [page, isOpen]);

  // Update preview when filters or adjustments change
  useEffect(() => {
    if (!page || !isOpen) return;

    let isMounted = true;
    const updatePreview = async () => {
      setIsProcessing(true);
      try {
        const res = await processScannedImage(
          page.originalDataUrl,
          quad,
          rotation,
          filter,
          brightness,
          contrast,
          800, // fast preview size
          0.7
        );
        if (isMounted) setPreviewUrl(res.processedDataUrl);
      } catch (err) {
        console.error('Preview error:', err);
      } finally {
        if (isMounted) setIsProcessing(false);
      }
    };

    const timeout = setTimeout(updatePreview, 120);
    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
  }, [page, quad, rotation, filter, brightness, contrast, isOpen]);

  // Rotate 90 degrees clockwise
  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // Reset Quad to full image
  const handleResetQuad = () => {
    setQuad(getDefaultCropQuad());
  };

  // Auto detect corners
  const handleAutoDetect = async () => {
    if (!page) return;
    setIsProcessing(true);
    try {
      const detected = await detectDocumentCorners(page.originalDataUrl, true);
      setQuad(detected);
    } finally {
      setIsProcessing(false);
    }
  };

  // Drag Corner Logic
  const handlePointerDown = (corner: keyof CropQuad, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingCorner(corner);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingCorner || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

      setTouchPoint({ x: e.clientX, y: e.clientY });
      setQuad((prev) => ({
        ...prev,
        [draggingCorner]: { x, y },
      }));
    },
    [draggingCorner]
  );

  const handlePointerUp = (e: React.PointerEvent) => {
    if (draggingCorner) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      setDraggingCorner(null);
      setTouchPoint(null);
    }
  };

  // Save changes
  const handleSave = async () => {
    if (!page) return;
    setIsProcessing(true);
    try {
      const finalRes = await processScannedImage(
        page.originalDataUrl,
        quad,
        rotation,
        filter,
        brightness,
        contrast,
        2200,
        0.8
      );

      const updated: ScannedPage = {
        ...page,
        cropQuad: quad,
        rotation,
        filter,
        brightness,
        contrast,
        processedDataUrl: finalRes.processedDataUrl,
        thumbnailUrl: finalRes.thumbnailUrl,
        width: finalRes.width,
        height: finalRes.height,
        warning: finalRes.warning,
      };

      onSave(updated, applyToAll);
      onClose();
    } catch (err) {
      console.error('Lỗi khi lưu trang:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen || !page) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col justify-between overflow-hidden select-none">
      {/* Top Bar */}
      <div className="pt-safe px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-white z-20">
        <button
          onClick={onClose}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition"
          aria-label="Huỷ"
        >
          <X className="w-5 h-5 text-slate-300" />
        </button>

        <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
          <button
            onClick={() => setActiveTab('crop')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'crop'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Crop className="w-3.5 h-3.5" />
            <span>Cắt góc</span>
          </button>
          <button
            onClick={() => setActiveTab('filter')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'filter'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Bộ lọc</span>
          </button>
        </div>

        <button
          onClick={handleSave}
          disabled={isProcessing}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow transition active:scale-95"
        >
          <Check className="w-4 h-4 stroke-[2.5]" />
          <span>Lưu</span>
        </button>
      </div>

      {/* Main Center Canvas / Image Container */}
      <div
        className="relative flex-1 flex items-center justify-center p-4 overflow-hidden touch-none"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {activeTab === 'crop' ? (
          /* CROP TAB: Interactive 4-corner polygon */
          <div
            ref={containerRef}
            className="relative max-w-full max-h-[65vh] inline-block shadow-2xl rounded-lg overflow-hidden border border-slate-700 select-none"
          >
            <img
              ref={imageRef}
              src={page.originalDataUrl}
              alt="Cắt góc tài liệu"
              className="max-w-full max-h-[65vh] object-contain pointer-events-none block"
            />

            {/* SVG Connecting Polygon */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
              <polygon
                points={`
                  ${quad.tl.x * 100}%,${quad.tl.y * 100}% 
                  ${quad.tr.x * 100}%,${quad.tr.y * 100}% 
                  ${quad.br.x * 100}%,${quad.br.y * 100}% 
                  ${quad.bl.x * 100}%,${quad.bl.y * 100}%
                `}
                fill="rgba(59, 130, 246, 0.22)"
                stroke="#3b82f6"
                strokeWidth="2.5"
                strokeDasharray="4 2"
              />
            </svg>

            {/* 4 Interactive Corner Handles */}
            {(['tl', 'tr', 'br', 'bl'] as Array<keyof CropQuad>).map((corner) => {
              const pt = quad[corner];
              const isDragging = draggingCorner === corner;
              return (
                <div
                  key={corner}
                  onPointerDown={(e) => handlePointerDown(corner, e)}
                  style={{
                    left: `${pt.x * 100}%`,
                    top: `${pt.y * 100}%`,
                  }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center cursor-move z-20 touch-none ${
                    isDragging ? 'scale-125' : 'hover:scale-110'
                  }`}
                >
                  <div className="w-5 h-5 rounded-full bg-blue-500 border-2 border-white shadow-lg ring-4 ring-blue-500/30" />
                </div>
              );
            })}
          </div>
        ) : (
          /* FILTER TAB: Processed Real-time Preview */
          <div className="relative max-w-full max-h-[65vh] flex items-center justify-center">
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Xem trước màu sắc"
                className="max-w-full max-h-[65vh] object-contain rounded-lg shadow-2xl border border-slate-700"
              />
            )}
            {isProcessing && (
              <div className="absolute inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center rounded-lg">
                <div className="w-7 h-7 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Toolbars */}
      <div className="pb-safe bg-slate-900 border-t border-slate-800 text-white z-20">
        {activeTab === 'crop' ? (
          /* Crop Controls */
          <div className="p-4 flex items-center justify-between gap-2 max-w-md mx-auto">
            <button
              onClick={handleAutoDetect}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-blue-300 border border-slate-700 transition active:scale-95"
            >
              <Wand2 className="w-4 h-4 text-blue-400" />
              <span>Tự căn góc</span>
            </button>

            <button
              onClick={handleResetQuad}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 border border-slate-700 transition active:scale-95"
            >
              <RefreshCw className="w-4 h-4 text-slate-400" />
              <span>Trọn hình</span>
            </button>

            <button
              onClick={handleRotate}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 border border-slate-700 transition active:scale-95"
            >
              <RotateCw className="w-4 h-4 text-amber-400" />
              <span>Xoay 90°</span>
            </button>
          </div>
        ) : (
          /* Filter & Sliders Controls */
          <div className="p-4 space-y-3 max-w-md mx-auto">
            {/* Filter Mode Buttons */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: 'magic_color', label: 'Màu' },
                { id: 'bw_document', label: 'Trắng đen' },
                { id: 'grayscale', label: 'Thang xám' },
                { id: 'original', label: 'Gốc' },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setFilter(m.id as FilterMode)}
                  className={`py-2 px-1 text-center rounded-xl text-xs font-semibold border transition ${
                    filter === m.id
                      ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/30'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Brightness & Contrast Sliders */}
            <div className="space-y-2 pt-1 text-xs text-slate-300">
              <div className="flex items-center gap-3">
                <Sun className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="w-16">Sáng: {brightness > 0 ? `+${brightness}` : brightness}</span>
                <input
                  type="range"
                  min="-40"
                  max="40"
                  value={brightness}
                  onChange={(e) => setBrightness(Number(e.target.value))}
                  className="flex-1 accent-blue-500 h-1.5 bg-slate-700 rounded-lg"
                />
              </div>

              <div className="flex items-center gap-3">
                <Contrast className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="w-16">Tương phản: {contrast > 0 ? `+${contrast}` : contrast}</span>
                <input
                  type="range"
                  min="-40"
                  max="40"
                  value={contrast}
                  onChange={(e) => setContrast(Number(e.target.value))}
                  className="flex-1 accent-blue-500 h-1.5 bg-slate-700 rounded-lg"
                />
              </div>
            </div>

            {/* Checkbox: Apply to all pages */}
            <label className="flex items-center gap-2 pt-1 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={applyToAll}
                onChange={(e) => setApplyToAll(e.target.checked)}
                className="w-4 h-4 accent-blue-600 rounded bg-slate-800 border-slate-700"
              />
              <span>Áp dụng bộ lọc này cho tất cả các trang khác</span>
            </label>
          </div>
        )}
      </div>
    </div>
  );
};
