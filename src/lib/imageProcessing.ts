import { CropQuad, FilterMode, Point } from '@/types';

/**
 * Load image from data URL or blob URL safely
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error('Không thể tải ảnh: ' + err));
    img.src = src;
  });
}

/**
 * Default normalized crop quad (full image with slight 2% margin)
 */
export function getDefaultCropQuad(): CropQuad {
  return {
    tl: { x: 0.03, y: 0.03 },
    tr: { x: 0.97, y: 0.03 },
    br: { x: 0.97, y: 0.97 },
    bl: { x: 0.03, y: 0.97 },
  };
}

/**
 * Automatically detect document corners in an image
 * Uses edge gradient analysis and falls back gracefully to default quad.
 */
export async function detectDocumentCorners(imageSrc: string): Promise<CropQuad> {
  try {
    // If OpenCV.js is loaded in window, try OpenCV first
    if (typeof window !== 'undefined' && (window as any).cv && (window as any).cv.Mat) {
      const cvCorners = detectWithOpenCV(imageSrc);
      if (cvCorners) return cvCorners;
    }
  } catch (err) {
    console.warn('OpenCV corner detection skipped, using native canvas detector', err);
  }

  // Fast Native Canvas Corner Detection
  try {
    const img = await loadImage(imageSrc);
    const canvas = document.createElement('canvas');
    const targetW = 320;
    const scale = targetW / img.width;
    const targetH = Math.round(img.height * scale);
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return getDefaultCropQuad();

    ctx.drawImage(img, 0, 0, targetW, targetH);
    const imgData = ctx.getImageData(0, 0, targetW, targetH);
    const data = imgData.data;

    // Convert to grayscale and find bounding edges by high-contrast change
    const gray = new Uint8Array(targetW * targetH);
    for (let i = 0; i < data.length; i += 4) {
      gray[i / 4] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    }

    // Edge gradient detection (Sobel magnitude)
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

    // Scan from corners inwards to find document corners
    const scanCorner = (
      startX: number,
      startY: number,
      dirX: number,
      dirY: number
    ): Point => {
      const maxSteps = Math.min(targetW, targetH) * 0.38;
      for (let step = 0; step < maxSteps; step++) {
        const cx = Math.round(startX + dirX * step);
        const cy = Math.round(startY + dirY * step);
        if (cx < 0 || cx >= targetW || cy < 0 || cy >= targetH) break;
        if (edges[cy * targetW + cx] === 255) {
          return {
            x: Math.max(0.02, Math.min(0.98, cx / targetW)),
            y: Math.max(0.02, Math.min(0.98, cy / targetH)),
          };
        }
      }
      return {
        x: Math.max(0.02, Math.min(0.98, (startX + dirX * 15) / targetW)),
        y: Math.max(0.02, Math.min(0.98, (startY + dirY * 15) / targetH)),
      };
    };

    const tl = scanCorner(5, 5, 1, 1);
    const tr = scanCorner(targetW - 5, 5, -1, 1);
    const br = scanCorner(targetW - 5, targetH - 5, -1, -1);
    const bl = scanCorner(5, targetH - 5, 1, -1);

    // Verify the polygon is valid and reasonably sized (> 30% area)
    const widthTop = Math.abs(tr.x - tl.x);
    const widthBottom = Math.abs(br.x - bl.x);
    const heightLeft = Math.abs(bl.y - tl.y);
    const heightRight = Math.abs(br.y - tr.y);

    if (widthTop > 0.4 && widthBottom > 0.4 && heightLeft > 0.4 && heightRight > 0.4) {
      return { tl, tr, br, bl };
    }
  } catch (err) {
    console.error('Corner detection error:', err);
  }

  return getDefaultCropQuad();
}

/**
 * OpenCV detection fallback if OpenCV.js is loaded
 */
function detectWithOpenCV(imageSrc: string): CropQuad | null {
  const cv = (window as any).cv;
  if (!cv || !cv.imread) return null;
  // Can be enhanced if cv is initialized
  return null;
}

/**
 * Warp perspective of quadrilateral to rectangle using high-performance triangular subdivision
 */
