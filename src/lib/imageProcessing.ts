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
 * Get natural (pixel) dimensions of any image source
 */
function getImageDimensions(img: HTMLCanvasElement | HTMLImageElement | ImageBitmap): { w: number; h: number } {
  if (img instanceof HTMLCanvasElement) {
    return { w: img.width, h: img.height };
  }
  if (img instanceof HTMLImageElement) {
    return { w: img.naturalWidth || img.width, h: img.naturalHeight || img.height };
  }
  // ImageBitmap
  return { w: img.width, h: img.height };
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

  // Sample up to ~1600 points across the canvas
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
 * Check if image has too many black or white pixels (corrupted result)
 */
function isImageCorrupted(canvas: HTMLCanvasElement, threshold: number = 0.90): boolean {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return true;

  const w = canvas.width;
  const h = canvas.height;
  if (w === 0 || h === 0) return true;

  const stepX = Math.max(1, Math.floor(w / 30));
  const stepY = Math.max(1, Math.floor(h / 30));
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  let blackCount = 0;
  let whiteCount = 0;
  let count = 0;

  for (let y = 0; y < h; y += stepY) {
    for (let x = 0; x < w; x += stepX) {
      const idx = (y * w + x) * 4;
      const luma = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      if (luma < 10) blackCount++;
      if (luma > 250) whiteCount++;
      count++;
    }
  }

  if (count === 0) return true;
  return (blackCount / count > threshold) || (whiteCount / count > threshold);
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
 * Check if quad is effectively the full frame (all corners near edges)
 */
function isFullFrameQuad(quad: CropQuad, tolerance: number = 0.03): boolean {
  return (
    quad.tl.x <= tolerance && quad.tl.y <= tolerance &&
    quad.tr.x >= 1 - tolerance && quad.tr.y <= tolerance &&
    quad.br.x >= 1 - tolerance && quad.br.y >= 1 - tolerance &&
    quad.bl.x <= tolerance && quad.bl.y >= 1 - tolerance
  );
}

/**
 * Draw source image onto a canvas with white background, returning the canvas
 */
function imageToCanvas(
  img: HTMLCanvasElement | HTMLImageElement | ImageBitmap,
  width?: number,
  height?: number
): HTMLCanvasElement {
  const { w: srcW, h: srcH } = getImageDimensions(img);
  const canvas = document.createElement('canvas');
  canvas.width = width || srcW;
  canvas.height = height || srcH;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img as any, 0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

/**
 * Ensure quad corners are properly ordered as [Top-Left, Top-Right, Bottom-Right, Bottom-Left].
 * Prevents crossed-over or flipped quadrilaterals from distorting the warp.
 */
export function sortQuadPoints(quad: CropQuad): CropQuad {
  const pts = [
    { ...quad.tl },
    { ...quad.tr },
    { ...quad.br },
    { ...quad.bl },
  ];

  // Sort by Y ascending to split into top 2 and bottom 2
  pts.sort((a, b) => a.y - b.y);

  // Top 2 points sorted by X: smaller X is Top-Left, larger X is Top-Right
  const top = pts.slice(0, 2).sort((a, b) => a.x - b.x);

  // Bottom 2 points sorted by X: smaller X is Bottom-Left, larger X is Bottom-Right
  const bot = pts.slice(2, 4).sort((a, b) => a.x - b.x);

  return {
    tl: top[0],
    tr: top[1],
    br: bot[1],
    bl: bot[0],
  };
}

export type DetectedCornersResult = CropQuad & {
  detected: boolean;
};

/**
 * Detect document corners using OpenCV or native gradient scan
 */
export async function detectDocumentCorners(
  imageSrc: string,
  autoDetectEnabled: boolean = true
): Promise<DetectedCornersResult> {
  if (!autoDetectEnabled) {
    console.log('[ScanHợpĐồng ImagePipeline] Tự động cắt tắt, giữ trọn khung hình.');
    return { ...getDefaultCropQuad(), detected: false };
  }

  // 1. Try OpenCV if available
  try {
    if (typeof window !== 'undefined' && (window as any).cv && (window as any).cv.Mat) {
      const cvCorners = await detectWithOpenCV(imageSrc);
      if (cvCorners && isValidCropQuad(cvCorners)) {
        console.log('[ScanHợpĐồng ImagePipeline] Phát hiện góc bằng OpenCV thành công:', cvCorners);
        return { ...sortQuadPoints(cvCorners), detected: true };
      }
    }
  } catch (err) {
    console.warn('[ScanHợpĐồng ImagePipeline] OpenCV detectDocumentCorners bỏ qua:', err);
  }

  // 2. Fallback to Native Canvas Gradient Scan
  try {
    const img = await loadImage(imageSrc);
    const canvas = document.createElement('canvas');
    const { w: imgW, h: imgH } = getImageDimensions(img);
    const targetW = 320;
    const scale = targetW / imgW;
    const targetH = Math.round(imgH * scale);
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { ...getDefaultCropQuad(), detected: false };

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

    let edgeCount = 0;
    const scanCorner = (startX: number, startY: number, dirX: number, dirY: number): Point => {
      const maxSteps = Math.min(targetW, targetH) * 0.35;
      for (let step = 0; step < maxSteps; step++) {
        const cx = Math.round(startX + dirX * step);
        const cy = Math.round(startY + dirY * step);
        if (cx < 0 || cx >= targetW || cy < 0 || cy >= targetH) break;
        if (edges[cy * targetW + cx] === 255) {
          edgeCount++;
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
    if (isValidCropQuad(quad) && edgeCount >= 2 && !isFullFrameQuad(quad, 0.04)) {
      console.log('[ScanHợpĐồng ImagePipeline] Phát hiện góc bằng Native Canvas:', quad);
      return { ...sortQuadPoints(quad), detected: true };
    }
  } catch (err) {
    console.warn('[ScanHợpĐồng ImagePipeline] Lỗi quét góc Native Canvas, dùng mặc định:', err);
  }

  return { ...getDefaultCropQuad(), detected: false };
}

/**
 * Detect document using OpenCV if loaded.
 * FIXED: Actually loads the image into the analysis canvas instead of reading an empty canvas.
 */
async function detectWithOpenCV(imageSrc: string): Promise<CropQuad | null> {
  const cv = (window as any).cv;
  if (!cv || !cv.Mat || !cv.imread) return null;

  let src: any = null;
  let gray: any = null;
  let blur: any = null;
  let edges: any = null;
  let contours: any = null;
  let hierarchy: any = null;

  try {
    // Load the actual image onto a small canvas for analysis
    const img = await loadImage(imageSrc);
    const { w: imgW, h: imgH } = getImageDimensions(img);
    const targetW = 480;
    const scale = targetW / imgW;
    const targetH = Math.round(imgH * scale);

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Draw the actual image onto the canvas
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img as any, 0, 0, targetW, targetH);

    // Read from canvas into OpenCV Mat
    src = cv.imread(canvas);
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
    const totalArea = targetW * targetH;

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area > totalArea * 0.15) {
        const peri = cv.arcLength(cnt, true);
        const approx = new cv.Mat();
        cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

        if (approx.rows === 4 && area > maxArea) {
          maxArea = area;
          // Extract 4 points
          const pts: Point[] = [];
          for (let p = 0; p < 4; p++) {
            pts.push({
              x: approx.data32S[p * 2] / targetW,
              y: approx.data32S[p * 2 + 1] / targetH,
            });
          }
          // Sort to tl, tr, br, bl order
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

// ============================================================================
// PERSPECTIVE WARP - OpenCV primary, inverse homography fallback
// ============================================================================

/**
 * Warp perspective of quadrilateral to rectangle.
 * 
 * Strategy:
 * 1. If quad is full frame (all corners near edges), skip warp - direct draw
 * 2. Try OpenCV cv.getPerspectiveTransform + cv.warpPerspective
 * 3. Fallback: inverse homography with bilinear sampling (pure JS, no triangles)
 * 4. Ultimate fallback: direct draw
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

  const { w: srcW, h: srcH } = getImageDimensions(sourceImage);

  const sortedQuad = sortQuadPoints(quad);

  // If quad is essentially full frame, use direct draw (no warp needed)
  if (isFullFrameQuad(sortedQuad)) {
    console.log('[ScanHợpĐồng ImagePipeline] Cắt trọn khung hình (Direct Draw)');
    ctx.drawImage(sourceImage as any, 0, 0, outputCanvas.width, outputCanvas.height);
    return outputCanvas;
  }

  // Convert normalized quad to pixel coordinates in source image
  const srcPoints = [
    sortedQuad.tl.x * srcW, sortedQuad.tl.y * srcH,  // top-left
    sortedQuad.tr.x * srcW, sortedQuad.tr.y * srcH,  // top-right
    sortedQuad.br.x * srcW, sortedQuad.br.y * srcH,  // bottom-right
    sortedQuad.bl.x * srcW, sortedQuad.bl.y * srcH,  // bottom-left
  ];

  const dstPoints = [
    0, 0,                                   // top-left
    outputCanvas.width, 0,                  // top-right
    outputCanvas.width, outputCanvas.height, // bottom-right
    0, outputCanvas.height,                 // bottom-left
  ];

  // 1. Try OpenCV perspective transform
  const cv = typeof window !== 'undefined' ? (window as any).cv : null;
  if (cv && cv.Mat && cv.getPerspectiveTransform && cv.warpPerspective) {
    try {
      const result = warpWithOpenCV(cv, sourceImage, srcW, srcH, srcPoints, dstPoints, outputCanvas);
      if (result) return result;
    } catch (cvErr) {
      console.warn('[ScanHợpĐồng ImagePipeline] OpenCV warp thất bại, dùng fallback:', cvErr);
    }
  }

  // 2. Fallback: Inverse homography with bilinear sampling (pure JS)
  try {
    const result = warpWithInverseHomography(sourceImage, srcW, srcH, srcPoints, dstPoints, outputCanvas);
    if (result) return result;
  } catch (homErr) {
    console.warn('[ScanHợpĐồng ImagePipeline] Inverse homography thất bại:', homErr);
  }

  // 3. Ultimate Fallback: Direct draw full image onto white background
  console.warn('[ScanHợpĐồng ImagePipeline] Dùng fallback an toàn: Vẽ trực tiếp ảnh gốc');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
  ctx.drawImage(sourceImage as any, 0, 0, outputCanvas.width, outputCanvas.height);
  return outputCanvas;
}

/**
 * Warp using OpenCV.js cv.getPerspectiveTransform + cv.warpPerspective
 */
function warpWithOpenCV(
  cv: any,
  sourceImage: HTMLCanvasElement | HTMLImageElement | ImageBitmap,
  srcW: number,
  srcH: number,
  srcPoints: number[],
  dstPoints: number[],
  outputCanvas: HTMLCanvasElement
): HTMLCanvasElement | null {
  let srcMat: any = null;
  let dstMat: any = null;
  let srcPts: any = null;
  let dstPts: any = null;
  let M: any = null;

  try {
    // Create temporary canvas with source image drawn (with white background)
    const srcCanvas = imageToCanvas(sourceImage, srcW, srcH);

    srcMat = cv.imread(srcCanvas);
    dstMat = new cv.Mat();
    const dsize = new cv.Size(outputCanvas.width, outputCanvas.height);

    srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, srcPoints);
    dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, dstPoints);
    M = cv.getPerspectiveTransform(srcPts, dstPts);

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

    // Check if output is not corrupted
    const avgLuma = calculateAverageLuminance(outputCanvas);
    if (avgLuma > 15 && !isImageCorrupted(outputCanvas)) {
      console.log('[ScanHợpĐồng ImagePipeline] OpenCV warpPerspective thành công, avgLuma =', avgLuma);
      return outputCanvas;
    }
    console.warn('[ScanHợpĐồng ImagePipeline] OpenCV warp ra ảnh bất thường, dùng fallback!');
    return null;
  } catch (err) {
    console.warn('[ScanHợpĐồng ImagePipeline] OpenCV warp lỗi:', err);
    return null;
  } finally {
    // Delete Mats AFTER imshow
    try { if (srcPts) srcPts.delete(); } catch {}
    try { if (dstPts) dstPts.delete(); } catch {}
    try { if (M) M.delete(); } catch {}
    try { if (srcMat) srcMat.delete(); } catch {}
    try { if (dstMat) dstMat.delete(); } catch {}
  }
}

/**
 * Compute 3x3 homography matrix from 4 source points to 4 destination points.
 * Uses Direct Linear Transform (DLT) algorithm.
 *
 * srcPts: [x0,y0, x1,y1, x2,y2, x3,y3]
 * dstPts: [x0,y0, x1,y1, x2,y2, x3,y3]
 * Returns 3x3 matrix as flat array [h0..h8] where h8 is normalized to 1.
 */
function computeHomography(srcPts: number[], dstPts: number[]): number[] | null {
  // Build 8x9 matrix A for DLT
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const sx = srcPts[i * 2];
    const sy = srcPts[i * 2 + 1];
    const dx = dstPts[i * 2];
    const dy = dstPts[i * 2 + 1];

    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy, -dx]);
    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy, -dy]);
  }

  // Solve Ah = 0 using Gaussian elimination on 8x9 matrix
  // We have exactly 8 equations for 9 unknowns, so we can set h8 = 1
  // and solve the 8x8 system
  const M = A.map(row => [...row]);
  const n = 8;

  // Forward elimination
  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxVal = Math.abs(M[col][col]);
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > maxVal) {
        maxVal = Math.abs(M[row][col]);
        maxRow = row;
      }
    }

    if (maxVal < 1e-12) return null; // Singular matrix

    // Swap rows
    if (maxRow !== col) {
      [M[col], M[maxRow]] = [M[maxRow], M[col]];
    }

    // Eliminate below
    for (let row = col + 1; row < n; row++) {
      const factor = M[row][col] / M[col][col];
      for (let j = col; j < n + 1; j++) {
        M[row][j] -= factor * M[col][j];
      }
    }
  }

  // Back substitution: solve for h[0..7], with the RHS being -M[row][8] (since h[8] = 1)
  const h = new Array(9).fill(0);
  h[8] = 1;

  for (let row = n - 1; row >= 0; row--) {
    let sum = M[row][8]; // This is -h8 * coefficient, but since we move it to RHS: sum = -M[row][8]
    for (let col = row + 1; col < n; col++) {
      sum -= M[row][col] * h[col]; // Wait, we need to be more careful
    }
    // Actually: M[row][0..7] * h[0..7] + M[row][8] * h[8] = 0
    // => M[row][0..7] * h[0..7] = -M[row][8] * 1
    // => h[row] = (-M[row][8] - sum_of(M[row][col]*h[col] for col>row)) / M[row][row]
    let rhs = -M[row][8];
    for (let col = row + 1; col < n; col++) {
      rhs -= M[row][col] * h[col];
    }
    h[row] = rhs / M[row][row];
  }

  return h;
}

