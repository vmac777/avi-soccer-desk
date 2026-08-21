import type { BuyPitch, BallInCourt } from '@/hooks/useBuyData';
import { TRACK_LABELS as trackLabel } from '@/lib/placementStage';
import { formatCompactEur } from '@/lib/currency';

type CardData = {
  pitch: BuyPitch;
  targetName: string;
  targetClub?: string;
  contactName: string;
  contactClub: string;
  columnDefaultGlow: BallInCourt | null;
};

type Column = {
  title: string;
  pitches: CardData[];
};

const negShort: Record<string, string> = {
  'Transfer': 'Transfer',
  'Loan': 'Loan',
  'Loan with Option to Buy': 'Loan + Option',
  'Loan with Obligation to Buy': 'Loan + Obligation',
  'Free Agent': 'Free Agent',
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function renderCard(c: CardData, mode: 'detailed' | 'short'): string {
  const eff: BallInCourt | null = c.pitch.ball_in_court ?? c.columnDefaultGlow;
  // Only "us" is a queue we control; the three counterparties all read as
  // waiting, but the label says which one so the sheet is actionable on paper.
  const waiting = eff === 'selling' || eff === 'buying' || eff === 'player';
  const bicColor = eff === 'us' ? '#ef4444' : waiting ? '#22c55e' : '#3a342a';
  const bicLabel = eff === 'us' ? 'US' : waiting ? eff!.toUpperCase() : '—';
  const club = c.targetClub || (c.contactClub && c.contactClub !== c.contactName ? c.contactClub : '');

  const header = `
    <div class="row">
      <div class="hdr">
        <div class="name">${esc(c.targetName)}</div>
        <div class="sub">${club ? `<span class="club-tag">${esc(club)}</span>` : ''}${c.contactName ? `<span class="sub-meta">${esc(c.contactName)}</span>` : ''}</div>
      </div>
      <span class="bic" style="background:${bicColor}1f;border-color:${bicColor};color:${bicColor === '#3a342a' ? '#8a8175' : bicColor}">${bicLabel}</span>
    </div>`;

  if (mode === 'short') return `<div class="card" style="border-left:3px solid ${bicColor}">${header}</div>`;

  const tracks = `
    <div class="badges">
      <span class="badge"><span class="badge-key">SELL</span><b>${esc(trackLabel[c.pitch.selling_track] ?? '—')}</b></span>
      <span class="badge"><span class="badge-key">BUY</span><b>${esc(trackLabel[c.pitch.buying_track] ?? '—')}</b></span>
      <span class="badge"><span class="badge-key">PLAYER</span><b>${esc(trackLabel[c.pitch.player_track] ?? '—')}</b></span>
    </div>`;

  let neg = '';
  const nt = c.pitch.negotiation_type;
  if (nt) {
    let cl: string | null = null;
    let cv: number | null = null;
    if (nt === 'Transfer') { cl = 'Ask'; cv = c.pitch.asking_price; }
    else if (nt === 'Free Agent') { cl = 'Agent Fee'; cv = c.pitch.loan_trigger_value; }
    else if (nt === 'Loan with Option to Buy' || nt === 'Loan with Obligation to Buy') { cl = 'Trigger'; cv = c.pitch.loan_trigger_value; }
    neg = `<div class="neg">
      <span class="neg-pill">${esc(negShort[nt] || nt)}</span>
      ${cl ? `<div class="neg-val"><span class="neg-key">${esc(cl)}</span><span class="neg-num">${esc(formatCompactEur(cv))}</span></div>` : ''}
    </div>`;
  }

  return `<div class="card" style="border-left:3px solid ${bicColor}">${header}${tracks}${neg}</div>`;
}

export function exportBuyKanbanPdf(columns: Column[], mode: 'detailed' | 'short', title = 'Buy-Side Pipeline') {
  const today = new Date();
  const stamp = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
  const totalPitches = columns.reduce((s, c) => s + c.pitches.length, 0);

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)} — ${stamp}</title>
<style>
  @page { size: A3 landscape; margin: 8mm; }
  * { box-sizing: border-box; }
  body { font-family: 'DM Sans', -apple-system, sans-serif; background: #0d0a07; color: #e8e0d0; margin: 0; padding: 14px 16px; }

  .top { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #c8952a; padding-bottom: 10px; margin-bottom: 14px; }
  .brand { display: flex; align-items: center; }
  h1 { font-size: 16px; letter-spacing: 0.18em; text-transform: uppercase; color: #e8e0d0; margin: 0; font-weight: 600; }
  .sub-title { font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase; color: #c8952a; margin-top: 2px; }
  .meta { text-align: right; font-size: 9px; color: #8a8175; letter-spacing: 0.1em; text-transform: uppercase; font-family: 'JetBrains Mono', monospace; }
  .meta .big { color: #c8952a; font-size: 18px; display: block; margin-bottom: 2px; }

  .grid { display: grid; grid-template-columns: repeat(${columns.length}, 1fr); gap: 10px; }
  .col { background: #15110d; border: 1px solid #2a241c; border-radius: 8px; padding: 10px; }
  .col-hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px dashed #2a241c; }
  .col-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.18em; color: #c8952a; }
  .col-count { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #e8e0d0; background: #2a241c; padding: 1px 8px; border-radius: 10px; min-width: 22px; text-align: center; }

  .card { background: #1a1612; border: 1px solid #2a241c; border-radius: 5px; padding: 8px 10px; margin-bottom: 7px; page-break-inside: avoid; }
  .row { display: flex; align-items: flex-start; gap: 8px; }
  .hdr { min-width: 0; flex: 1; }
  .name { font-size: 12px; font-weight: 600; color: #e8e0d0; line-height: 1.2; }
  .sub { font-size: 9px; color: #8a8175; display: flex; gap: 5px; align-items: center; margin-top: 2px; flex-wrap: wrap; }
  .club-tag { background: #2a241c; color: #e8e0d0; padding: 1px 5px; border-radius: 2px; font-size: 8px; letter-spacing: 0.05em; }
  .sub-meta { font-size: 9px; color: #8a8175; }
  .bic { display: inline-block; font-size: 8px; font-weight: 700; padding: 2px 6px; border-radius: 3px; border: 1px solid; font-family: 'JetBrains Mono', monospace; letter-spacing: 0.1em; flex-shrink: 0; }

  .badges { display: flex; gap: 4px; margin-top: 7px; flex-wrap: wrap; }
  .badge { font-family: 'JetBrains Mono', monospace; font-size: 8px; padding: 2px 6px; border-radius: 3px; background: #0d0a07; border: 1px solid #2a241c; color: #e8e0d0; display: inline-flex; gap: 5px; align-items: center; }
  .badge-key { color: #8a8175; letter-spacing: 0.08em; }
  .badge b { color: #c8952a; font-weight: 500; }

  .neg { display: flex; justify-content: space-between; align-items: center; gap: 6px; margin-top: 7px; padding: 5px 7px; background: #0d0a07; border-radius: 3px; border: 1px solid #2a241c; }
  .neg-pill { font-family: 'JetBrains Mono', monospace; font-size: 8px; padding: 2px 7px; border-radius: 10px; background: #c8952a; color: #0d0a07; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
  .neg-val { display: flex; align-items: baseline; gap: 5px; }
  .neg-key { font-size: 8px; color: #8a8175; text-transform: uppercase; letter-spacing: 0.1em; font-family: 'JetBrains Mono', monospace; }
  .neg-num { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #c8952a; font-weight: 700; }

  .empty { text-align: center; padding: 18px 0; font-style: italic; font-size: 9px; color: #5a5249; }
</style></head>
<body>
  <div class="top">
    <div class="brand">
      <div>
        <h1>${esc(title)}</h1>
        <div class="sub-title">${mode === 'short' ? 'Short overview' : 'Detailed report'}</div>
      </div>
    </div>
    <div class="meta">
      <span class="big">${totalPitches}</span>
      Active pitches · ${stamp}
    </div>
  </div>

  <div class="grid">
    ${columns.map(col => `
      <div class="col">
        <div class="col-hdr">
          <span class="col-title">${esc(col.title)}</span>
          <span class="col-count">${col.pitches.length}</span>
        </div>
        ${col.pitches.map(p => renderCard(p, mode)).join('') || '<div class="empty">No pitches</div>'}
      </div>
    `).join('')}
  </div>

  <script>
    window.onload = () => { setTimeout(() => { window.print(); }, 250); };
  </script>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
