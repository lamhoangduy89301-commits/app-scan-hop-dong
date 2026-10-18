import { PDFDocument } from 'pdf-lib';
import { CompressionLevel, PageOrientation, ScannedPage } from '@/types';
import { processScannedImage } from './imageProcessing';

// Standard A4 dimensions in PDF points (72 points per inch)
const A4_PORTRAIT_WIDTH = 595.28;
const A4_PORTRAIT_HEIGHT = 841.89;

export interface GeneratePdfProgress {
  currentPage: number;
  totalPages: number;
  message: string;
}

export interface GeneratePdfResult {
  pdfBytes: Uint8Array;
  blob: Blob;
  fileSizeBytes: number;
}

/**
 * Get compression parameters based on selected compression level
 */
export function getCompressionParams(level: CompressionLevel) {
  switch (level) {
    case 'high':
      return { maxDim: 2200, quality: 0.85, label: 'Nhẹ (Chất lượng cao)' };
    case 'low':
      return { maxDim: 1280, quality: 0.55, label: 'Nhỏ nhất (Siêu nén)' };
    case 'balanced':
    default:
      return { maxDim: 1800, quality: 0.72, label: 'Cân bằng (Khuyên dùng)' };
  }
}

/**
 * Estimate final PDF size in bytes from pages and compression level
 */
export function estimatePdfSize(pageCount: number, level: CompressionLevel, isCCCD: boolean = false): number {
  if (pageCount === 0) return 0;
  const effectivePages = isCCCD ? Math.ceil(pageCount / 2) : pageCount;
  switch (level) {
    case 'high':
      return Math.round(effectivePages * 450 * 1024); // ~450 KB / page
    case 'low':
      return Math.round(effectivePages * 120 * 1024); // ~120 KB / page
    case 'balanced':
    default:
      return Math.round(effectivePages * 260 * 1024); // ~260 KB / page
  }
}

/**
 * Format bytes to readable string (KB, MB)
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * Convert dataURL to Uint8Array for pdf-lib embedding
 */
function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Render CCCD 2-sided image onto a single A4 canvas
 */
async function createMergedCCCDCanvas(
  frontDataUrl: string,
  backDataUrl?: string
): Promise<string> {
  const canvas = document.createElement('canvas');
  // High-res A4 canvas at 200 DPI
  const A4_W = 1654;
  const A4_H = 2338;
  canvas.width = A4_W;
  canvas.height = A4_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return frontDataUrl;

  // Crisp white paper background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, A4_W, A4_H);

  const load = (src: string) =>
    new Promise<HTMLImageElement>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = src;
    });

  const frontImg = await load(frontDataUrl);
  const cardMaxW = A4_W * 0.72; // ~72% width of A4
  const cardMaxH = A4_H * 0.38;

  // Helper to fit card
  const drawCard = (img: HTMLImageElement, centerY: number, label: string) => {
    let w = cardMaxW;
    let h = (img.height / img.width) * w;
    if (h > cardMaxH) {
      h = cardMaxH;
      w = (img.width / img.height) * h;
    }
    const x = (A4_W - w) / 2;
    const y = centerY - h / 2;

    // Draw subtle border around card
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 4;
    ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);

    // Draw image
    ctx.drawImage(img, x, y, w, h);

    // Draw label
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 36px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, A4_W / 2, y - 18);
  };

  if (backDataUrl) {
    const backImg = await load(backDataUrl);
    drawCard(frontImg, A4_H * 0.28, 'MẶT TRƯỚC');
    drawCard(backImg, A4_H * 0.72, 'MẶT SAU');
  } else {
    drawCard(frontImg, A4_H * 0.5, 'MẶT TRƯỚC');
  }

  return canvas.toDataURL('image/jpeg', 0.85);
}

/**
 * Generate PDF from array of ScannedPages with full user settings
 */
