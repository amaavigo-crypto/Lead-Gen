import { authFetch } from './authService';

export interface PlatformSiteAsset {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  sizeFormatted: string;
  dimensions?: { width: number; height: number };
  url: string;
  altText?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformAssetUpload {
  name: string;
  mimeType: string;
  dataUrl: string;
  size: number;
  dimensions?: { width: number; height: number };
  altText?: string;
}

export async function fetchPlatformAssets(): Promise<PlatformSiteAsset[]> {
  const response = await authFetch('/api/platform/assets');
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Could not load the platform image library.');
  return Array.isArray(data.assets) ? data.assets : [];
}

export async function uploadPlatformAsset(payload: PlatformAssetUpload): Promise<PlatformSiteAsset> {
  const response = await authFetch('/api/platform/assets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Could not upload the image.');
  return data.asset as PlatformSiteAsset;
}