export function warpPerspectiveCanvas(
  sourceCanvas: HTMLCanvasElement | HTMLImageElement,
  quad: CropQuad,
  outWidth: number,
  outHeight: number
): HTMLCanvasElement {
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = outWidth;
  outputCanvas.height = outHeight;
  const ctx = outputCanvas.getContext('2d');
  if (!ctx) return outputCanvas;

  const srcW = sourceCanvas.width;
  const srcH = sourceCanvas.height;

  // Convert normalized quad to source pixel coordinates
  const p0 = { x: quad.tl.x * srcW, y: quad.tl.y * srcH }; // Top-Left
  const p1 = { x: quad.tr.x * srcW, y: quad.tr.y * srcH }; // Top-Right
  const p2 = { x: quad.br.x * srcW, y: quad.br.y * srcH }; // Bottom-Right
  const p3 = { x: quad.bl.x * srcW, y: quad.bl.y * srcH }; // Bottom-Left

  // Grid subdivisions for smooth perspective curvature
  const SUBDIV_X = 16;
  const SUBDIV_Y = 16;

  // Bilinear interpolation on quad
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

  // Draw two affine triangles per cell
  for (let y = 0; y < SUBDIV_Y; y++) {
    const v0 = y / SUBDIV_Y;
    const v1 = (y + 1) / SUBDIV_Y;
    const destY0 = v0 * outHeight;
    const destY1 = v1 * outHeight;

    for (let x = 0; x < SUBDIV_X; x++) {
      const u0 = x / SUBDIV_X;
      const u1 = (x + 1) / SUBDIV_X;
      const destX0 = u0 * outWidth;
      const destX1 = u1 * outWidth;

      const sp0 = interpolateQuad(u0, v0);
      const sp1 = interpolateQuad(u1, v0);
      const sp2 = interpolateQuad(u1, v1);
      const sp3 = interpolateQuad(u0, v1);

      // Triangle 1: (destX0, destY0), (destX1, destY0), (destX0, destY1)
      drawTriangle(
        ctx,
        sourceCanvas,
        sp0,
        sp1,
        sp3,
        { x: destX0, y: destY0 },
        { x: destX1, y: destY0 },
        { x: destX0, y: destY1 }
      );

      // Triangle 2: (destX1, destY0), (destX1, destY1), (destX0, destY1)
      drawTriangle(
        ctx,
        sourceCanvas,
        sp1,
        sp2,
        sp3,
        { x: destX1, y: destY0 },
        { x: destX1, y: destY1 },
        { x: destX0, y: destY1 }
      );
    }
  }

  return outputCanvas;
}

/**
 * Affine transform for triangle mapping
 */
function drawTriangle(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement | HTMLImageElement,
  s0: Point,
  s1: Point,
  s2: Point,
  d0: Point,
  d1: Point,
  d2: Point
) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(d0.x, d0.y);
  ctx.lineTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.closePath();
  ctx.clip();

  // Compute affine transform matrix mapping s0,s1,s2 to d0,d1,d2
  const denom = (s0.x * (s1.y - s2.y) - s1.x * (s0.y - s2.y) + s2.x * (s0.y - s1.y));
  if (Math.abs(denom) < 0.00001) {
    ctx.restore();
    return;
  }

  const a = -(s0.y * (d1.x - d2.x) - s1.y * (d0.x - d2.x) + s2.y * (d0.x - d1.x)) / denom;
  const b = (s0.y * (d1.y - d2.y) - s1.y * (d0.y - d2.y) + s2.y * (d0.y - d1.y)) / denom;
  const c = (s0.x * (d1.x - d2.x) - s1.x * (d0.x - d2.x) + s2.x * (d0.x - d1.x)) / denom;
  const d = -(s0.x * (d1.y - d2.y) - s1.x * (d0.y - d2.y) + s2.x * (d0.y - d1.y)) / denom;
  const e = (s0.x * (s1.y * d2.x - s2.y * d1.x) - s1.x * (s0.y * d2.x - s2.y * d0.x) + s2.x * (s0.y * d1.x - s1.y * d0.x)) / denom;
  const f = (s0.x * (s1.y * d2.y - s2.y * d1.y) - s1.x * (s0.y * d2.y - s2.y * d0.y) + s2.x * (s0.y * d1.y - s1.y * d0.y)) / denom;

  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

/**
 * Rotate canvas by 0, 90, 180, 270 degrees
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

  ctx.translate(rotated.width / 2, rotated.height / 2);
  ctx.rotate((normRot * Math.PI) / 180);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);

  return rotated;
}

/**
 * Apply scanner enhancements: Original, Magic Color, B&W Document, Grayscale
 * with custom Brightness and Contrast
 */