/**
 * Invert a 3x3 matrix (stored as flat array of 9 elements)
 */
function invertMatrix3x3(m: number[]): number[] | null {
  const [a, b, c, d, e, f, g, h, i] = m;

  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) return null;

  const invDet = 1 / det;
  return [
    (e * i - f * h) * invDet,
    (c * h - b * i) * invDet,
    (b * f - c * e) * invDet,
    (f * g - d * i) * invDet,
    (a * i - c * g) * invDet,
    (c * d - a * f) * invDet,
    (d * h - e * g) * invDet,
    (b * g - a * h) * invDet,
    (a * e - b * d) * invDet,
  ];
}

/**
 * Warp using inverse homography with bilinear sampling.
 * For each pixel (x,y) in the output, compute the corresponding source coordinate
 * using the inverse homography matrix, then bilinear sample from the source image.
 * This approach NEVER produces holes or fragmented triangles.
 */
function warpWithInverseHomography(
  sourceImage: HTMLCanvasElement | HTMLImageElement | ImageBitmap,
  srcW: number,
  srcH: number,
  srcPoints: number[],
  dstPoints: number[],
  outputCanvas: HTMLCanvasElement
): HTMLCanvasElement | null {
  console.log('[ScanHợpĐồng ImagePipeline] Dùng inverse homography fallback...');

  const outW = outputCanvas.width;
  const outH = outputCanvas.height;

  // Get source image data
  const srcCanvas = imageToCanvas(sourceImage, srcW, srcH);
  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
  if (!srcCtx) return null;
  const srcData = srcCtx.getImageData(0, 0, srcW, srcH);
  const srcPixels = srcData.data;

  // Compute homography: dst -> src (we want to map each output pixel to source)
  // Forward homography maps src -> dst, so we need the inverse
  const H = computeHomography(srcPoints, dstPoints);
  if (!H) {
    console.warn('[ScanHợpĐồng ImagePipeline] Không thể tính homography');
    return null;
  }

  // We have H that maps src -> dst. We need inverse: dst -> src
  const Hinv = invertMatrix3x3(H);
  if (!Hinv) {
    console.warn('[ScanHợpĐồng ImagePipeline] Không thể nghịch đảo homography');
    return null;
  }

  // Create output image data
  const outCtx = outputCanvas.getContext('2d', { willReadFrequently: true });
  if (!outCtx) return null;

  // Fill white first
  outCtx.fillStyle = '#ffffff';
  outCtx.fillRect(0, 0, outW, outH);
  const outImgData = outCtx.getImageData(0, 0, outW, outH);
  const outPixels = outImgData.data;

  // For each output pixel, find corresponding source pixel via inverse homography
  for (let dy = 0; dy < outH; dy++) {
    for (let dx = 0; dx < outW; dx++) {
      // Apply inverse homography: [sx, sy, sw] = Hinv * [dx, dy, 1]
      const sw = Hinv[6] * dx + Hinv[7] * dy + Hinv[8];
      if (Math.abs(sw) < 1e-10) continue; // Behind camera plane

      const sx = (Hinv[0] * dx + Hinv[1] * dy + Hinv[2]) / sw;
      const sy = (Hinv[3] * dx + Hinv[4] * dy + Hinv[5]) / sw;

      // Check bounds
      if (sx < 0 || sx >= srcW - 1 || sy < 0 || sy >= srcH - 1) continue;

      // Bilinear interpolation
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = x0 + 1;
      const y1 = y0 + 1;
      const fx = sx - x0;
      const fy = sy - y0;

      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      const i00 = (y0 * srcW + x0) * 4;
      const i10 = (y0 * srcW + x1) * 4;
      const i01 = (y1 * srcW + x0) * 4;
      const i11 = (y1 * srcW + x1) * 4;

      const outIdx = (dy * outW + dx) * 4;
      outPixels[outIdx] = Math.round(
        srcPixels[i00] * w00 + srcPixels[i10] * w10 + srcPixels[i01] * w01 + srcPixels[i11] * w11
      );
      outPixels[outIdx + 1] = Math.round(
        srcPixels[i00 + 1] * w00 + srcPixels[i10 + 1] * w10 + srcPixels[i01 + 1] * w01 + srcPixels[i11 + 1] * w11
      );
      outPixels[outIdx + 2] = Math.round(
        srcPixels[i00 + 2] * w00 + srcPixels[i10 + 2] * w10 + srcPixels[i01 + 2] * w01 + srcPixels[i11 + 2] * w11
      );
      outPixels[outIdx + 3] = 255; // Fully opaque
    }
  }

  outCtx.putImageData(outImgData, 0, 0);

  // Verify result
  const avgLuma = calculateAverageLuminance(outputCanvas);
  if (avgLuma > 15 && !isImageCorrupted(outputCanvas)) {
    console.log('[ScanHợpĐồng ImagePipeline] Inverse homography thành công, avgLuma =', avgLuma);
    return outputCanvas;
  }

  console.warn('[ScanHợpĐồng ImagePipeline] Inverse homography kết quả bất thường, avgLuma =', avgLuma);
  return null;
}

