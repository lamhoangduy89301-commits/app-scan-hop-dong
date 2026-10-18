import { DriveFolder, GoogleUser } from '@/types';

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo';
const DRIVE_FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

const STORAGE_KEY_AUTH = 'scanhopdong_google_auth';
const STORAGE_KEY_RECENT_FOLDERS = 'scanhopdong_recent_folders';

export interface RecentFolder {
  id: string;
  name: string;
  breadcrumb?: string;
  accessedAt: number;
}

/**
 * Get Client ID from environment variable or fallback
 */
export function getGoogleClientId(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
}

/**
 * Load saved auth token from localStorage
 */
export function getSavedGoogleUser(): GoogleUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_AUTH);
    if (!raw) return null;
    const user = JSON.parse(raw) as GoogleUser;
    // Check if token expired (with 2 min safety margin)
    if (Date.now() > user.expiresAt - 120000) {
      localStorage.removeItem(STORAGE_KEY_AUTH);
      return null;
    }
    return user;
  } catch (err) {
    return null;
  }
}

/**
 * Save auth user to localStorage
 */
export function saveGoogleUser(user: GoogleUser) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(user));
}

/**
 * Clear auth user (Logout)
 */
export function clearGoogleUser() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY_AUTH);
}

/**
 * Initialize Google Identity Services Token Client
 */
export function requestGoogleAccessToken(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      return reject(new Error('Chỉ hỗ trợ trên trình duyệt'));
    }

    const google = (window as any).google;
    if (!google?.accounts?.oauth2) {
      return reject(new Error('Thư viện Google Identity chưa tải xong. Vui lòng thử lại sau vài giây.'));
    }

    try {
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: `${DRIVE_FILE_SCOPE} https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email`,
        callback: (resp: any) => {
          if (resp.error) {
            reject(new Error(`Đăng nhập Google thất bại: ${resp.error_description || resp.error}`));
            return;
          }
          if (resp.access_token) {
            resolve(resp.access_token);
          } else {
            reject(new Error('Không nhận được access token từ Google'));
          }
        },
        error_callback: (err: any) => {
          reject(new Error(`Lỗi Google OAuth: ${err?.message || 'Yêu cầu bị huỷ hoặc lỗi kết nối'}`));
        },
      });

      tokenClient.requestAccessToken({ prompt: '' });
    } catch (err: any) {
      reject(new Error(`Không thể khởi tạo phiên đăng nhập: ${err?.message || err}`));
    }
  });
}

/**
 * Fetch Google User Info using Access Token
 */
export async function fetchGoogleUserInfo(accessToken: string): Promise<{ name: string; email: string; picture?: string }> {
  const resp = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!resp.ok) {
    throw new Error('Không thể tải thông tin tài khoản Google. Vui lòng đăng nhập lại.');
  }

  const data = await resp.json();
  return {
    name: data.name || data.email,
    email: data.email,
    picture: data.picture,
  };
}

/**
 * List folders inside a specific parent folder in Google Drive
 */
