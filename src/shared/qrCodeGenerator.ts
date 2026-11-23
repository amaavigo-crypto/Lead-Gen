import { qrcodegen } from './qrcodegen';

export interface QrSvgOptions {
  shape?: 'square' | 'rounded' | 'dots';
  foregroundColor?: string;
  backgroundColor?: string;
  logoUrl?: string;
  border?: number;
  frameText?: string;
}

const validColor = (value: string | undefined, fallback: string) =>
  value && /^(#[0-9a-f]{3,8}|transparent)$/i.test(value) ? value : fallback;

function xml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function safeImageUrl(value?: string): string {
  const url = String(value || '').trim();
  return /^(https:\/\/|\/api\/assets\/|\/)/i.test(url) ? xml(url) : '';
}

/** QR Model 2, high error correction. Quiet zone is always retained for reliable scanning. */
export function renderQrSvg(text: string, options: QrSvgOptions = {}): string {
  const value = String(text || '').trim();
  if (!value) throw new Error('A destination URL is required to generate a QR code.');
  const qr = qrcodegen.QrCode.encodeText(value, qrcodegen.QrCode.Ecc.HIGH);
  const border = Math.max(4, Math.min(8, options.border ?? 4));
  const dimension = qr.size + border * 2;
  const frameText = String(options.frameText || '').replace(/[<>]/g, '').slice(0, 36);
  const frameHeight = frameText ? 3.5 : 0;
  const fg = validColor(options.foregroundColor, '#101828');
  const bg = validColor(options.backgroundColor, '#FFFFFF');
  const shape = options.shape || 'square';
  const logo = safeImageUrl(options.logoUrl);
  const cells: string[] = [];
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (!qr.getModule(x, y)) continue;
      const px = x + border;
      const py = y + border;
      if (shape === 'dots') {
        cells.push(`<circle cx="${px + 0.5}" cy="${py + 0.5}" r="0.41"/>`);
      } else if (shape === 'rounded') {
        cells.push(`<rect x="${px + 0.04}" y="${py + 0.04}" width="0.92" height="0.92" rx="0.2"/>`);
      } else {
        cells.push(`<rect x="${px}" y="${py}" width="1" height="1"/>`);
      }
    }
  }
  const logoMarkup = logo ? (() => {
    const side = qr.size * 0.17;
    const x = (dimension - side) / 2;
    const y = (dimension - side) / 2;
    return `<rect x="${x - 0.25}" y="${y - 0.25}" width="${side + 0.5}" height="${side + 0.5}" rx="1.2" fill="#FFFFFF"/><image href="${logo}" x="${x}" y="${y}" width="${side}" height="${side}" preserveAspectRatio="xMidYMid meet"/>`;
  })() : '';
  const fill = fg.startsWith('#') ? fg : '#101828';
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${dimension}" height="${dimension + frameHeight}" width="${dimension}" height="${dimension + frameHeight}" viewBox="0 0 ${dimension} ${dimension + frameHeight}" role="img" aria-label="QR code" shape-rendering="geometricPrecision"><rect width="${dimension}" height="${dimension + frameHeight}" fill="${bg}"/><g fill="${fill}">${cells.join('')}${logoMarkup}</g>${frameText ? `<text x="${dimension / 2}" y="${dimension + 2.4}" fill="${fill}" font-family="Arial,sans-serif" font-size="1.4" font-weight="700" text-anchor="middle" letter-spacing=".08">${xml(frameText.toUpperCase())}</text>` : ''}</svg>`;
}
