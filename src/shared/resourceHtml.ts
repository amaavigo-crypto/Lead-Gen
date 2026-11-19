const RESOURCE_SCOPE = '.sx-resource-html-content';

const ALLOWED_TAGS = new Set([
  'article','section','header','footer','div','span','main','aside',
  'h1','h2','h3','h4','h5','h6','p','br','hr',
  'strong','b','em','i','u','s','small','mark','sub','sup',
  'ul','ol','li','dl','dt','dd','blockquote','pre','code',
  'a','img','figure','figcaption',
  'table','caption','thead','tbody','tfoot','tr','th','td','colgroup','col',
  'details','summary',
]);

const VOID_TAGS = new Set(['br','hr','img','col']);
const DROP_CONTENT_TAGS = /<(script|iframe|object|embed|form|input|textarea|select|option|button|svg|math|canvas|template|noscript|applet|frame|frameset|portal)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

function safeUrl(value: string, kind: 'src' | 'href' | 'css' = 'href'): string {
  const raw = value.trim().replace(/[\u0000-\u0020]+/g, '');
  if (!raw || raw.startsWith('//') || raw.includes('\\')) return '';
  if (raw.startsWith('/') || raw.startsWith('#')) return raw;
  if (kind === 'href' && /^(mailto:|tel:)/i.test(raw)) return raw;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : '';
  } catch {
    return '';
  }
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&(?!(?:#\d+|#x[\da-f]+|[a-z][\da-z]+);)/gi, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizeDeclarations(input: string): string {
  const output: string[] = [];
  for (const declaration of input.split(';')) {
    const colon = declaration.indexOf(':');
    if (colon <= 0) continue;
    const property = declaration.slice(0, colon).trim().toLowerCase();
    let value = declaration.slice(colon + 1).trim();
    if (!/^--[a-z0-9_-]+$|^-?[a-z][a-z0-9-]*$/.test(property)) continue;
    if (/^(behavior|-moz-binding|binding|src|unicode-range)$/i.test(property)) continue;
    if (/expression\s*\(|javascript:|vbscript:|data:text\/html|@import|<\/style/i.test(value)) continue;
    if (property === 'position' && /\bfixed\b/i.test(value)) continue;
    if (property === 'z-index' && /-?\d{4,}/.test(value)) continue;
    value = value.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (_whole, _quote, urlValue) => {
      const url = safeUrl(String(urlValue || ''), 'css');
      return url ? 'url("' + url.replace(/"/g, '%22') + '")' : '';
    });
    if (!value) continue;
    output.push(property + ':' + value);
  }
  return output.join(';');
}

function matchingBrace(css: string, open: number): number {
  let depth = 1;
  let quote = '';
  for (let i = open + 1; i < css.length; i += 1) {
    const char = css[i];
    if (quote) {
      if (char === '\\' && i + 1 < css.length) { i += 1; continue; }
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return i;
  }
  return -1;
}

function scopeSelector(selector: string): string {
  let value = selector.trim();
  if (!value) return '';
  if (/^(html|body|:root)(?=$|[\s>+~.#:[\]])/i.test(value)) {
    value = value.replace(/^(html|body|:root)\b/i, '').trim();
    return RESOURCE_SCOPE + (value ? ' ' + value : '');
  }
  if (value.startsWith(RESOURCE_SCOPE)) return value;
  return RESOURCE_SCOPE + ' ' + value;
}

function scopeStylesheet(input: string): string {
  const css = input
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@import\b[^;]*;?/gi, '')
    .replace(/@charset\b[^;]*;?/gi, '')
    .replace(/@namespace\b[^;]*;?/gi, '')
    .replace(/@font-face\s*\{[^}]*\}/gi, '');
  let cursor = 0;
  let output = '';
  while (cursor < css.length) {
    const open = css.indexOf('{', cursor);
    if (open < 0) break;
    const close = matchingBrace(css, open);
    if (close < 0) break;
    const prelude = css.slice(cursor, open).trim();
    const body = css.slice(open + 1, close);
    if (/^@(media|supports|container|layer)\b/i.test(prelude)) {
      output += prelude + '{' + scopeStylesheet(body) + '}';
    } else if (/^@(-webkit-)?keyframes\b/i.test(prelude)) {
      const frames = body.replace(/([^{}]+)\{([^{}]*)\}/g, (_all, selector, declarations) =>
        String(selector).trim() + '{' + sanitizeDeclarations(String(declarations)) + '}');
      output += prelude + '{' + frames + '}';
    } else if (prelude.startsWith('@')) {
      // Unknown at-rules (including imports and document-level rules) are intentionally omitted.
    } else {
      const selectors = prelude.split(',').map(scopeSelector).filter(Boolean);
      const declarations = sanitizeDeclarations(body);
      if (selectors.length && declarations) output += selectors.join(',') + '{' + declarations + '}';
    }
    cursor = close + 1;
  }
  return output;
}

/**
 * Sanitizes editorial HTML before it is persisted or rendered. It keeps common article
 * structure and scoped CSS, but removes executable content, unsafe URLs and event handlers.
 */
export function sanitizeResourceHtml(input: unknown): string {
  if (typeof input !== 'string' || !input.trim()) return '';
  let html = input.replace(/\u0000/g, '').slice(0, 250_000);
  const styles: string[] = [];
  html = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi, (_match, css) => {
    const scoped = scopeStylesheet(String(css || ''));
    if (scoped) styles.push(scoped);
    return '';
  });
  html = html
    .replace(DROP_CONTENT_TAGS, '')
    .replace(/<(script|iframe|object|embed|form|input|textarea|select|option|button|svg|math|canvas|template|noscript|applet|frame|frameset|portal)\b[^>]*\/?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!doctype[^>]*>/gi, '')
    .replace(/<\/?(html|head|body)\b[^>]*>/gi, '')
    .replace(/<\/?(meta|link|base)\b[^>]*\/?>/gi, '');

  html = html.replace(/<\/?([a-z][a-z0-9-]*)\b([^>]*)>/gi, (whole, rawTag, rawAttributes) => {
    const tag = String(rawTag).toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';
    if (whole.startsWith('</')) return VOID_TAGS.has(tag) ? '' : '</' + tag + '>';
    const attributes: string[] = [];
    const attrPattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let match: RegExpExecArray | null;
    while ((match = attrPattern.exec(String(rawAttributes || '')))) {
      const name = String(match[1]).toLowerCase();
      const value = String(match[2] ?? match[3] ?? match[4] ?? '');
      if (name.startsWith('on') || name === 'srcdoc' || name === 'formaction' || name === 'xmlns') continue;
      if (name === 'class' || name === 'id') {
        if (/^[a-z0-9 _:-]{1,240}$/i.test(value)) attributes.push(name + '="' + escapeAttribute(value) + '"');
      } else if (name === 'style') {
        const style = sanitizeDeclarations(value);
        if (style) attributes.push('style="' + escapeAttribute(style) + '"');
      } else if (name === 'href' && tag === 'a') {
        const href = safeUrl(value, 'href');
        if (href) attributes.push('href="' + escapeAttribute(href) + '"');
      } else if (name === 'src' && tag === 'img') {
        const src = safeUrl(value, 'src');
        if (src) attributes.push('src="' + escapeAttribute(src) + '"');
      } else if (['alt','title','role','aria-label','aria-describedby','aria-hidden','scope','align','valign'].includes(name)) {
        attributes.push(name + '="' + escapeAttribute(value.slice(0, 500)) + '"');
      } else if (['width','height','colspan','rowspan'].includes(name) && /^\d{1,4}$/.test(value)) {
        attributes.push(name + '="' + value + '"');
      } else if (name === 'target' && tag === 'a' && value === '_blank') {
        attributes.push('target="_blank"');
      } else if (name === 'loading' && tag === 'img' && ['lazy','eager'].includes(value)) {
        attributes.push('loading="' + value + '"');
      } else if (name === 'decoding' && tag === 'img' && ['async','sync','auto'].includes(value)) {
        attributes.push('decoding="' + value + '"');
      } else if (name === 'rel' && tag === 'a') {
        // External links receive a safe rel value below.
      }
    }
    if (tag === 'a' && attributes.some((attr) => attr.startsWith('href=')) && attributes.includes('target="_blank"')) {
      attributes.push('rel="noopener noreferrer"');
    }
    if (tag === 'img' && !attributes.some((attr) => attr.startsWith('src='))) return '';
    return '<' + tag + (attributes.length ? ' ' + attributes.join(' ') : '') + (VOID_TAGS.has(tag) ? ' />' : '>');
  });

  const styleMarkup = styles.length ? '<style>' + styles.join('\n') + '</style>' : '';
  return (styleMarkup + html).trim().slice(0, 250_000);
}
