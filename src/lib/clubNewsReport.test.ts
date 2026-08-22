import { describe, it, expect } from 'vitest';
import { parseReport, parseSourceStatus, sourceHealth } from './clubNewsReport';

/**
 * These rows are `jsonb`. Whatever was written is what comes back — including a
 * report generated before the schema changed. The guard exists so one stale row
 * renders as unreadable instead of taking the club page down with it.
 */

const good = {
  headline: 'Squad rebuild under way after the sporting director left',
  as_of: '2026-08-22',
  stories: [{
    title: 'Left-back sold to Porto',
    summary: 'Departure leaves no senior cover on that side.',
    category: 'transfer',
    relevance: 'high',
    source_url: 'https://www.skysports.com/example',
    source_name: 'Sky Sports',
    published_hint: '2 days ago',
  }],
  agency_angle: ['They have no senior left-back. We represent two.'],
  gaps: 'Nothing on the wage budget.',
};

describe('parseReport', () => {
  it('reads a well-formed report', () => {
    const r = parseReport(good)!;
    expect(r.headline).toContain('Squad rebuild');
    expect(r.stories).toHaveLength(1);
    expect(r.stories[0].category).toBe('transfer');
    expect(r.agency_angle).toHaveLength(1);
  });

  it('is null for anything that is not a report', () => {
    expect(parseReport(null)).toBeNull();
    expect(parseReport('a string')).toBeNull();
    expect(parseReport({})).toBeNull();
    expect(parseReport({ headline: 'x' })).toBeNull();          // no stories array
    expect(parseReport({ headline: '', stories: [] })).toBeNull(); // nothing readable
  });

  it('keeps a report whose headline is missing but whose stories are not', () => {
    const r = parseReport({ ...good, headline: '' });
    expect(r).not.toBeNull();
    expect(r!.stories).toHaveLength(1);
  });

  it('drops a story with no title instead of rendering a blank card', () => {
    const r = parseReport({ ...good, stories: [...good.stories, { summary: 'orphan' }] })!;
    expect(r.stories).toHaveLength(1);
  });

  it('falls back on an unrecognised category or relevance rather than failing', () => {
    // An older row, or a model that invented a label. Neither is worth losing
    // the whole report over.
    const r = parseReport({
      ...good,
      stories: [{ ...good.stories[0], category: 'transfer_rumour', relevance: 'critical' }],
    })!;
    expect(r.stories[0].category).toBe('other');
    expect(r.stories[0].relevance).toBe('medium');
  });

  it('blanks a source_url that is not a real link', () => {
    // The bug this mirrors: a schemeless URL renders as an href the browser
    // reads as relative, so "open the source" goes to our own 404.
    const relative = parseReport({
      ...good,
      stories: [{ ...good.stories[0], source_url: 'www.skysports.com/example' }],
    })!;
    expect(relative.stories[0].source_url).toBe('');

    const madeUp = parseReport({
      ...good,
      stories: [{ ...good.stories[0], source_url: 'Sky Sports, last week' }],
    })!;
    expect(madeUp.stories[0].source_url).toBe('');
  });

  it('survives non-string junk in the string fields', () => {
    const r = parseReport({
      ...good,
      gaps: 42,
      agency_angle: ['real point', null, 7, '   '],
    })!;
    expect(r.gaps).toBe('');
    expect(r.agency_angle).toEqual(['real point']);
  });
});

describe('parseSourceStatus and sourceHealth', () => {
  it('counts only the sources that actually returned text', () => {
    const statuses = parseSourceStatus([
      { url: 'https://a', label: 'A', identifier: 'A', status: 'ok', chars: 4000 },
      { url: 'https://b', label: 'B', identifier: 'B', status: 'http_403', chars: 0 },
      { url: 'https://c', label: null, identifier: 'C', status: 'timeout', chars: 0 },
    ]);
    expect(sourceHealth(statuses)).toEqual({ ok: 1, total: 3 });
  });

  it('is an empty list rather than a crash when the column is null or junk', () => {
    expect(parseSourceStatus(null)).toEqual([]);
    expect(parseSourceStatus({ url: 'https://a' })).toEqual([]);
    expect(parseSourceStatus(['nonsense', 3])).toEqual([]);
  });
});