export async function listDriveFolders(
  accessToken: string,
  parentId: string = 'root'
): Promise<DriveFolder[]> {
  const query = `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const url = `${DRIVE_FILES_ENDPOINT}?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,parents)&orderBy=name&pageSize=100`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!resp.ok) {
    if (resp.status === 401) {
      throw new Error('Phiên đăng nhập Google đã hết hạn. Vui lòng đăng nhập lại.');
    }
    const errData = await resp.json().catch(() => ({}));
    throw new Error(`Không thể tải danh sách thư mục: ${errData?.error?.message || resp.statusText}`);
  }

  const data = await resp.json();
  return data.files || [];
}

/**
 * Create a new folder inside a parent folder in Google Drive
 */
export async function createDriveFolder(
  accessToken: string,
  folderName: string,
  parentId: string = 'root'
): Promise<DriveFolder> {
  const meta = {
    name: folderName.trim(),
    mimeType: 'application/vnd.google-apps.folder',
    parents: parentId ? [parentId] : undefined,
  };

  const resp = await fetch(DRIVE_FILES_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(meta),
  });

  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    throw new Error(`Không thể tạo thư mục mới: ${errData?.error?.message || resp.statusText}`);
  }

  return await resp.json();
}

/**
 * Upload PDF File directly to Google Drive using multipart upload
 */
export async function uploadPdfToDrive(
  accessToken: string,
  pdfBlob: Blob,
  fileName: string,
  folderId?: string,
  onUploadProgress?: (percent: number) => void
): Promise<{ fileId: string; driveLink: string; webContentLink?: string }> {
  const safeName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;

  const metadata: Record<string, any> = {
    name: safeName,
    mimeType: 'application/pdf',
  };

  if (folderId && folderId !== 'root') {
    metadata.parents = [folderId];
  }

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadataContentType = 'application/json; charset=UTF-8';
  const mediaContentType = 'application/pdf';

  // Read blob as binary string or array buffer
  const arrayBuffer = await pdfBlob.arrayBuffer();
  const pdfBytes = new Uint8Array(arrayBuffer);

  // Construct multipart body
  const metaHeader = `Content-Type: ${metadataContentType}\r\n\r\n${JSON.stringify(metadata)}`;
  const mediaHeader = `Content-Type: ${mediaContentType}\r\nContent-Transfer-Encoding: base64\r\n\r\n`;

  // Encode binary to base64
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < pdfBytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(pdfBytes.subarray(i, i + chunk)));
  }
  const base64Data = btoa(binary);

  const multipartRequestBody =
    delimiter +
    metaHeader +
    delimiter +
    mediaHeader +
    base64Data +
    closeDelimiter;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${DRIVE_UPLOAD_ENDPOINT}&fields=id,name,webViewLink,webContentLink`);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.setRequestHeader('Content-Type', `multipart/related; boundary=${boundary}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onUploadProgress) {
        const percent = Math.round((e.loaded / e.total) * 100);
        onUploadProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const resp = JSON.parse(xhr.responseText);
          const driveLink = resp.webViewLink || `https://drive.google.com/file/d/${resp.id}/view`;
          resolve({
            fileId: resp.id,
            driveLink,
            webContentLink: resp.webContentLink,
          });
        } catch (err) {
          reject(new Error('Lỗi phân tích phản hồi từ Google Drive'));
        }
      } else {
        try {
          const resp = JSON.parse(xhr.responseText);
          reject(new Error(resp?.error?.message || `Lỗi tải lên Google Drive (${xhr.status})`));
        } catch {
          reject(new Error(`Lỗi tải lên Google Drive (${xhr.status} ${xhr.statusText})`));
        }
      }
    };

    xhr.onerror = () => {
      reject(new Error('Mất kết nối mạng hoặc lỗi mạng trong khi tải lên Google Drive.'));
    };

    xhr.ontimeout = () => {
      reject(new Error('Quá thời gian kết nối tải lên Google Drive.'));
    };

    xhr.send(multipartRequestBody);
  });
}

/**
 * Manage Recent Folders in LocalStorage
 */
export function getRecentFolders(): RecentFolder[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RECENT_FOLDERS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveRecentFolder(folder: { id: string; name: string; breadcrumb?: string }) {
  if (typeof window === 'undefined') return;
  try {
    const recents = getRecentFolders();
    const filtered = recents.filter((f) => f.id !== folder.id);
    const updated: RecentFolder[] = [
      {
        id: folder.id,
        name: folder.name,
        breadcrumb: folder.breadcrumb,
        accessedAt: Date.now(),
      },
      ...filtered,
    ].slice(0, 6); // Keep up to 6 recent folders
    localStorage.setItem(STORAGE_KEY_RECENT_FOLDERS, JSON.stringify(updated));
  } catch (err) {
    console.error('Lỗi lưu thư mục gần đây:', err);
  }
}
