import { sanitizeResourceHtml } from '../shared/resourceHtml.js';

export interface ResourceImportResult {
  html: string;
  suggestedTitle: string;
  uploadedImages: number;
}

type UploadImage = (name: string, dataUrl: string, mimeType: string, size: number) => Promise<string>;

function normalizeArchivePath(path: string): string {
  const value = path.replace(/\\/g, '/');
  if (!value || value.startsWith('/') || /^[a-z]:/i.test(value)) throw new Error('The ZIP contains an unsafe file path.');
  const parts: string[] = [];
  for (const part of value.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') throw new Error('The ZIP contains a parent-directory path, which is not allowed.');
    parts.push(part);
  }
  return parts.join('/');
}

function resolveArchivePath(baseFile: string, reference: string): string | null {
  const raw = reference.trim().replace(/&amp;/g, '&');
  if (!raw || /^(https?:|data:|blob:|mailto:|tel:|\/\/|#)/i.test(raw)) return null;
  let path = raw.split(/[?#]/, 1)[0];
  try { path = decodeURIComponent(path); } catch {}
  path = path.replace(/\\/g, '/').replace(/^\/+/, '');
  const base = raw.startsWith('/') ? '' : baseFile.split('/').slice(0, -1).join('/');
  const combined = (base ? base + '/' : '') + path;
  const parts: string[] = [];
  for (const part of combined.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!parts.length) return null; parts.pop(); }
    else parts.push(part);
  }
  return parts.join('/');
}

function fileDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return 'data:' + mimeType + ';base64,' + btoa(binary);
}

function mimeForImage(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'webp') return 'image/webp';
  return '';
}

async function unzip(file: File): Promise<Map<string, Uint8Array>> {
  if (file.size > 15 * 1024 * 1024) throw new Error('ZIP files must be 15 MB or smaller.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let endRecord = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) { endRecord = offset; break; }
  }
  if (endRecord < 0) throw new Error('This ZIP file is invalid or incomplete.');
  const count = view.getUint16(endRecord + 10, true);
  const centralOffset = view.getUint32(endRecord + 16, true);
  if (!count || count > 100 || centralOffset >= bytes.length) throw new Error('The ZIP must contain between 1 and 100 files.');
  const output = new Map<string, Uint8Array>();
  let cursor = centralOffset;
  let expandedTotal = 0;
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error('The ZIP directory is invalid.');
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith('/')) continue;
    const path = normalizeArchivePath(name);
    if ((flags & 1) !== 0) throw new Error('Encrypted ZIP entries are not supported.');
    if (uncompressedSize > 12 * 1024 * 1024) throw new Error('A ZIP entry is too large to import.');
    expandedTotal += uncompressedSize;
    if (expandedTotal > 20 * 1024 * 1024) throw new Error('The expanded ZIP contents must be 20 MB or smaller.');
    if (method !== 0 && method !== 8) throw new Error('The ZIP uses an unsupported compression method.');
    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error('A ZIP entry is malformed.');
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
    let expanded: Uint8Array;
    if (method === 0) {
      expanded = new Uint8Array(compressed);
    } else {
      if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot unpack ZIP files. Upload the HTML file instead.');
      const buffer = bytes.buffer.slice(bytes.byteOffset + dataOffset, bytes.byteOffset + dataOffset + compressedSize) as ArrayBuffer;
      const stream = new Blob([buffer]).stream().pipeThrough(new (DecompressionStream as any)('deflate-raw'));
      expanded = new Uint8Array(await new Response(stream).arrayBuffer());
    }
    if (expanded.length !== uncompressedSize) throw new Error('A ZIP entry failed its size check.');
    output.set(path, expanded);
  }
  return output;
}

function rewriteCssUrls(css: string, cssPath: string, urls: Map<string, string>): string {
  return css.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (_whole, _quote, rawUrl) => {
    const resolved = resolveArchivePath(cssPath, String(rawUrl || ''));
    const uploaded = resolved ? urls.get(resolved) : '';
    return uploaded ? 'url("' + uploaded.replace(/"/g, '%22') + '")' : _whole;
  });
}

function titleAndBody(rawHtml: string): { document: Document; title: string } {
  const parsed = new DOMParser().parseFromString(rawHtml, 'text/html');
  const title = parsed.title.trim() || parsed.querySelector('h1')?.textContent?.trim() || '';
  return { document: parsed, title };
}