export async function generateContractPdf(
  pages: ScannedPage[],
  options: {
    compression: CompressionLevel;
    orientation: PageOrientation;
    isCCCDMode: boolean;
  },
  onProgress?: (progress: GeneratePdfProgress) => void
): Promise<GeneratePdfResult> {
  if (pages.length === 0) {
    throw new Error('Danh sách trang đang trống. Vui lòng thêm ít nhất 1 ảnh.');
  }

  const { maxDim, quality } = getCompressionParams(options.compression);
  const pdfDoc = await PDFDocument.create();

  // If CCCD Mode is enabled, group pages in pairs (Front + Back)
  if (options.isCCCDMode) {
    const totalPairs = Math.ceil(pages.length / 2);
    for (let pairIdx = 0; pairIdx < totalPairs; pairIdx++) {
      const p1 = pages[pairIdx * 2];
      const p2 = pages[pairIdx * 2 + 1];

      onProgress?.({
        currentPage: pairIdx + 1,
        totalPages: totalPairs,
        message: `Đang xử lý CCCD trang ${pairIdx + 1}/${totalPairs}...`,
      });

      // Process p1
      const p1Processed = await processScannedImage(
        p1.originalDataUrl,
        p1.cropQuad,
        p1.rotation,
        p1.filter,
        p1.brightness,
        p1.contrast,
        maxDim,
        quality
      );

      let p2ProcessedUrl: string | undefined = undefined;
      if (p2) {
        const res2 = await processScannedImage(
          p2.originalDataUrl,
          p2.cropQuad,
          p2.rotation,
          p2.filter,
          p2.brightness,
          p2.contrast,
          maxDim,
          quality
        );
        p2ProcessedUrl = res2.processedDataUrl;
      }

      const mergedDataUrl = await createMergedCCCDCanvas(p1Processed.processedDataUrl, p2ProcessedUrl);
      const imgBytes = dataUrlToUint8Array(mergedDataUrl);
      const embeddedImg = await pdfDoc.embedJpg(imgBytes);

      const pdfPage = pdfDoc.addPage([A4_PORTRAIT_WIDTH, A4_PORTRAIT_HEIGHT]);
      pdfPage.drawImage(embeddedImg, {
        x: 0,
        y: 0,
        width: A4_PORTRAIT_WIDTH,
        height: A4_PORTRAIT_HEIGHT,
      });
    }
  } else {
    // Normal multi-page contract document
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      onProgress?.({
        currentPage: i + 1,
        totalPages: pages.length,
        message: `Đang nén & tạo trang PDF ${i + 1}/${pages.length}...`,
      });

      // Reprocess image with current compression settings
      const { processedDataUrl, width, height } = await processScannedImage(
        page.originalDataUrl,
        page.cropQuad,
        page.rotation,
        page.filter,
        page.brightness,
        page.contrast,
        maxDim,
        quality
      );

      const imgBytes = dataUrlToUint8Array(processedDataUrl);
      const embeddedImg = await pdfDoc.embedJpg(imgBytes);

      // Determine PDF page width and height
      let pageWidth = A4_PORTRAIT_WIDTH;
      let pageHeight = A4_PORTRAIT_HEIGHT;

      if (options.orientation === 'landscape') {
        pageWidth = A4_PORTRAIT_HEIGHT;
        pageHeight = A4_PORTRAIT_WIDTH;
      }

      const pdfPage = pdfDoc.addPage([pageWidth, pageHeight]);

      // Calculate fitting dimensions preserving aspect ratio with 15pt margin
      const margin = 15;
      const availWidth = pageWidth - margin * 2;
      const availHeight = pageHeight - margin * 2;

      let drawWidth = availWidth;
      let drawHeight = (height / width) * drawWidth;

      if (drawHeight > availHeight) {
        drawHeight = availHeight;
        drawWidth = (width / height) * drawHeight;
      }

      const drawX = (pageWidth - drawWidth) / 2;
      const drawY = (pageHeight - drawHeight) / 2;

      pdfPage.drawImage(embeddedImg, {
        x: drawX,
        y: drawY,
        width: drawWidth,
        height: drawHeight,
      });
    }
  }

  onProgress?.({
    currentPage: pages.length,
    totalPages: pages.length,
    message: 'Đang kết xuất tệp PDF hoàn chỉnh...',
  });

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });

  return {
    pdfBytes,
    blob,
    fileSizeBytes: blob.size,
  };
}

/**
 * Trigger browser file download directly
 */
export function downloadPdfBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
