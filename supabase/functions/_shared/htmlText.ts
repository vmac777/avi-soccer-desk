/**
 * Turn a news page into the text a model can read.
 *
 * Ported from the Botafogo desk, split in two on the way over. The fetch and
 * the parse were one function there, which meant the only way to test the
 * parsing was to have a web server. `htmlToText` touches no Deno globals and no
 * network, so vitest can import it directly — and it is the half that actually
 * breaks, silently, when a publisher reshapes their markup.
 *
 * The extraction is a ladder, most-specific first: `<article>`, then `<main>`,
 * then every `<p>` in a body with the furniture stripped out. Each rung is a
 * worse guess than the one above it, which is the point — a miss should degrade
 * to more text, never to none.
 */

/** Longest text we keep per source. Beyond this the model gains nothing. */
export const MAX_TEXT_CHARS = 10_000;

/** Skip a page whose Content-Length admits it is enormous. */
const MAX_PAGE_BYTES = 2_000_000;

const FETCH_TIMEOUT_MS = 15_000;

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
};

/** `Sky Sports` -> `SKY_SPORTS`, so the model can cite a source by a stable name. */
export function labelToIdentifier(label: string | null | undefined): string {
  if (!label) return 'SOURCE';
  return label
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'SOURCE';
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z]+;/gi, ' ');
}

export function htmlToText(html: string): string {
  // Script and style bodies are not prose. Left in, a page's JSON-LD blob and
  // its CSS both survive tag-stripping and read as content.
  const cleaned = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '');

  let extracted: string;
  const article = cleaned.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (article) {
    extracted = article[1];
  } else {
    const main = cleaned.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
    if (main) {
      extracted = main[1];
    } else {
      let body = cleaned.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? cleaned;
      // Nav, footer and sidebars are the same on every page of a site. Kept in,
      // they are the bulk of what a club landing page contains and they drown
      // the handful of headlines that are the reason we fetched it.
      body = body
        .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
        .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
        .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, '')
        .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '');
      const paras = [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => m[1]).join('\n');
      extracted = paras || body;
    }
  }

  const text = decodeEntities(extracted.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

  return text.length > MAX_TEXT_CHARS
    ? `${text.slice(0, MAX_TEXT_CHARS)}... [truncated]`
    : text;
}

export interface SourceText {
  url: string;
  label: string;
  identifier: string;
  text: string;
  char_count: number;
  /** Absent on success. Recorded so a blocked page cannot pass as a quiet one. */
  error?: string;
}

export async function fetchAndExtractText(
  url: string,
  label: string | null,
): Promise<SourceText> {
  const identifier = labelToIdentifier(label);
  const base = { url, label: label ?? '', identifier, text: '', char_count: 0 };
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return { ...base, error: `http_${res.status}` };

    if (Number(res.headers.get('content-length') ?? '0') > MAX_PAGE_BYTES) {
      // Drain rather than buffer, so the connection is released either way.
      try { await res.body?.cancel(); } catch { /* already closed */ }
      return { ...base, error: 'page_too_large' };
    }

    const text = htmlToText(await res.text());
    return { ...base, text, char_count: text.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ...base, error: /timeout|abort/i.test(msg) ? 'timeout' : msg };
  }
}
