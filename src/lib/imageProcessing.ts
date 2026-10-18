import { CropQuad, FilterMode, Point } from '@/types';

/**
 * Default normalized crop quad (full image)
 */
export function getDefaultCropQuad(): CropQuad {
  return {
    tl: { x: 0.0, y: 0.0 },
    tr: { x: 1.0, y: 0.0 },
    br: { x: 1.0, y: 1.0 },
    bl: { x: 0.0, y: 1.0 },
  };
}

/**
 * Load image from data URL or blob URL safely with EXIF orientation handling and decode()
 */
export async function loadImage(src: string): Promise<HTMLImageElement | ImageBitmap> {
  // If browser supports createImageBitmap with EXIF orientation from blob
  if (typeof window !== 'undefined' && typeof createImageBitmap === 'function' && src.startsWith('data:')) {
    try {
      const resp = await fetch(src);
      const blob = await resp.blob();
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      if (bitmap.width > 0 && bitmap.height > 0) {
        console.log('[ScanHợpĐồng ImagePipeline] Đã tải ảnh qua ImageBitmap:', {
          width: bitmap.width,
          height: bitmap.height,
        });
        return bitmap;
      }
    } catch (err) {
      console.warn('[ScanHợpĐồng ImagePipeline] ImageBitmap không thành công, dùng fallback HTMLImageElement:', err);
    }
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = async () => {
      try {
        if ('decode' in img) {
          await img.decode();
        }
      } catch (decodeErr) {
        console.warn('[ScanHợpĐồng ImagePipeline] img.decode() bỏ qua:', decodeErr);
      }

      console.log('[ScanHợpĐồng ImagePipeline] 1. Tải ảnh hoàn tất:', {
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
      });

      if ((img.naturalWidth || img.width) === 0 || (img.naturalHeight || img.height) === 0) {
        reject(new Error('Kích thước ảnh bằng 0, không thể xử lý.'));
        return;
      }

      resolve(img);
    };

    img.onerror = (err) => {
      console.error('[ScanHợpĐồng ImagePipeline] Lỗi tải ảnh:', err);
      reject(new Error('Không thể tải ảnh.'));
    };

    img.src = src;
  });
}

/**
 * Calculate average luminance of canvas to detect black or corrupted images
 */
export function calculateAverageLuminance(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 128;

  const w = canvas.width;
  const h = canvas.height;
  if (w === 0 || h === 0) return 0;

  // Sample up to 1000 points across the canvas
  const stepX = Math.max(1, Math.floor(w / 40));
  const stepY = Math.max(1, Math.floor(h / 40));
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  let totalLuma = 0;
  let count = 0;

  for (let y = 0; y < h; y += stepY) {
    for (let x = 0; x < w; x += stepX) {
      const idx = (y * w + x) * 4;
      const luma = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      totalLuma += luma;
      count++;
    }
  }

  return count > 0 ? totalLuma / count : 128;
}

/**
 * Validate quadrilateral points
 */