export function applyFilterAndAdjustments(
  canvas: HTMLCanvasElement,
  filter: FilterMode,
  brightness: number = 0, // -50 to +50
  contrast: number = 0 // -50 to +50
): HTMLCanvasElement {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  const width = canvas.width;
  const height = canvas.height;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const totalPixels = width * height;

  // Contrast factor: contrast range [-50, 50] mapped to [0.5, 2.0]
  const cFactor = (contrast + 100) / 100;
  const bOffset = brightness * 1.5;

  if (filter === 'bw_document') {
    // High-contrast document binarization (Otsu-like adaptive thresholding)
    // 1. Calculate average luminance
    let sumLuma = 0;
    for (let i = 0; i < data.length; i += 4) {
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      sumLuma += luma;
    }
    const avgLuma = sumLuma / totalPixels;
    // Threshold with slightly biased sensitivity to retain handwriting and stamps
    const threshold = Math.min(200, Math.max(90, avgLuma * 0.88 + bOffset));

    for (let i = 0; i < data.length; i += 4) {
      let luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      // Apply contrast
      luma = ((luma - 128) * cFactor) + 128;
      const val = luma > threshold ? 255 : 0;
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
    }
  } else if (filter === 'grayscale') {
    for (let i = 0; i < data.length; i += 4) {
      let luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      luma = ((luma - 128) * cFactor) + 128 + bOffset;
      const val = Math.max(0, Math.min(255, Math.round(luma)));
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
    }
  } else if (filter === 'magic_color') {
    // Magic Color: Whitens background, boosts text contrast and preserves red stamps / blue signatures
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      const luma = 0.299 * r + 0.587 * g + 0.114 * b;

      // Detect background paper (high luma) and push to white
      if (luma > 165) {
        const boost = Math.min(65, (luma - 165) * 1.2);
        r = Math.min(255, r + boost);
        g = Math.min(255, g + boost);
        b = Math.min(255, b + boost);
      } else {
        // Deepen dark text
        r = Math.max(0, r * 0.85);
        g = Math.max(0, g * 0.85);
        b = Math.max(0, b * 0.85);
      }

      // Apply brightness & contrast
      r = Math.max(0, Math.min(255, Math.round(((r - 128) * (cFactor * 1.15)) + 128 + bOffset)));
      g = Math.max(0, Math.min(255, Math.round(((g - 128) * (cFactor * 1.15)) + 128 + bOffset)));
      b = Math.max(0, Math.min(255, Math.round(((b - 128) * (cFactor * 1.15)) + 128 + bOffset)));

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
 * Full Pipeline: Crop/Warp Quad -> Rotate -> Apply Filter/Adjustments -> Output Data URL
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
): Promise<{ processedDataUrl: string; thumbnailUrl: string; width: number; height: number }> {
  const img = await loadImage(imageSrc);

  // Calculate target aspect ratio based on quad lengths
  const srcW = img.width;
  const srcH = img.height;

  const topDist = Math.hypot((quad.tr.x - quad.tl.x) * srcW, (quad.tr.y - quad.tl.y) * srcH);
  const botDist = Math.hypot((quad.br.x - quad.bl.x) * srcW, (quad.br.y - quad.bl.y) * srcH);
  const leftDist = Math.hypot((quad.bl.x - quad.tl.x) * srcW, (quad.bl.y - quad.tl.y) * srcH);
  const rightDist = Math.hypot((quad.br.x - quad.tr.x) * srcW, (quad.br.y - quad.tr.y) * srcH);

  let targetW = Math.round(Math.max(topDist, botDist));
  let targetH = Math.round(Math.max(leftDist, rightDist));

  // Cap max dimension to preserve memory & speed
  const maxEdge = Math.max(targetW, targetH);
  if (maxEdge > maxDimension) {
    const scale = maxDimension / maxEdge;
    targetW = Math.round(targetW * scale);
    targetH = Math.round(targetH * scale);
  }

  // Ensure minimum dimensions
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

  // 4. Output processed high-res data URL
  const processedDataUrl = canvas.toDataURL('image/jpeg', quality);

  // 5. Generate thumbnail (300px max edge) for fast UI grid rendering
  const thumbCanvas = document.createElement('canvas');
  const thumbScale = 300 / Math.max(canvas.width, canvas.height);
  thumbCanvas.width = Math.round(canvas.width * thumbScale);
  thumbCanvas.height = Math.round(canvas.height * thumbScale);
  const thumbCtx = thumbCanvas.getContext('2d');
  if (thumbCtx) {
    thumbCtx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
  }
  const thumbnailUrl = thumbCanvas.toDataURL('image/jpeg', 0.6);

  return {
    processedDataUrl,
    thumbnailUrl,
    width: canvas.width,
    height: canvas.height,
  };
}
