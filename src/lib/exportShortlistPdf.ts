import { CLIENT } from '@/config/client';
import { getAge, getLatestXtvM, isPrintable, type RosterPlayer } from '@/lib/rosterData';
import { requirementSummary } from '@/lib/shortlistToPitch';

/**
 * The sheet that goes to the club.
 *
 * Print HTML rather than jsPDF, the same way the dealflow export works: it is
 * a page of type, and a browser sets type better than a canvas rasteriser.
 *
 * The rule that matters here is provenance. This is the only artifact a club
 * sees, and a contract date we guessed at, printed as fact, is worse than a
 * blank — it is the kind of mistake that ends a relationship with a sporting
 * director. Every field goes through `isPrintable`, exactly as the player
 * dossier does.
 */

interface ShortlistPlayer {
  entry: { rank: number; note: string | null; match_score: number | null };
  player: RosterPlayer;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A value, or an em dash. Never a guess. */
const printable = (player: RosterPlayer, field: keyof RosterPlayer, value: string | undefined) =>
  value && isPrintable(player, field) ? esc(value) : '—';

export function exportShortlistPdf(input: {
  clubName: string;
  requirement: Parameters<typeof requirementSummary>[0] & { notes?: string | null };
  players: ShortlistPlayer[];
}) {
  const { clubName, requirement, players } = input;
  const today = new Date();
  const stamp = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

  const rows = players.map(({ entry, player }, i) => {
    const age = getAge(player.dob) ?? player.age;
    const xtv = getLatestXtvM(player);
    return `
      <div class="player">
        <div class="p-head">
          <span class="p-rank">${i + 1}</span>
          <span class="p-name">${esc(player.name)}</span>
          <span class="p-pos">${esc(player.position || '')}</span>
        </div>
        <div class="p-grid">
          <div><span class="k">Age</span><span class="v">${age != null ? age : '—'}</span></div>
          <div><span class="k">Nationality</span><span class="v">${printable(player, 'nationality', player.nationality)}</span></div>
          <div><span class="k">Club</span><span class="v">${printable(player, 'currentClub', player.currentClub)}</span></div>
          <div><span class="k">League</span><span class="v">${printable(player, 'league', player.league)}</span></div>
          <div><span class="k">Contract to</span><span class="v">${printable(player, 'contractEndDate', player.contractEndDate)}</span></div>
          <div><span class="k">Valuation</span><span class="v">${xtv != null ? `€${xtv.toFixed(1)}m` : '—'}</span></div>
          <div><span class="k">Foot</span><span class="v">${esc(player.trPreferredFoot || player.foot || '—')}</span></div>
          <div><span class="k">Height</span><span class="v">${printable(player, 'height', player.height)}</span></div>
        </div>
        ${entry.note ? `<p class="p-note">${esc(entry.note)}</p>` : ''}
      </div>`;
  }).join('');

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(clubName)} — shortlist ${stamp}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: 'DM Sans', -apple-system, sans-serif; background: #0d0a07; color: #e8e0d0; margin: 0; padding: 0; }

  .top { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #c8952a; padding-bottom: 10px; margin-bottom: 16px; }
  .logo { height: 30px; width: auto; }
  h1 { font-size: 15px; letter-spacing: 0.14em; text-transform: uppercase; margin: 8px 0 0; font-weight: 600; }
  .meta { text-align: right; font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: #8a8175; font-family: 'JetBrains Mono', monospace; }

  .brief { background: #15110d; border: 1px solid #2a241c; border-left: 3px solid #c8952a; border-radius: 6px; padding: 10px 12px; margin-bottom: 16px; }
  .brief .label { font-size: 8px; letter-spacing: 0.2em; text-transform: uppercase; color: #c8952a; }
  .brief .line { font-size: 13px; margin-top: 3px; }
  .brief .notes { font-size: 10px; color: #8a8175; margin-top: 5px; }

  .player { background: #15110d; border: 1px solid #2a241c; border-radius: 6px; padding: 10px 12px; margin-bottom: 9px; page-break-inside: avoid; }
  .p-head { display: flex; align-items: baseline; gap: 8px; border-bottom: 1px dashed #2a241c; padding-bottom: 6px; margin-bottom: 7px; }
  .p-rank { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #c8952a; }
  .p-name { font-size: 14px; font-weight: 600; }
  .p-pos { font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: #8a8175; }

  .p-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 12px; }
  .p-grid > div { display: flex; flex-direction: column; }
  .k { font-size: 7.5px; letter-spacing: 0.16em; text-transform: uppercase; color: #8a8175; }
  .v { font-size: 11px; margin-top: 1px; }

  .p-note { font-size: 10px; color: #c9bfae; margin: 8px 0 0; padding-top: 7px; border-top: 1px dashed #2a241c; font-style: italic; }

  .foot { margin-top: 16px; padding-top: 8px; border-top: 1px solid #2a241c; font-size: 8px; letter-spacing: 0.1em; color: #6e675c; text-transform: uppercase; }
</style></head>
<body>
  <div class="top">
    <div>
      <img class="logo" src="${CLIENT.logoPathReversed}" alt="${esc(CLIENT.shortName)}" />
      <h1>Shortlist — ${esc(clubName)}</h1>
    </div>
    <div class="meta">
      <div>${stamp}</div>
      <div>${players.length} player${players.length === 1 ? '' : 's'}</div>
    </div>
  </div>

  <div class="brief">
    <div class="label">The brief</div>
    <div class="line">${esc(requirementSummary(requirement))}</div>
    ${requirement.notes ? `<div class="notes">${esc(requirement.notes)}</div>` : ''}
  </div>

  ${rows}

  <div class="foot">${esc(CLIENT.pdfConfidentialityNote)} — ${esc(CLIENT.legalName)}</div>

  <script>
    // Wait for the mark to load, or it prints as a broken image box.
    const done = () => setTimeout(() => window.print(), 250);
    const img = document.querySelector('img');
    if (img && !img.complete) { img.onload = done; img.onerror = done; } else { done(); }
  </script>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) {
    // Pop-up blockers are the usual cause and the user can fix it.
    throw new Error('Allow pop-ups for this site to print the shortlist.');
  }
  w.document.write(html);
  w.document.close();
}
