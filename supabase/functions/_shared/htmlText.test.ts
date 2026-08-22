import { describe, it, expect } from 'vitest';
import { htmlToText, labelToIdentifier, MAX_TEXT_CHARS } from './htmlText';

/**
 * The extraction ladder is the part of this feature that will break without
 * telling anyone. A publisher reshapes their markup, the regex stops matching,
 * and the report still generates — from a page of navigation links. It reads
 * like a quiet week at the club rather than like a parser that stopped working.
 */

describe('htmlToText', () => {
  it('prefers <article> over everything else on the page', () => {
    const html = `
      <body>
        <main><p>Site-wide main content</p></main>
        <article><p>The story we came for.</p></article>
      </body>`;
    const text = htmlToText(html);
    expect(text).toContain('The story we came for.');
    expect(text).not.toContain('Site-wide main content');
  });

  it('falls back to <main> when there is no article', () => {
    const html = '<body><main><p>Main body copy.</p></main></body>';
    expect(htmlToText(html)).toBe('Main body copy.');
  });

  it('scrapes the paragraphs when there is neither, dropping the furniture', () => {
    const html = `
      <body>
        <header><p>Sign in</p></header>
        <nav><p>Fixtures Table Transfers</p></nav>
        <p>Club agrees a fee for the midfielder.</p>
        <aside><p>Most read this week</p></aside>
        <footer><p>Cookie settings</p></footer>
      </body>`;
    const text = htmlToText(html);
    expect(text).toBe('Club agrees a fee for the midfielder.');
  });

  it('drops script and style bodies rather than reading them as prose', () => {
    // Left in, a page's JSON-LD blob survives tag-stripping and looks like copy.
    const html = `
      <body>
        <script type="application/ld+json">{"@type":"NewsArticle","x":"noise"}</script>
        <style>.headline { color: red; }</style>
        <main><p>Real copy.</p></main>
      </body>`;
    const text = htmlToText(html);
    expect(text).toBe('Real copy.');
    expect(text).not.toContain('NewsArticle');
    expect(text).not.toContain('color');
  });

  it('decodes the entities a headline actually contains', () => {
    const html = '<main><p>Barcelona &amp; Madrid&#39;s &quot;deal&quot;&nbsp;is off</p></main>';
    expect(htmlToText(html)).toBe(`Barcelona & Madrid's "deal" is off`);
  });

  it('truncates rather than handing over a whole site', () => {
    const html = `<main><p>${'a'.repeat(MAX_TEXT_CHARS * 2)}</p></main>`;
    const text = htmlToText(html);
    expect(text.endsWith('... [truncated]')).toBe(true);
    expect(text.length).toBeLessThan(MAX_TEXT_CHARS + 100);
  });

  it('returns empty rather than throwing on a page with nothing in it', () => {
    expect(htmlToText('')).toBe('');
    expect(htmlToText('<html><body></body></html>')).toBe('');
  });
});

describe('labelToIdentifier', () => {
  it('makes a citable name out of a label', () => {
    expect(labelToIdentifier('Sky Sports')).toBe('SKY_SPORTS');
    expect(labelToIdentifier('O Globo — Esporte')).toBe('O_GLOBO_ESPORTE');
  });

  it('strips accents so the same source is one identifier', () => {
    expect(labelToIdentifier('Diário AS')).toBe('DIARIO_AS');
  });

  it('never returns an empty identifier', () => {
    // A label of only punctuation would otherwise cite the source as "".
    expect(labelToIdentifier(null)).toBe('SOURCE');
    expect(labelToIdentifier('')).toBe('SOURCE');
    expect(labelToIdentifier('!!!')).toBe('SOURCE');
  });
});