export function isValidCropQuad(quad: CropQuad): boolean {
  if (!quad || !quad.tl || !quad.tr || !quad.br || !quad.bl) return false;

  const topWidth = quad.tr.x - quad.tl.x;
  const botWidth = quad.br.x - quad.bl.x;
  const leftHeight = quad.bl.y - quad.tl.y;
  const rightHeight = quad.br.y - quad.tr.y;

  // Each dimension should be positive and reasonable
  if (topWidth < 0.15 || botWidth < 0.15 || leftHeight < 0.15 || rightHeight < 0.15) {
    return false;
  }

  // Check bounds within [0, 1]
  const pts = [quad.tl, quad.tr, quad.br, quad.bl];
  for (const p of pts) {
    if (isNaN(p.x) || isNaN(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) {
      return false;
    }
  }

  return true;
}

/**
 * Detect document corners using OpenCV or native gradient scan
 */
export async function detectDocumentCorners(
  imageSrc: string,
  autoDetectEnabled: boolean = true
): Promise<CropQuad> {
  if (!autoDetectEnabled) {
    console.log('[ScanHợpĐồng ImagePipeline] Tự động cắt tắt, giữ trọn khung hình.');
    return getDefaultCropQuad();
  }

  // 1. Try OpenCV if available
  try {
    if (typeof window !== 'undefined' && (window as any).cv && (window as any).cv.Mat) {
      const cvCorners = detectWithOpenCV(imageSrc);
      if (cvCorners && isValidCropQuad(cvCorners)) {
        console.log('[ScanHợpĐồng ImagePipeline] Phát hiện góc bằng OpenCV thành công:', cvCorners);
        return cvCorners;
      }
    }
  } catch (err) {
    console.warn('[ScanHợpĐồng ImagePipeline] OpenCV detectDocumentCorners bỏ qua:', err);
  }

  // 2. Fallback to Native Canvas Gradient Scan
  try {
    const img = await loadImage(imageSrc);
    const canvas = document.createElement('canvas');
    const targetW = 320;
    const imgW = (img as any).naturalWidth || img.width;
    const imgH = (img as any).naturalHeight || img.height;
    const scale = targetW / imgW;
    const targetH = Math.round(imgH * scale);
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return getDefaultCropQuad();

    // Fill white background first
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img as any, 0, 0, targetW, targetH);

    const imgData = ctx.getImageData(0, 0, targetW, targetH);
    const data = imgData.data;

    // Convert to grayscale
    const gray = new Uint8Array(targetW * targetH);
    for (let i = 0; i < data.length; i += 4) {
      gray[i / 4] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    }

    // Sobel gradient magnitude
    const edges = new Uint8Array(targetW * targetH);
    for (let y = 1; y < targetH - 1; y++) {
      for (let x = 1; x < targetW - 1; x++) {
        const idx = y * targetW + x;
        const gx =
          -gray[idx - targetW - 1] + gray[idx - targetW + 1] -
          2 * gray[idx - 1] + 2 * gray[idx + 1] -
          gray[idx + targetW - 1] + gray[idx + targetW + 1];
        const gy =
          -gray[idx - targetW - 1] - 2 * gray[idx - targetW] - gray[idx - targetW + 1] +
          gray[idx + targetW - 1] + 2 * gray[idx + targetW] + gray[idx + targetW + 1];
        const mag = Math.abs(gx) + Math.abs(gy);
        edges[idx] = mag > 75 ? 255 : 0;
      }
    }

    const scanCorner = (startX: number, startY: number, dirX: number, dirY: number): Point => {
      const maxSteps = Math.min(targetW, targetH) * 0.35;
      for (let step = 0; step < maxSteps; step++) {
        const cx = Math.round(startX + dirX * step);
        const cy = Math.round(startY + dirY * step);
        if (cx < 0 || cx >= targetW || cy < 0 || cy >= targetH) break;
        if (edges[cy * targetW + cx] === 255) {
          return {
            x: Math.max(0.01, Math.min(0.99, cx / targetW)),
            y: Math.max(0.01, Math.min(0.99, cy / targetH)),
          };
        }
      }
      return {
        x: Math.max(0.0, Math.min(1.0, startX / targetW)),
        y: Math.max(0.0, Math.min(1.0, startY / targetH)),
      };
    };

    const tl = scanCorner(4, 4, 1, 1);
    const tr = scanCorner(targetW - 4, 4, -1, 1);
    const br = scanCorner(targetW - 4, targetH - 4, -1, -1);
    const bl = scanCorner(4, targetH - 4, 1, -1);

    const quad = { tl, tr, br, bl };
    if (isValidCropQuad(quad)) {
      console.log('[ScanHợpĐồng ImagePipeline] Phát hiện góc bằng Native Canvas:', quad);
      return quad;
    }
  } catch (err) {
    console.warn('[ScanHợpĐồng ImagePipeline] Lỗi quét góc Native Canvas, dùng mặc định:', err);
  }

  return getDefaultCropQuad();
}

/**
 * Detect document using OpenCV if loaded
 */
