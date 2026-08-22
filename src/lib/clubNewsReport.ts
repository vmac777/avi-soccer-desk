/**
 * The shape of a generated club news report, and a guard for reading one back.
 *
 * The rows in `club_news_reports` are `jsonb`, so the database will hand back
 * whatever was written — including a report generated before the schema
 * changed. Rendering that optimistically means a page that crashes on a row
 * from last month, which is a worse failure than not showing it: the club page
 * dies rather than the one stale card. So every read goes through `parseReport`
 * and a row that does not fit is displayed as unreadable.
 */

export const REPORT_CATEGORIES = [
  'transfer', 'contract', 'management', 'performance', 'financial', 'other',
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const REPORT_RELEVANCE = ['high', 'medium', 'low'] as const;
export type ReportRelevance = (typeof REPORT_RELEVANCE)[number];

export interface ReportStory {
  title: string;
  summary: string;
  category: ReportCategory;
  relevance: ReportRelevance;
  source_url: string;
  source_name: string;
  published_hint: string;
}

export interface ClubNewsReport {
  headline: string;
  as_of: string;
  stories: ReportStory[];
  agency_angle: string[];
  gaps: string;
}

/** What each configured source actually returned, recorded per run. */
export interface SourceStatus {
  url: string;
  label: string | null;
  identifier: string;
  /** 'ok', 'empty', 'timeout', 'page_too_large', or 'http_<code>'. */
  status: string;
  chars: number;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function parseStory(raw: unknown): ReportStory | null {
  if (!isRecord(raw)) return null;
  const title = str(raw.title).trim();
  if (!title) return null;

  const category = REPORT_CATEGORIES.includes(raw.category as ReportCategory)
    ? (raw.category as ReportCategory)
    : 'other';
  const relevance = REPORT_RELEVANCE.includes(raw.relevance as ReportRelevance)
    ? (raw.relevance as ReportRelevance)
    : 'medium';

  // A source URL is the one field worth being strict about: a story you cannot
  // trace is a story you cannot repeat to a sporting director. An unusable one
  // becomes empty so the renderer shows the story without a dead link.
  const url = str(raw.source_url).trim();
  const source_url = /^https?:\/\//i.test(url) ? url : '';

  return {
    title,
    summary: str(raw.summary),
    category,
    relevance,
    source_url,
    source_name: str(raw.source_name),
    published_hint: str(raw.published_hint),
  };
}

/** Returns null when the value cannot be read as a report. */
export function parseReport(raw: unknown): ClubNewsReport | null {
  if (!isRecord(raw)) return null;
  if (!Array.isArray(raw.stories)) return null;

  const stories = raw.stories.map(parseStory).filter((s): s is ReportStory => s !== null);
  const headline = str(raw.headline).trim();

  // Nothing readable at all is not a report, however well-formed the wrapper.
  if (!headline && stories.length === 0) return null;

  return {
    headline,
    as_of: str(raw.as_of),
    stories,
    agency_angle: Array.isArray(raw.agency_angle)
      ? raw.agency_angle.map(str).filter((s) => s.trim().length > 0)
      : [],
    gaps: str(raw.gaps),
  };
}

export function parseSourceStatus(raw: unknown): SourceStatus[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    return [{
      url: str(entry.url),
      label: typeof entry.label === 'string' ? entry.label : null,
      identifier: str(entry.identifier) || 'SOURCE',
      status: str(entry.status) || 'unknown',
      chars: typeof entry.chars === 'number' ? entry.chars : 0,
    }];
  });
}

/**
 * How many sources actually produced text.
 *
 * Shown next to every report because three blocked pages and three good ones
 * produce equally confident prose, and the only difference is here.
 */
export function sourceHealth(statuses: SourceStatus[]): { ok: number; total: number } {
  return { ok: statuses.filter((s) => s.status === 'ok').length, total: statuses.length };
}
