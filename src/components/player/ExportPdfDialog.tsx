import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { RosterPlayer as Player, getAge, getPositionGroup, parsePlayerDob, hasMandateData, hasTrData, getLatestXtvM, getXtvChange6mPct, getXtvChange12mPct, isPrintable } from '@/lib/rosterData';
import { formatCurrency } from '@/lib/currency';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { Download, Loader2, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { t, tr, formatPdfDate, Lang } from '@/lib/pdfTranslations';
import { useTrTeamHistory, findTrFee } from '@/hooks/useTrTeamHistory';
import { CLIENT } from '@/config/client';

type SectionKey = 'sporting' | 'highlight' | 'financials' | 'market' | 'xtv' | 'gbe' | 'transfers';

interface SectionDef {
  key: SectionKey;
  defaultOn: boolean;
}

const SECTIONS: SectionDef[] = [
  { key: 'sporting', defaultOn: true },
  { key: 'highlight', defaultOn: true },
  { key: 'financials', defaultOn: false }, // default OFF
  { key: 'market', defaultOn: true },
  { key: 'xtv', defaultOn: true },
  { key: 'gbe', defaultOn: true },
  { key: 'transfers', defaultOn: true },
];

function getYouTubeId(url: string): string | null {
  const m = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/) || url.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function formatEurM(v: number | undefined): string {
  if (v == null) return '—';
  return v >= 1 ? `€${v.toFixed(1)}M` : `€${(v * 1000).toFixed(0)}K`;
}

function formatTransferFee(fee: number | null, feeEurM: number | null, lang: Lang): string {
  if (feeEurM != null) return feeEurM > 0 ? `€${feeEurM.toFixed(1)}M` : (lang === 'pt' ? 'Livre' : 'Free');
  if (fee != null) return fee > 0 ? `€${(fee / 1_000_000).toFixed(1)}M` : (lang === 'pt' ? 'Livre' : 'Free');
  return '—';
}

// Simple inline SVG line chart for xTV history
function XtvSvgChart({ data }: { data: { label: string; value: number }[] }) {
  if (data.length === 0) return null;
  const W = 700, H = 220, PADL = 50, PADR = 16, PADT = 16, PADB = 36;
  const innerW = W - PADL - PADR;
  const innerH = H - PADT - PADB;
  const values = data.map(d => d.value);
  const maxV = Math.max(...values) * 1.1 || 1;
  const minV = 0;
  const xStep = data.length > 1 ? innerW / (data.length - 1) : 0;
  const yFor = (v: number) => PADT + innerH - ((v - minV) / (maxV - minV)) * innerH;
  const xFor = (i: number) => PADL + i * xStep;
  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(d.value)}`).join(' ');
  const areaPath = `${linePath} L ${xFor(data.length - 1)} ${PADT + innerH} L ${PADL} ${PADT + innerH} Z`;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(p => minV + p * (maxV - minV));
  const xTickIdx = data.length <= 6
    ? data.map((_, i) => i)
    : [0, Math.floor(data.length / 4), Math.floor(data.length / 2), Math.floor(3 * data.length / 4), data.length - 1];

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id="pdfXtvGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c8952a" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#c8952a" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Grid lines + Y labels */}
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={PADL} y1={yFor(v)} x2={W - PADR} y2={yFor(v)} stroke="#3a3a3a" strokeWidth="0.5" />
          <text x={PADL - 6} y={yFor(v) + 3} fontSize="10" fill="#998a70" textAnchor="end" fontFamily="DM Sans, sans-serif">
            €{v.toFixed(1)}M
          </text>
        </g>
      ))}
      {/* X labels */}
      {xTickIdx.map(i => (
        <text key={i} x={xFor(i)} y={H - PADB + 16} fontSize="10" fill="#998a70" textAnchor="middle" fontFamily="DM Sans, sans-serif">
          {data[i].label}
        </text>
      ))}
      <path d={areaPath} fill="url(#pdfXtvGrad)" />
      <path d={linePath} fill="none" stroke="#c8952a" strokeWidth="2" />
      {data.map((d, i) => (
        <circle key={i} cx={xFor(i)} cy={yFor(d.value)} r="2.5" fill="#c8952a" />
      ))}
    </svg>
  );
}

interface ExportPdfDialogProps {
  player: Player;
  open: boolean;
  onClose: () => void;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function ExportPdfDialog({ player, open, onClose }: ExportPdfDialogProps) {
  const [lang, setLang] = useState<Lang>('en');
  const [sections, setSections] = useState<Record<SectionKey, boolean>>(
    SECTIONS.reduce((acc, s) => ({ ...acc, [s.key]: s.defaultOn }), {} as Record<SectionKey, boolean>)
  );
  const [generating, setGenerating] = useState(false);
  const [directorsNotes, setDirectorsNotes] = useState('');

  const templateRef = useRef<HTMLDivElement>(null);

  const toggle = (k: SectionKey) => setSections(prev => ({ ...prev, [k]: !prev[k] }));

  const handleGenerate = async () => {
    if (!templateRef.current) return;
    setGenerating(true);
    try {
      // Wait for all images to fully load
      const imgs = Array.from(templateRef.current.querySelectorAll('img'));
      await Promise.all(imgs.map(img => img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise(res => {
            img.onload = () => res(null);
            img.onerror = () => res(null);
            // Safety timeout
            setTimeout(() => res(null), 4000);
          })
      ));

      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const PAGE_W = pdf.internal.pageSize.getWidth();   // 210
      const PAGE_H = pdf.internal.pageSize.getHeight();  // 297
      const MARGIN = 10;
      const CONTENT_W = PAGE_W - MARGIN * 2;
      const MAX_Y = PAGE_H - MARGIN;
      const GAP = 4;

      // Fill page background
      const fillBg = () => {
        pdf.setFillColor(13, 10, 6);
        pdf.rect(0, 0, PAGE_W, PAGE_H, 'F');
      };
      fillBg();

      let cursorY = MARGIN;
      const blocks = Array.from(
        templateRef.current.querySelectorAll<HTMLElement>('[data-pdf-block]')
      );

      for (const block of blocks) {
        const blockRect = block.getBoundingClientRect();
        const canvas = await html2canvas(block, {
          scale: 2,
          backgroundColor: '#0d0a06',
          useCORS: true,
          allowTaint: true,
          logging: false,
        });

        // Maintain aspect ratio
        const imgH = (canvas.height * CONTENT_W) / canvas.width;
        const scaleMm = CONTENT_W / blockRect.width;

        // If block won't fit on current page, start a new page
        if (cursorY + imgH > MAX_Y && cursorY > MARGIN) {
          pdf.addPage();
          fillBg();
          cursorY = MARGIN;
        }

        // If a single block is taller than a full page, slice it
        const availableOnPage = MAX_Y - cursorY;
        const blockStartY = cursorY;
        const blockStartPage = pdf.getNumberOfPages();
        let wasSliced = false;
        if (imgH > MAX_Y - MARGIN) {
          wasSliced = true;
          // Slice into page-height chunks
          const pxPerMm = canvas.width / CONTENT_W;
          let srcY = 0;
          let remainingMm = imgH;
          let firstSlice = true;
          while (remainingMm > 0) {
            const sliceMm = firstSlice ? availableOnPage : MAX_Y - MARGIN;
            const sliceHpx = Math.min(canvas.height - srcY, sliceMm * pxPerMm);
            const sliceCanvas = document.createElement('canvas');
            sliceCanvas.width = canvas.width;
            sliceCanvas.height = sliceHpx;
            const ctx = sliceCanvas.getContext('2d')!;
            ctx.fillStyle = '#0d0a06';
            ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
            ctx.drawImage(canvas, 0, srcY, canvas.width, sliceHpx, 0, 0, canvas.width, sliceHpx);
            const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.92);
            const drawnMm = sliceHpx / pxPerMm;
            pdf.addImage(sliceData, 'JPEG', MARGIN, firstSlice ? cursorY : MARGIN, CONTENT_W, drawnMm);
            srcY += sliceHpx;
            remainingMm -= drawnMm;
            firstSlice = false;
            if (remainingMm > 0.5) {
              pdf.addPage();
              fillBg();
              cursorY = MARGIN;
            } else {
              cursorY = MARGIN + drawnMm + GAP;
            }
          }
        } else {
          const data = canvas.toDataURL('image/jpeg', 0.92);
          pdf.addImage(data, 'JPEG', MARGIN, cursorY, CONTENT_W, imgH);
          cursorY += imgH + GAP;
        }

        // Add clickable link annotations (only when block fits on a single page)
        if (!wasSliced) {
          const linkEls = Array.from(
            block.querySelectorAll<HTMLElement>('[data-pdf-link]')
          );
          for (const el of linkEls) {
            const url = el.getAttribute('data-pdf-link');
            if (!url) continue;
            const r = el.getBoundingClientRect();
            const x = MARGIN + (r.left - blockRect.left) * scaleMm;
            const y = blockStartY + (r.top - blockRect.top) * scaleMm;
            const w = r.width * scaleMm;
            const h = r.height * scaleMm;
            pdf.setPage(blockStartPage);
            pdf.link(x, y, w, h, { url });
          }
        }
      }

      // Footer on each page
      const pageCount = pdf.getNumberOfPages();
      pdf.setFontSize(8);
      pdf.setTextColor(153, 138, 112);
      for (let p = 1; p <= pageCount; p++) {
        pdf.setPage(p);
        pdf.text(
          `${CLIENT.pdfBrandMark} — ${tr('confidential', lang)}`,
          MARGIN,
          PAGE_H - 4
        );
        pdf.text(
          `${tr('page', lang)} ${p} ${tr('of', lang)} ${pageCount}`,
          PAGE_W - MARGIN,
          PAGE_H - 4,
          { align: 'right' }
        );
      }

      const today = new Date().toISOString().slice(0, 10);
      const safeName = player.name.replace(/[^a-zA-Z0-9]+/g, '-');
      pdf.save(`${safeName}_${CLIENT.shortName}_${today}.pdf`);
      toast.success(lang === 'pt' ? 'PDF gerado' : 'PDF generated');
      onClose();
    } catch (e) {
      console.error('PDF export error', e);
      toast.error(lang === 'pt' ? 'Erro ao gerar PDF' : 'PDF generation failed');
    } finally {
      setGenerating(false);
    }
  };


  // Template data
  const dob = parsePlayerDob(player.dob);
  const age = getAge(player.dob);
  const hasFin = hasMandateData(player);
  const hasTr = hasTrData(player);
  const latestXtv = getLatestXtvM(player);
  const change6m = getXtvChange6mPct(player);
  const change12m = getXtvChange12mPct(player);
  const videoUrl = player.videoUrl;
  const ytId = videoUrl ? getYouTubeId(videoUrl) : null;
  const ytThumb = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null;

  const xtvData = player.xtvHistory.map(d => ({
    label: `${MONTHS[d.month - 1]} ${String(d.year).slice(2)}`,
    value: d.xtv / 1_000_000,
  }));

  const trHistory = useTrTeamHistory(player.trId);
  const sortedTransfers = [...player.transferHistory].sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const gen = lang === 'pt' ? new Date().toLocaleDateString('pt-BR') : new Date().toLocaleDateString('en-US');

  // ----- PDF Template (rendered into portal off-screen) -----
  const template = (
    <div
      ref={templateRef}
      style={{
        position: 'fixed',
        left: '-99999px',
        top: 0,
        width: '794px',
        background: '#0d0a06',
        color: '#e8e0d0',
        fontFamily: 'DM Sans, system-ui, sans-serif',
        padding: '32px',
        boxSizing: 'border-box',
      }}
    >
      {/* HEADER + HERO (single block so they stay together on page 1) */}
      <div data-pdf-block style={{ marginBottom: 0 }}>
        {/* Page header with client logo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #2a2118', paddingBottom: 16, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <img
              src={CLIENT.logoPath}
              alt={CLIENT.shortName}
              style={{ width: 43, height: 48, objectFit: 'contain', display: 'block', flexShrink: 0 }}
            />

            <div>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1.5, color: '#e8e0d0' }}>{CLIENT.pdfBrandMark}</div>
              <div style={{ fontSize: 10, color: '#998a70', letterSpacing: 2, marginTop: 2 }}>{tr('confidential', lang)}</div>
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 10, color: '#998a70' }}>
            {tr('generatedOn', lang)} {gen}
          </div>
        </div>

        {/* Hero: photo + name */}
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', marginBottom: 16 }}>
          {player.photoUrl && (
            <div style={{ width: 180, flexShrink: 0, borderRadius: 8, border: '2px solid #c8952a', background: '#1a1410', overflow: 'hidden' }}>
              <img
                src={player.photoUrl}
                alt={player.name}
                crossOrigin="anonymous"
                style={{
                  width: '100%',
                  height: 'auto',
                  display: 'block',
                }}
              />
            </div>
          )}
          <div style={{ flex: 1, paddingTop: 8, minWidth: 0 }}>
            <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.1, color: '#e8e0d0', marginBottom: 6 }}>{player.name}</div>
            <div style={{ fontSize: 13, color: '#998a70', marginBottom: 14 }}>{player.fullName}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <span style={{ padding: '4px 10px', borderRadius: 6, background: '#c8952a', color: '#0d0a06', fontSize: 12, fontWeight: 600 }}>{player.position}</span>
              <span style={{ padding: '4px 10px', borderRadius: 6, background: '#1a1410', border: '1px solid #2a2118', fontSize: 12 }}>{age} {tr('yrs', lang)}</span>
              <span style={{ padding: '4px 10px', borderRadius: 6, background: '#1a1410', border: '1px solid #2a2118', fontSize: 12 }}>{player.nationality}</span>
              <span style={{ padding: '4px 10px', borderRadius: 6, background: '#1a1410', border: '1px solid #2a2118', fontSize: 12 }}>{player.height}m</span>
              {player.currentClub && (
                <span style={{ padding: '4px 10px', borderRadius: 6, background: '#1a1410', border: '1px solid #2a2118', fontSize: 12 }}>{player.currentClub}</span>
              )}
              {hasTr && player.trEuPassport && (
                <span style={{ padding: '4px 10px', borderRadius: 6, background: '#1a1410', border: '1px solid #2a2118', fontSize: 12 }}>🇪🇺 {tr('euPassport', lang)}</span>
              )}
              {hasTr && latestXtv != null && (
                <span style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(200,149,42,0.15)', border: '1px solid rgba(200,149,42,0.4)', color: '#c8952a', fontSize: 12, fontWeight: 600 }}>
                  xTV {formatEurM(latestXtv)}{change6m != null && change6m !== 0 ? ` ${change6m > 0 ? '↑' : '↓'}${Math.abs(change6m)}%` : ''}
                </span>
              )}
            </div>
            {directorsNotes.trim() && (
              <div style={{ marginBottom: 12, padding: '10px 12px', background: '#1a1410', border: '1px solid #2a2118', borderLeft: '3px solid #c8952a', borderRadius: 6 }}>
                <div style={{ fontSize: 9, letterSpacing: 1.5, fontWeight: 700, color: '#c8952a', textTransform: 'uppercase', marginBottom: 4 }}>
                  {tr('directorsNotes', lang)}
                </div>
                <div style={{ fontSize: 12, color: '#e8e0d0', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                  {directorsNotes}
                </div>
              </div>
            )}
            {player.tmLink && (
              <div style={{ fontSize: 11, color: '#998a70', wordBreak: 'break-all' }}>
                Transfermarkt:{' '}
                <span data-pdf-link={player.tmLink} style={{ color: '#c8952a', textDecoration: 'underline' }}>
                  {player.tmLink}
                </span>
              </div>
            )}

          </div>
        </div>
      </div>


      {/* SPORTING */}
      {sections.sporting && (
        <PdfSection title={tr('sporting', lang)}>
          <PdfGrid cols={3}>
            <PdfField label={tr('position', lang)} value={player.position} />
            <PdfField label={tr('dob', lang)} value={`${age} (${dob.getFullYear()})`} />
            <PdfField label={tr('nationality', lang)} value={player.nationality} />
            <PdfField label={tr('height', lang)} value={`${player.height}m`} />
            <PdfField label={tr('previousClub', lang)} value={player.previousClub} />
            <PdfField label={tr('currentClub', lang)} value={player.currentClub} />
            {player.trPreferredFoot && <PdfField label={tr('preferredFoot', lang)} value={player.trPreferredFoot} />}
            {player.trPlayingStyle && <PdfField label={tr('playingStyle', lang)} value={player.trPlayingStyle} />}
            {player.trSecondPosition && <PdfField label={tr('secondPosition', lang)} value={player.trSecondPosition} />}
            {player.trRating != null && <PdfField label={tr('trRating', lang)} value={String(player.trRating)} />}
            {player.trPotential != null && <PdfField label={tr('trPotential', lang)} value={String(player.trPotential)} />}
            {player.trRecentMinsPct != null && <PdfField label={tr('recentMinutes', lang)} value={`${player.trRecentMinsPct}%`} />}
          </PdfGrid>
        </PdfSection>
      )}

      {/* HIGHLIGHT */}
      {sections.highlight && videoUrl && (
        <PdfSection title={tr('highlight', lang)}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            {ytThumb ? (
              <div data-pdf-link={videoUrl} style={{ width: 240, flexShrink: 0, display: 'block', borderRadius: 6, border: '1px solid #2a2118', overflow: 'hidden', position: 'relative' }}>
                <img src={ytThumb} crossOrigin="anonymous" alt="thumb" style={{ width: '100%', height: 'auto', display: 'block' }} />
              </div>
            ) : (
              <div data-pdf-link={videoUrl} style={{ width: 240, height: 135, borderRadius: 6, border: '1px solid #2a2118', background: '#1a1410', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <div style={{ width: 0, height: 0, borderLeft: '24px solid #c8952a', borderTop: '16px solid transparent', borderBottom: '16px solid transparent' }} />
              </div>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: '#e8e0d0', marginBottom: 6, fontWeight: 600 }}>{tr('clickPictureToOpen', lang)}</div>
              <div style={{ fontSize: 12, color: '#998a70', marginBottom: 8 }}>{tr('watchVideo', lang)}:</div>
              <div data-pdf-link={videoUrl} style={{ fontSize: 11, color: '#c8952a', wordBreak: 'break-all', textDecoration: 'underline' }}>{videoUrl}</div>
            </div>
          </div>
        </PdfSection>
      )}

      {/* FINANCIALS */}
      {sections.financials && (
        <PdfSection title={tr('financials', lang)}>
          {!hasFin ? (
            <PdfEmpty lang={lang} />
          ) : (
            <PdfGrid cols={2}>
              <div>
                <PdfSubheading>{tr('contractRights', lang)}</PdfSubheading>
                {isPrintable(player, 'contractEndDate') && (
                  <PdfField label={tr('contractEnd', lang)} value={formatPdfDate(player.contractEndDate, lang)} />
                )}
                {isPrintable(player, 'currentClub') && (
                  <PdfField label={tr('currentClub', lang)} value={player.currentClub} />
                )}
                {isPrintable(player, 'marketValue') && (
                  <PdfField label={tr('marketValue', lang)} value={formatCurrency(player.marketValue)} />
                )}
              </div>
              <div>
                <PdfSubheading>{tr('mandate', lang)}</PdfSubheading>
                <PdfField label={tr('mandateStart', lang)} value={formatPdfDate(player.mandateStart, lang)} />
                <PdfField label={tr('mandateEnd', lang)} value={formatPdfDate(player.mandateEnd, lang)} />
                {player.exclusive != null && (
                  <PdfField
                    label={tr('exclusivity', lang)}
                    value={player.exclusive ? tr('exclusiveYes', lang) : tr('exclusiveNo', lang)}
                  />
                )}
                {player.commissionPct != null && (
                  <PdfField label={tr('commission', lang)} value={`${player.commissionPct}%`} />
                )}
                {player.sellOnPct != null && (
                  <PdfField label={tr('sellOn', lang)} value={`${player.sellOnPct}%`} />
                )}
              </div>
            </PdfGrid>
          )}
        </PdfSection>
      )}

      {/* MARKET */}
      {sections.market && (
        <PdfSection title={tr('market', lang)}>
          {!hasTr ? <PdfEmpty lang={lang} /> : (
            <PdfGrid cols={2}>
              <div>
                <PdfSubheading>{tr('valuation', lang)}</PdfSubheading>
                <PdfField label={tr('xtvLabel', lang)} value={formatEurM(latestXtv)} />
                <PdfField label={tr('xtv6m', lang)} value={change6m != null ? `${change6m > 0 ? '+' : ''}${change6m}%` : '—'} />
                <PdfField label={tr('xtv12m', lang)} value={change12m != null ? `${change12m > 0 ? '+' : ''}${change12m}%` : '—'} />
                <PdfField label={tr('baseValue', lang)} value={formatEurM(player.trBaseValue)} />
              </div>
              <div>
                <PdfSubheading>{tr('availability', lang)}</PdfSubheading>
                <PdfField label={tr('availableForSale', lang)} value={player.trAvailableForSale || tr('notListed', lang)} />
                <PdfField label={tr('askingPrice', lang)} value={formatEurM(player.trAskingPrice)} />
                <PdfField label={tr('sellOn', lang)} value={player.trSellOnPct != null ? `${player.trSellOnPct}%` : '—'} />
                <PdfField label={tr('agency', lang)} value={player.trAgency ? `${player.trAgency}${player.trAgencyVerified === 'Yes' ? ' ✓' : ''}` : '—'} />
              </div>
            </PdfGrid>
          )}
        </PdfSection>
      )}

      {/* XTV CHART */}
      {sections.xtv && (
        <PdfSection title={tr('xtv', lang)}>
          {!hasTr || xtvData.length === 0 ? <PdfEmpty lang={lang} /> : (
            <div style={{ background: '#1a1410', padding: 12, borderRadius: 6 }}>
              <XtvSvgChart data={xtvData} />
            </div>
          )}
        </PdfSection>
      )}

      {/* GBE */}
      {sections.gbe && (
        <PdfSection title={tr('gbe', lang)}>
          {!hasTr || player.trGbeResult == null ? <PdfEmpty lang={lang} /> : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ padding: '6px 12px', borderRadius: 6, background: 'rgba(200,149,42,0.15)', border: '1px solid rgba(200,149,42,0.4)', color: '#c8952a', fontSize: 13, fontWeight: 600 }}>
                {player.trGbeResult}
              </span>
              {player.trGbeScore != null && (
                <span style={{ fontSize: 14, color: '#e8e0d0', fontWeight: 600 }}>{player.trGbeScore} {tr('gbeScore', lang)}</span>
              )}
            </div>
          )}
        </PdfSection>
      )}

      {/* TRANSFERS */}
      {sections.transfers && (
        <PdfSection title={tr('transfers', lang)}>
          {!hasTr || sortedTransfers.length === 0 ? <PdfEmpty lang={lang} /> : (
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #2a2118', color: '#998a70', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
                  <th style={{ textAlign: 'left', padding: '6px 0', fontWeight: 500 }}>{tr('date', lang)}</th>
                  <th style={{ textAlign: 'left', padding: '6px 0', fontWeight: 500 }}>{tr('fromTo', lang)}</th>
                  <th style={{ textAlign: 'right', padding: '6px 0', fontWeight: 500 }}>{tr('fee', lang)}</th>
                  <th style={{ textAlign: 'right', padding: '6px 0', fontWeight: 500 }}>{tr('type', lang)}</th>
                </tr>
              </thead>
              <tbody>
                {sortedTransfers.map((tt, i) => {
                  const trFee = tt.fee == null && tt.feeEurM == null ? findTrFee(trHistory, tt.date) : null;
                  return (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(42,33,24,0.5)' }}>
                    <td style={{ padding: '6px 0', color: '#998a70' }}>{formatPdfDate(tt.date, lang)}</td>
                    <td style={{ padding: '6px 0', color: '#e8e0d0' }}>{tt.fromTeam} → {tt.toTeam}</td>
                    <td style={{ padding: '6px 0', textAlign: 'right', color: '#e8e0d0' }}>{formatTransferFee(tt.fee ?? trFee, tt.feeEurM, lang)}</td>
                    <td style={{ padding: '6px 0', textAlign: 'right', color: '#998a70' }}>{tt.transferType}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </PdfSection>
      )}

      {/* Footer drawn by jsPDF per-page */}
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && !generating && onClose()}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <FileDown className="h-5 w-5 text-primary" />
              {tr('exportTitle', lang)}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Language */}
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 block">
                {tr('language', lang)}
              </Label>
              <RadioGroup value={lang} onValueChange={(v) => setLang(v as Lang)} className="flex gap-4">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="en" id="lang-en" />
                  <Label htmlFor="lang-en" className="text-sm cursor-pointer">{tr('english', lang)}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="pt" id="lang-pt" />
                  <Label htmlFor="lang-pt" className="text-sm cursor-pointer">{tr('portuguese', lang)}</Label>
                </div>
              </RadioGroup>
            </div>

            {/* Sections */}
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 block">
                {tr('includeSections', lang)}
              </Label>
              <div className="space-y-2">
                {SECTIONS.map(s => (
                  <div key={s.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`sec-${s.key}`}
                      checked={sections[s.key]}
                      onCheckedChange={() => toggle(s.key)}
                    />
                    <Label htmlFor={`sec-${s.key}`} className="text-sm cursor-pointer text-foreground">
                      {tr(s.key, lang)}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Director's Notes */}
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 block">
                {tr('directorsNotes', lang)}
              </Label>
              <Textarea
                value={directorsNotes}
                onChange={(e) => setDirectorsNotes(e.target.value)}
                placeholder={tr('directorsNotesPlaceholder', lang)}
                className="text-sm bg-background border-border min-h-[90px]"
              />
            </div>
          </div>


          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={generating}>
              {tr('cancel', lang)}
            </Button>
            <Button onClick={handleGenerate} disabled={generating} className="bg-primary text-primary-foreground">
              {generating ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> {tr('generating', lang)}</>
              ) : (
                <><Download className="h-4 w-4 mr-1" /> {tr('generate', lang)}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Off-screen template portal — only mounted while open so refs exist */}
      {open && createPortal(template, document.body)}
    </>
  );
}

// --- Small PDF building-block components ---

function PdfSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div data-pdf-block style={{ background: '#1a1410', border: '1px solid #2a2118', borderRadius: 8, padding: 18 }}>
      <div style={{ fontSize: 10, letterSpacing: 2, fontWeight: 700, color: '#c8952a', textTransform: 'uppercase', marginBottom: 14 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function PdfGrid({ cols, children }: { cols: number; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 18 }}>
      {children}
    </div>
  );
}

function PdfField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 9, color: '#998a70', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#e8e0d0' }}>{value || '—'}</div>
    </div>
  );
}

function PdfSubheading({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, color: '#998a70', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 10 }}>
      {children}
    </div>
  );
}

function PdfEmpty({ lang }: { lang: Lang }) {
  return <div style={{ fontSize: 12, color: '#998a70', fontFamily: 'monospace' }}>{tr('noData', lang)}</div>;
}