function detectWithOpenCV(imageSrc: string): CropQuad | null {
  const cv = (window as any).cv;
  if (!cv || !cv.Mat || !cv.imread) return null;

  let src: any = null;
  let gray: any = null;
  let blur: any = null;
  let edges: any = null;
  let contours: any = null;
  let hierarchy: any = null;

  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Small analysis size
    const targetW = 320;
    canvas.width = targetW;
    canvas.height = 240;

    // Read into OpenCV Mat
    src = new cv.Mat(canvas.height, canvas.width, cv.CV_8UC4);
    gray = new cv.Mat();
    blur = new cv.Mat();
    edges = new cv.Mat();

    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    cv.Canny(blur, edges, 50, 150);

    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // Look for largest quadrilateral
    let maxArea = 0;
    let bestQuad: CropQuad | null = null;
    const totalArea = canvas.width * canvas.height;

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area > totalArea * 0.2) {
        const peri = cv.arcLength(cnt, true);
        const approx = new cv.Mat();
        cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

        if (approx.rows === 4 && area > maxArea) {
          maxArea = area;
          // Extract 4 points
          const pts: Point[] = [];
          for (let p = 0; p < 4; p++) {
            pts.push({
              x: approx.data32S[p * 2] / canvas.width,
              y: approx.data32S[p * 2 + 1] / canvas.height,
            });
          }
          // Sort to tl, tr, br, bl
          pts.sort((a, b) => a.y - b.y);
          const top = pts.slice(0, 2).sort((a, b) => a.x - b.x);
          const bot = pts.slice(2, 4).sort((a, b) => a.x - b.x);
          bestQuad = {
            tl: top[0],
            tr: top[1],
            br: bot[1],
            bl: bot[0],
          };
        }
        approx.delete();
      }
      cnt.delete();
    }

    return bestQuad;
  } catch (err) {
    console.warn('[ScanHợpĐồng ImagePipeline] OpenCV contour error:', err);
    return null;
  } finally {
    try {
      if (src) src.delete();
      if (gray) gray.delete();
      if (blur) blur.delete();
      if (edges) edges.delete();
      if (contours) contours.delete();
      if (hierarchy) hierarchy.delete();
    } catch {}
  }
}

/**
 * Warp perspective of quadrilateral to rectangle
 * Includes pure white background pre-fill, OpenCV support, and robust math fallback
 */