// ============================================================================
// ROTATION
// ============================================================================

/**
 * Rotate canvas with white background pre-fill.
 * Simple and correct: create new canvas with swapped dimensions for 90°/270°,
 * translate to center, rotate, drawImage.
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

// ============================================================================
// FILTERS & ADJUSTMENTS
// ============================================================================

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
      let srcMat: any = null;
      let grayMat: any = null;
      let dstMat: any = null;
      try {
        srcMat = cv.imread(canvas);
        grayMat = new cv.Mat();
        dstMat = new cv.Mat();

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

        // Check if result is not all black (> 85% black) or all white (> 98% white)
        const luma = calculateAverageLuminance(canvas);
        if (luma > 30 && luma < 250) {
          console.log('[ScanHợpĐồng ImagePipeline] cv.adaptiveThreshold thành công, luma =', luma);
          return canvas;
        }
        console.warn('[ScanHợpĐồng ImagePipeline] cv.adaptiveThreshold kết quả bất thường, dùng fallback');
      } catch (cvErr) {
        console.warn('[ScanHợpĐồng ImagePipeline] Lỗi OpenCV adaptiveThreshold:', cvErr);
      } finally {
        try { if (srcMat) srcMat.delete(); } catch {}
        try { if (grayMat) grayMat.delete(); } catch {}
        try { if (dstMat) dstMat.delete(); } catch {}
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

// ============================================================================
// MAIN PROCESSING PIPELINE
// ============================================================================

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
  const { w: srcW, h: srcH } = getImageDimensions(img);

  const sortedQuad = sortQuadPoints(quad);

  // Calculate target aspect ratio based on quad lengths
  const topDist = Math.hypot((sortedQuad.tr.x - sortedQuad.tl.x) * srcW, (sortedQuad.tr.y - sortedQuad.tl.y) * srcH);
  const botDist = Math.hypot((sortedQuad.br.x - sortedQuad.bl.x) * srcW, (sortedQuad.br.y - sortedQuad.bl.y) * srcH);
  const leftDist = Math.hypot((sortedQuad.bl.x - sortedQuad.tl.x) * srcW, (sortedQuad.bl.y - sortedQuad.tl.y) * srcH);
  const rightDist = Math.hypot((sortedQuad.br.x - sortedQuad.tr.x) * srcW, (sortedQuad.br.y - sortedQuad.tr.y) * srcH);

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

  // 1. Warp perspective (always uses ORIGINAL image as source)
  let canvas = warpPerspectiveCanvas(img, sortedQuad, targetW, targetH);

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

  // Additional check: too many black or white pixels
  if (!warningMessage && isImageCorrupted(canvas, 0.92)) {
    console.warn('[ScanHợpĐồng ImagePipeline] CẢNH BÁO: Ảnh kết quả bị hỏng (quá nhiều pixel đen/trắng)! Khôi phục ảnh gốc.');
    const safeCanvas = document.createElement('canvas');
    safeCanvas.width = targetW;
    safeCanvas.height = targetH;
    const sCtx = safeCanvas.getContext('2d');
    if (sCtx) {
      sCtx.fillStyle = '#ffffff';
      sCtx.fillRect(0, 0, targetW, targetH);
      sCtx.drawImage(img as any, 0, 0, targetW, targetH);
      canvas = safeCanvas;
      warningMessage = 'Ảnh xử lý bị lỗi, hệ thống đã tự động khôi phục ảnh gốc.';
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
