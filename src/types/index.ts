export interface Point {
  x: number;
  y: number;
}

export interface CropQuad {
  tl: Point; // Top-Left
  tr: Point; // Top-Right
  br: Point; // Bottom-Right
  bl: Point; // Bottom-Left
}

export type FilterMode = 'original' | 'magic_color' | 'bw_document' | 'grayscale';

export type CompressionLevel = 'high' | 'balanced' | 'low';

export type PageOrientation = 'portrait' | 'landscape';

export interface ScannedPage {
  id: string;
  originalDataUrl: string;
  processedDataUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  rotation: number; // 0, 90, 180, 270
  cropQuad: CropQuad; // normalized 0..1 coordinates
  filter: FilterMode;
  brightness: number; // -50 to 50 (default 0)
  contrast: number; // -50 to 50 (default 0)
  warning?: string;
  createdAt: number;
}

export interface DriveFolder {
  id: string;
  name: string;
  mimeType?: string;
  parents?: string[];
}

export interface GoogleUser {
  name: string;
  email: string;
  picture?: string;
  accessToken: string;
  expiresAt: number;
}

export interface ContractHistoryItem {
  id: string;
  fileName: string;
  customerName: string;
  createdAt: number;
  pageCount: number;
  fileSizeBytes: number;
  driveFileId?: string;
  driveFileUrl?: string;
  folderId?: string;
  folderName?: string;
  thumbnailDataUrl?: string;
}

export interface SaveContractOptions {
  fileName: string;
  customerName: string;
  folderId?: string;
  folderName?: string;
  compression: CompressionLevel;
  orientation: PageOrientation;
  isCCCDMode: boolean; // Combine front + back into 1 A4 page
}