export function warpPerspectiveCanvas(
  sourceImage: HTMLCanvasElement | HTMLImageElement | ImageBitmap,
  quad: CropQuad,
  outWidth: number,
  outHeight: number
): HTMLCanvasElement {
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = Math.max(100, Math.round(outWidth));
  outputCanvas.height = Math.max(100, Math.round(outHeight));
  const ctx = outputCanvas.getContext('2d');
  if (!ctx) return outputCanvas;

  // IMPORTANT: Always fill white background to prevent transparent areas turning black in JPEG!
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);

  const srcW = (sourceImage as any).naturalWidth || sourceImage.width;
  const srcH = (sourceImage as any).naturalHeight || sourceImage.height;

  // If quad is essentially full frame (all corners near edges), use direct draw
  const isFullFrame =
    quad.tl.x <= 0.03 && quad.tl.y <= 0.03 &&
    quad.tr.x >= 0.97 && quad.tr.y <= 0.03 &&
    quad.br.x >= 0.97 && quad.br.y >= 0.97 &&
    quad.bl.x <= 0.03 && quad.bl.y >= 0.97;

  if (isFullFrame) {
    console.log('[ScanHợpĐồng ImagePipeline] Cắt trọn khung hình (Direct Draw)');
    ctx.drawImage(sourceImage as any, 0, 0, outputCanvas.width, outputCanvas.height);
    return outputCanvas;
  }

  // 1. Try OpenCV perspective transform if available
  const cv = typeof window !== 'undefined' ? (window as any).cv : null;
  if (cv && cv.Mat && cv.getPerspectiveTransform && cv.warpPerspective) {
    try {
      // Create temporary canvas to hold source image
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = srcW;
      srcCanvas.height = srcH;
      const sCtx = srcCanvas.getContext('2d');
      if (sCtx) {
        sCtx.fillStyle = '#ffffff';
        sCtx.fillRect(0, 0, srcW, srcH);
        sCtx.drawImage(sourceImage as any, 0, 0);

        const srcMat = cv.imread(srcCanvas);
        const dstMat = new cv.Mat();
        const dsize = new cv.Size(outputCanvas.width, outputCanvas.height);

        const srcPtsArray = [
          quad.tl.x * srcW, quad.tl.y * srcH,
          quad.tr.x * srcW, quad.tr.y * srcH,
          quad.br.x * srcW, quad.br.y * srcH,
          quad.bl.x * srcW, quad.bl.y * srcH,
        ];
        const dstPtsArray = [
          0, 0,
          outputCanvas.width, 0,
          outputCanvas.width, outputCanvas.height,
          0, outputCanvas.height,
        ];

        const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, srcPtsArray);
        const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, dstPtsArray);
        const M = cv.getPerspectiveTransform(srcPts, dstPts);

        cv.warpPerspective(
          srcMat,
          dstMat,
          M,
          dsize,
          cv.INTER_LINEAR,
          cv.BORDER_CONSTANT,
          new cv.Scalar(255, 255, 255, 255)
        );

        cv.imshow(outputCanvas, dstMat);

        // Delete Mats ONLY AFTER imshow
        srcPts.delete();
        dstPts.delete();
        M.delete();
        srcMat.delete();
        dstMat.delete();

        // Check if output is not black
        const avgLuma = calculateAverageLuminance(outputCanvas);
        if (avgLuma > 15) {
          console.log('[ScanHợpĐồng ImagePipeline] OpenCV warpPerspective thành công, avgLuma =', avgLuma);
          return outputCanvas;
        }
        console.warn('[ScanHợpĐồng ImagePipeline] OpenCV warp ra ảnh quá tối, dùng fallback!');
      }
    } catch (cvErr) {
      console.warn('[ScanHợpĐồng ImagePipeline] OpenCV warp thất bại, dùng fallback:', cvErr);
    }
  }

  // 2. High-precision Triangular Subdivision Perspective Mesh
  try {
    const p0 = { x: quad.tl.x * srcW, y: quad.tl.y * srcH };
    const p1 = { x: quad.tr.x * srcW, y: quad.tr.y * srcH };
    const p2 = { x: quad.br.x * srcW, y: quad.br.y * srcH };
    const p3 = { x: quad.bl.x * srcW, y: quad.bl.y * srcH };

    const SUBDIV_X = 12;
    const SUBDIV_Y = 12;

    const interpolateQuad = (u: number, v: number): Point => {
      const topX = p0.x + (p1.x - p0.x) * u;
      const topY = p0.y + (p1.y - p0.y) * u;
      const botX = p3.x + (p2.x - p3.x) * u;
      const botY = p3.y + (p2.y - p3.y) * u;
      return {
        x: topX + (botX - topX) * v,
        y: topY + (botY - topY) * v,
      };
    };

    for (let y = 0; y < SUBDIV_Y; y++) {
      const v0 = y / SUBDIV_Y;
      const v1 = (y + 1) / SUBDIV_Y;
      const destY0 = v0 * outputCanvas.height;
      const destY1 = v1 * outputCanvas.height;

      for (let x = 0; x < SUBDIV_X; x++) {
        const u0 = x / SUBDIV_X;
        const u1 = (x + 1) / SUBDIV_X;
        const destX0 = u0 * outputCanvas.width;
        const destX1 = u1 * outputCanvas.width;

        const sp0 = interpolateQuad(u0, v0);
        const sp1 = interpolateQuad(u1, v0);
        const sp2 = interpolateQuad(u1, v1);
        const sp3 = interpolateQuad(u0, v1);

        // Triangle 1
        drawAffineTriangle(
          ctx,
          sourceImage,
          sp0, sp1, sp3,
          { x: destX0, y: destY0 }, { x: destX1, y: destY0 }, { x: destX0, y: destY1 }
        );

        // Triangle 2
        drawAffineTriangle(
          ctx,
          sourceImage,
          sp1, sp2, sp3,
          { x: destX1, y: destY0 }, { x: destX1, y: destY1 }, { x: destX0, y: destY1 }
        );
      }
    }

    const meshLuma = calculateAverageLuminance(outputCanvas);
    if (meshLuma > 15) {
      console.log('[ScanHợpĐồng ImagePipeline] Mesh warp thành công, avgLuma =', meshLuma);
      return outputCanvas;
    }
  } catch (meshErr) {
    console.warn('[ScanHợpĐồng ImagePipeline] Mesh warp gặp lỗi:', meshErr);
  }

  // 3. Ultimate Fallback: Direct draw full image onto white background
  console.warn('[ScanHợpĐồng ImagePipeline] Dùng fallback an toàn: Vẽ trực tiếp ảnh gốc');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
  ctx.drawImage(sourceImage as any, 0, 0, outputCanvas.width, outputCanvas.height);
  return outputCanvas;
}

