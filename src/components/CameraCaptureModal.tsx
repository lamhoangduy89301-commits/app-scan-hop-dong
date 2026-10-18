'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, X, Check, Image as ImageIcon, Zap, ZapOff, RefreshCw, AlertCircle, Scan, Crop } from 'lucide-react';
import { ScannedPage } from '@/types';
import { detectDocumentCorners, processScannedImage } from '@/lib/imageProcessing';

interface CameraCaptureModalProps {
  isOpen: boolean;
  autoCropEnabled: boolean;
  onToggleAutoCrop: (enabled: boolean) => void;
  onClose: () => void;
  onPagesCaptured: (newPages: ScannedPage[]) => void;
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  isOpen,
  autoCropEnabled,
  onToggleAutoCrop,
  onClose,
  onPagesCaptured,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [capturedPages, setCapturedPages] = useState<ScannedPage[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [flashAnimation, setFlashAnimation] = useState(false);

  // Initialize camera stream
  const startCamera = useCallback(async (facing: 'environment' | 'user') => {
    setCameraError(null);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Trình duyệt của bạn không hỗ trợ truy cập Camera trực tiếp. Vui lòng chọn ảnh từ thư viện.');
      }

      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }

      // Check if torch/flashlight is supported
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const capabilities: any = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
        setHasTorch(Boolean(capabilities.torch));
      }
    } catch (err: any) {
      console.error('Camera error:', err);
      let msg = 'Không thể mở Camera.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Bạn đã chặn quyền truy cập Camera. Vui lòng vào Cài đặt trình duyệt để cấp quyền Camera cho trang web.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'Không tìm thấy thiết bị Camera trên máy này.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        msg = 'Camera đang bị ứng dụng khác chiếm dụng. Vui lòng tắt các app khác đang dùng camera và thử lại.';
      }
      setCameraError(msg);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setCapturedPages([]);
      startCamera(facingMode);
    } else {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      setTorchOn(false);
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [isOpen, facingMode, startCamera]);

  // Toggle Torch
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const nextTorch = !torchOn;
      await (track as any).applyConstraints({
        advanced: [{ torch: nextTorch }],
      });
      setTorchOn(nextTorch);
    } catch (e) {
      console.warn('Torch not supported or failed', e);
    }
  };

  // Switch between Rear / Front camera
  const toggleCameraFacing = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
  };

  // Capture Photo from video stream
  const captureFrame = async () => {
    if (!videoRef.current || isCapturing) return;

    try {
      setIsCapturing(true);

      // Shutter flash effect & vibration
      setFlashAnimation(true);
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(50);
      }
      setTimeout(() => setFlashAnimation(false), 200);

      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Draw onto white background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const rawDataUrl = canvas.toDataURL('image/jpeg', 0.92);

      // Detect corners or default
      const quad = await detectDocumentCorners(rawDataUrl, autoCropEnabled);

      // Process image: default to "Màu" (magic_color)
      const processed = await processScannedImage(
        rawDataUrl,
        quad,
        0,
        'magic_color',
        0,
        0,
        2000,
        0.75
      );

      const newPage: ScannedPage = {
        id: `page_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        originalDataUrl: rawDataUrl,
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
        createdAt: Date.now(),
      };

      setCapturedPages((prev) => [...prev, newPage]);
    } catch (err) {
      console.error('Chụp ảnh thất bại:', err);
    } finally {
      setIsCapturing(false);
    }
  };

  // Handle file picker fallback
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsCapturing(true);
    const newItems: ScannedPage[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      const quad = await detectDocumentCorners(dataUrl, autoCropEnabled);
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

    setCapturedPages((prev) => [...prev, ...newItems]);
    setIsCapturing(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Done capturing
  const handleFinish = () => {
    if (capturedPages.length > 0) {
      onPagesCaptured(capturedPages);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between overflow-hidden select-none">
      {/* Top Header Bar */}
      <div className="pt-safe px-4 py-3 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between text-white z-20">
        <button
          onClick={onClose}
          className="p-2.5 rounded-full bg-slate-900/60 backdrop-blur-md hover:bg-slate-800 transition active:scale-95"
          aria-label="Đóng"
        >
          <X className="w-5 h-5 text-white" />
        </button>

        {/* Auto Crop & Detection Toggle */}
        <button
          onClick={() => onToggleAutoCrop(!autoCropEnabled)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md transition border ${
            autoCropEnabled
              ? 'bg-blue-600/80 border-blue-400 text-white shadow-sm'
              : 'bg-slate-900/60 border-slate-700 text-slate-300'
          }`}
          title="Bật/Tắt tự động cắt nắn viền giấy tờ"
        >
          <Scan className="w-3.5 h-3.5" />
          <span>Tự nhận diện: {autoCropEnabled ? 'Bật' : 'Tắt'}</span>
        </button>

        <div className="flex items-center gap-2">
          {hasTorch && (
            <button
              onClick={toggleTorch}
              className={`p-2.5 rounded-full backdrop-blur-md transition active:scale-95 ${
                torchOn ? 'bg-amber-500 text-slate-950' : 'bg-slate-900/60 text-white'
              }`}
              aria-label="Bật/Tắt Đèn Flash"
            >
              {torchOn ? <Zap className="w-5 h-5 fill-current" /> : <ZapOff className="w-5 h-5" />}
            </button>
          )}

          <button
            onClick={toggleCameraFacing}
            className="p-2.5 rounded-full bg-slate-900/60 backdrop-blur-md hover:bg-slate-800 transition active:scale-95"
            aria-label="Đổi Camera"
          >
            <RefreshCw className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      {/* Camera Video Viewport */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-black">
        {cameraError ? (
          <div className="p-6 text-center max-w-sm mx-auto text-white">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h3 className="font-bold text-lg mb-2">Không thể mở Camera</h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-6">{cameraError}</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => startCamera(facingMode)}
                className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition"
              >
                Thử lại Camera
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition border border-slate-700"
              >
                Chọn ảnh từ máy
              </button>
            </div>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="absolute w-full h-full object-cover"
            />

            {/* Document Scan Overlay Boundary Guides */}
            <div className="pointer-events-none absolute inset-x-6 inset-y-12 border-2 border-emerald-400/80 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
              {/* Corner brackets */}
              <div className="absolute -top-1 -left-1 w-7 h-7 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
              <div className="absolute -top-1 -right-1 w-7 h-7 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
              <div className="absolute -bottom-1 -left-1 w-7 h-7 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
              <div className="absolute -bottom-1 -right-1 w-7 h-7 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />

              {/* Scanning Laser Beam */}
              <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#34d399] animate-pulse top-1/2 -translate-y-1/2" />
            </div>

            {/* Shutter Flash Animation */}
            {flashAnimation && (
              <div className="absolute inset-0 bg-white z-40 pointer-events-none transition-opacity duration-150" />
            )}
          </>
        )}
      </div>

      {/* Hidden File Picker Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Bottom Controls Bar */}
      <div className="pb-safe pt-4 px-6 bg-gradient-to-t from-black via-black/90 to-transparent flex items-center justify-between z-20">
        {/* Gallery picker button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center gap-1 text-slate-300 hover:text-white transition active:scale-95"
        >
          <div className="w-12 h-12 rounded-2xl bg-slate-800/80 backdrop-blur border border-slate-700 flex items-center justify-center">
            <ImageIcon className="w-6 h-6 text-slate-200" />
          </div>
          <span className="text-[11px] font-medium">Thư viện</span>
        </button>

        {/* Big Shutter Button */}
        <button
          onClick={captureFrame}
          disabled={isCapturing || Boolean(cameraError)}
          className={`w-20 h-20 rounded-full border-4 border-white flex items-center justify-center transition active:scale-90 shadow-lg ${
            isCapturing ? 'opacity-50' : 'hover:border-blue-400'
          }`}
          aria-label="Chụp ảnh"
        >
          <div className="w-16 h-16 rounded-full bg-white active:bg-blue-500 transition-colors" />
        </button>

        {/* Finish button with live page count */}
        <button
          onClick={handleFinish}
          className={`relative flex flex-col items-center gap-1 transition active:scale-95 ${
            capturedPages.length > 0 ? 'text-emerald-400' : 'text-slate-500'
          }`}
        >
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition ${
              capturedPages.length > 0
                ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-600/30'
                : 'bg-slate-800/60 border-slate-700 text-slate-500'
            }`}
          >
            <Check className="w-6 h-6 stroke-[2.5]" />
          </div>
          <span className="text-[11px] font-medium">
            {capturedPages.length > 0 ? `Xong (${capturedPages.length})` : 'Xong'}
          </span>
          {capturedPages.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-black">
              {capturedPages.length}
            </span>
          )}
        </button>
      </div>
    </div>
  );
};