export async function importResourceFile(file: File, uploadImage: UploadImage): Promise<ResourceImportResult> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'html' || extension === 'htm') {
    if (file.size > 250 * 1024) throw new Error('HTML files must be 250 KB or smaller. ZIP packages can include CSS and images separately.');
    const parsed = titleAndBody(await file.text());
    const styles = Array.from(parsed.document.head.querySelectorAll('style')).map((style) => style.outerHTML).join('');
    const html = sanitizeResourceHtml(styles + parsed.document.body.innerHTML);
    return { html, suggestedTitle: parsed.title, uploadedImages: 0 };
  }
  if (extension !== 'zip') throw new Error('Choose an HTML file or a ZIP package.');
  const files = await unzip(file);
  const htmlPath = Array.from(files.keys()).find((path) => /(^|\/)index\.html?$/i.test(path))
    || Array.from(files.keys()).find((path) => /\.html?$/i.test(path));
  if (!htmlPath) throw new Error('The ZIP must contain an index.html or another .html file.');
  const htmlBytes = files.get(htmlPath)!;
  if (htmlBytes.length > 250 * 1024) throw new Error('The HTML file inside this ZIP must be 250 KB or smaller.');
  const parsed = titleAndBody(new TextDecoder().decode(htmlBytes));
  const imageUrls = new Map<string, string>();
  const imageFiles = Array.from(files.entries()).filter(([path]) => Boolean(mimeForImage(path)));
  if (imageFiles.length > 40) throw new Error('A blog ZIP can include up to 40 images.');
  for (const [path, bytes] of imageFiles) {
    if (bytes.length > 2 * 1024 * 1024) throw new Error('Each image must be 2 MB or smaller: ' + path);
    const mimeType = mimeForImage(path);
    const url = await uploadImage(path.split('/').pop() || 'Blog image', fileDataUrl(bytes, mimeType), mimeType, bytes.length);
    imageUrls.set(path, url);
  }

  for (const element of Array.from(parsed.document.querySelectorAll('img[src], source[src]'))) {
    const src = element.getAttribute('src') || '';
    const local = resolveArchivePath(htmlPath, src);
    const uploaded = local ? imageUrls.get(local) : '';
    if (uploaded) element.setAttribute('src', uploaded);
  }
  for (const element of Array.from(parsed.document.querySelectorAll('[srcset]'))) {
    const raw = element.getAttribute('srcset') || '';
    const rewritten = raw.split(',').map((entry) => {
      const bits = entry.trim().split(/\s+/);
      const local = resolveArchivePath(htmlPath, bits[0] || '');
      const uploaded = local ? imageUrls.get(local) : '';
      if (uploaded) bits[0] = uploaded;
      return bits.join(' ');
    }).join(', ');
    element.setAttribute('srcset', rewritten);
  }

  for (const link of Array.from(parsed.document.querySelectorAll('link[rel~="stylesheet"][href]'))) {
    const href = link.getAttribute('href') || '';
    const cssPath = resolveArchivePath(htmlPath, href);
    const cssBytes = cssPath ? files.get(cssPath) : undefined;
    if (cssBytes) {
      const style = parsed.document.createElement('style');
      style.textContent = rewriteCssUrls(new TextDecoder().decode(cssBytes), cssPath!, imageUrls);
      link.replaceWith(style);
    } else if (!/^https:\/\//i.test(href)) {
      link.remove();
    }
  }
  for (const style of Array.from(parsed.document.querySelectorAll('style'))) {
    style.textContent = rewriteCssUrls(style.textContent || '', htmlPath, imageUrls);
  }
  for (const element of Array.from(parsed.document.querySelectorAll('[style]'))) {
    element.setAttribute('style', rewriteCssUrls(element.getAttribute('style') || '', htmlPath, imageUrls));
  }

  const headStyles = Array.from(parsed.document.head.querySelectorAll('style')).map((style) => style.outerHTML).join('');
  const html = sanitizeResourceHtml(headStyles + parsed.document.body.innerHTML);
  if (!html.trim()) throw new Error('No usable article content was found in the ZIP.');
  return { html, suggestedTitle: parsed.title, uploadedImages: imageUrls.size };
}