/**
 * Mathematically exact affine triangle mapping for HTML5 Canvas
 */
function drawAffineTriangle(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement | HTMLImageElement | ImageBitmap,
  s0: Point,
  s1: Point,
  s2: Point,
  d0: Point,
  d1: Point,
  d2: Point
) {
  const delta = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
  if (Math.abs(delta) < 1e-5) return;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(d0.x, d0.y);
  ctx.lineTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.closePath();
  ctx.clip();

  // Affine transform coefficients
  const a = (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / delta;
  const c = (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / delta;
  const e = (d0.x * (s1.x * s2.y - s2.x * s1.y) + d1.x * (s2.x * s0.y - s0.x * s2.y) + d2.x * (s0.x * s1.y - s1.x * s0.y)) / delta;
  const b = (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / delta;
  const d = (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / delta;
  const f = (d0.y * (s1.x * s2.y - s2.x * s1.y) + d1.x * (s2.x * s0.y - s0.x * s2.y) + d2.x * (s0.x * s1.y - s1.x * s0.y)) / delta;

  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(img as any, 0, 0);
  ctx.restore();
}

/**
 * Rotate canvas with white background pre-fill
 */
export function rotateCanvas(canvas: HTMLCanvasElement, rotation: number): HTMLCanvasElement {
  const normRot = ((rotation % 360) + 360) % 360;
  if (normRot === 0) return canvas;

  const rotated = document.createElement('canvas');
  const is90or270 = normRot === 90 || normRot === 270;
  rotated.width = is90or270 ? canvas.height : canvas.width;
  rotated.height = is90or270 ? canvas.width : canvas.height;

  const ctx = rotated.getContext('2d');
  if (!ctx) return canvas;

  // Fill white background before rotate
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, rotated.width, rotated.height);

  ctx.translate(rotated.width / 2, rotated.height / 2);
  ctx.rotate((normRot * Math.PI) / 180);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);

  return rotated;
}

/**
 * Apply scanner enhancements: Magic Color (Default), B&W Document, Grayscale, Original
 */
export function applyFilterAndAdjustments(
  canvas: HTMLCanvasElement,
  filter: FilterMode,
  brightness: number = 0,
  contrast: number = 0
): HTMLCanvasElement {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  const width = canvas.width;
  const height = canvas.height;
  if (width === 0 || height === 0) return canvas;

  // B&W Document: Adaptive Thresholding
  if (filter === 'bw_document') {
    // 1. Try OpenCV adaptiveThreshold
    const cv = typeof window !== 'undefined' ? (window as any).cv : null;
    if (cv && cv.Mat && cv.adaptiveThreshold) {
      try {
        const srcMat = cv.imread(canvas);
        const grayMat = new cv.Mat();
        const dstMat = new cv.Mat();

        cv.cvtColor(srcMat, grayMat, cv.COLOR_RGBA2GRAY);
        // Adaptive Gaussian Thresholding
        cv.adaptiveThreshold(
          grayMat,
          dstMat,
          255,
          cv.ADAPTIVE_THRESH_GAUSSIAN_C,
          cv.THRESH_BINARY,
          25,
          10
        );

        cv.imshow(canvas, dstMat);

        srcMat.delete();
        grayMat.delete();
        dstMat.delete();

        // Check if result is not all black (> 85% black) or all white (> 98% white)
        const luma = calculateAverageLuminance(canvas);
        if (luma > 30 && luma < 250) {
          console.log('[ScanHợpĐồng ImagePipeline] cv.adaptiveThreshold thành công, luma =', luma);
          return canvas;
        }
        console.warn('[ScanHợpĐồng ImagePipeline] cv.adaptiveThreshold kết quả bất thường, dùng fallback');
      } catch (cvErr) {
        console.warn('[ScanHợpĐồng ImagePipeline] Lỗi OpenCV adaptiveThreshold:', cvErr);
      }
    }

    // 2. Fallback: Robust Native Adaptive Mean Thresholding
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const totalPixels = width * height;

    let sumLuma = 0;
    for (let i = 0; i < data.length; i += 4) {
      sumLuma += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    const avgLuma = sumLuma / totalPixels;
    const threshold = Math.min(210, Math.max(70, avgLuma * 0.88 + brightness * 1.5));

    let blackCount = 0;
    for (let i = 0; i < data.length; i += 4) {
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const val = luma > threshold ? 255 : 0;
      if (val === 0) blackCount++;
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
    }

    // If black pixels > 80%, fallback to grayscale
    const blackRatio = blackCount / totalPixels;
    if (blackRatio > 0.80) {
      console.warn('[ScanHợpĐồng ImagePipeline] B&W bị đen ' + Math.round(blackRatio * 100) + '%, chuyển sang thang xám');
      return applyFilterAndAdjustments(canvas, 'grayscale', brightness, contrast);
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // Contrast factor: [-50, 50] mapped to [0.6, 1.8]
  const cFactor = (contrast + 100) / 100;
  const bOffset = brightness * 1.5;

  if (filter === 'grayscale') {
    for (let i = 0; i < data.length; i += 4) {
      let luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      luma = ((luma - 128) * cFactor) + 128 + bOffset;
      const val = Math.max(0, Math.min(255, Math.round(luma)));
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
    }
  } else if (filter === 'magic_color') {
    // Magic Color: Whitens background, enhances contract ink/stamps without turning black
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      const luma = 0.299 * r + 0.587 * g + 0.114 * b;

      // Whitening paper background
      if (luma > 160) {
        const boost = Math.min(60, (luma - 160) * 1.1);
        r = Math.min(255, r + boost);
        g = Math.min(255, g + boost);
        b = Math.min(255, b + boost);
      } else {
        // Deepen text slightly
        r = Math.max(0, r * 0.90);
        g = Math.max(0, g * 0.90);
        b = Math.max(0, b * 0.90);
      }

      // Apply brightness & contrast safely
      r = Math.max(0, Math.min(255, Math.round(((r - 128) * (cFactor * 1.1)) + 128 + bOffset)));
      g = Math.max(0, Math.min(255, Math.round(((g - 128) * (cFactor * 1.1)) + 128 + bOffset)));
      b = Math.max(0, Math.min(255, Math.round(((b - 128) * (cFactor * 1.1)) + 128 + bOffset)));

      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  } else {
    // Original with brightness & contrast
    if (brightness !== 0 || contrast !== 0) {
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.max(0, Math.min(255, Math.round(((data[i] - 128) * cFactor) + 128 + bOffset)));
        data[i + 1] = Math.max(0, Math.min(255, Math.round(((data[i + 1] - 128) * cFactor) + 128 + bOffset)));
        data[i + 2] = Math.max(0, Math.min(255, Math.round(((data[i + 2] - 128) * cFactor) + 128 + bOffset)));
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

/**
 * Full Pipeline with Safety Checks:
 * Load Image -> Pre-scale if > 2000px -> Warp/Crop -> Rotate -> Filter -> Check Avg Brightness -> Export JPEG
 */
export async function processScannedImage(
  imageSrc: string,
  quad: CropQuad,
  rotation: number,
  filter: FilterMode,
  brightness: number = 0,
  contrast: number = 0,
  maxDimension: number = 2000,
  quality: number = 0.75
): Promise<{
  processedDataUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  warning?: string;
}> {
  console.log('[ScanHợpĐồng ImagePipeline] Bắt đầu xử lý ảnh...', {
    filter,
    rotation,
    maxDimension,
    quality,
  });

  const img = await loadImage(imageSrc);
  const srcW = (img as any).naturalWidth || img.width;
  const srcH = (img as any).naturalHeight || img.height;

  // Calculate target aspect ratio based on quad lengths
  const topDist = Math.hypot((quad.tr.x - quad.tl.x) * srcW, (quad.tr.y - quad.tl.y) * srcH);
  const botDist = Math.hypot((quad.br.x - quad.bl.x) * srcW, (quad.br.y - quad.bl.y) * srcH);
  const leftDist = Math.hypot((quad.bl.x - quad.tl.x) * srcW, (quad.bl.y - quad.tl.y) * srcH);
  const rightDist = Math.hypot((quad.br.x - quad.tr.x) * srcW, (quad.br.y - quad.tr.y) * srcH);

  let targetW = Math.round(Math.max(topDist, botDist));
  let targetH = Math.round(Math.max(leftDist, rightDist));

  // Cap max dimension to ~2000px to prevent memory limits
  const maxEdge = Math.max(targetW, targetH);
  if (maxEdge > maxDimension) {
    const scale = maxDimension / maxEdge;
    targetW = Math.round(targetW * scale);
    targetH = Math.round(targetH * scale);
  }

  targetW = Math.max(targetW, 100);
  targetH = Math.max(targetH, 100);

  // 1. Warp perspective
  let canvas = warpPerspectiveCanvas(img, quad, targetW, targetH);

  // 2. Rotate if needed
  if (rotation % 360 !== 0) {
    canvas = rotateCanvas(canvas, rotation);
  }

  // 3. Filter & color adjustments
  canvas = applyFilterAndAdjustments(canvas, filter, brightness, contrast);

  // 4. SAFETY BRIGHTNESS CHECK
  let warningMessage: string | undefined = undefined;
  const finalLuma = calculateAverageLuminance(canvas);
  console.log('[ScanHợpĐồng ImagePipeline] Độ sáng trung bình ảnh sau xử lý (Luma):', Math.round(finalLuma));

  // If average brightness is nearly pitch black (< 18), automatically restore original image!
  if (finalLuma < 18) {
    console.warn('[ScanHợpĐồng ImagePipeline] CẢNH BÁO: Ảnh bị đen bất thường! Tự động khôi phục về ảnh gốc.');
    const safeCanvas = document.createElement('canvas');
    safeCanvas.width = targetW;
    safeCanvas.height = targetH;
    const sCtx = safeCanvas.getContext('2d');
    if (sCtx) {
      sCtx.fillStyle = '#ffffff';
      sCtx.fillRect(0, 0, targetW, targetH);
      sCtx.drawImage(img as any, 0, 0, targetW, targetH);
      canvas = safeCanvas;
      warningMessage = 'Ảnh xử lý bị quá tối, hệ thống đã tự động khôi phục ảnh gốc.';
    }
  }

  // 5. Output processed JPEG
  const processedDataUrl = canvas.toDataURL('image/jpeg', quality);

  // 6. Generate thumbnail for fast UI grid rendering (pre-filled white)
  const thumbCanvas = document.createElement('canvas');
  const thumbScale = 320 / Math.max(canvas.width, canvas.height);
  thumbCanvas.width = Math.max(50, Math.round(canvas.width * thumbScale));
  thumbCanvas.height = Math.max(50, Math.round(canvas.height * thumbScale));
  const thumbCtx = thumbCanvas.getContext('2d');
  if (thumbCtx) {
    thumbCtx.fillStyle = '#ffffff';
    thumbCtx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
    thumbCtx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
  }
  const thumbnailUrl = thumbCanvas.toDataURL('image/jpeg', 0.65);

  console.log('[ScanHợpĐồng ImagePipeline] Xuất ảnh hoàn tất:', {
    width: canvas.width,
    height: canvas.height,
    dataUrlBytes: processedDataUrl.length,
    thumbnailBytes: thumbnailUrl.length,
  });

  return {
    processedDataUrl,
    thumbnailUrl,
    width: canvas.width,
    height: canvas.height,
    warning: warningMessage,
  };
}
