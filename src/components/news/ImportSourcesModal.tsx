import { useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import {
  parseXlsx,
  buildPreview,
  PreviewSourceItem,
  PreviewSummary,
} from '@/lib/sourceImport';
import { Club, ClubSource } from '@/hooks/useClubsAndSources';
import { ChevronDown, ChevronRight, Upload, Loader2 } from 'lucide-react';

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clubs: Club[];
  existingSources: ClubSource[];
};

export default function ImportSourcesModal({ open, onOpenChange, clubs, existingSources }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const [parsing, setParsing] = useState(false);
  const [items, setItems] = useState<PreviewSourceItem[]>([]);
  const [summary, setSummary] = useState<PreviewSummary | null>(null);
  const [reviewExpanded, setReviewExpanded] = useState(false);
  const [reviewOverrides, setReviewOverrides] = useState<Record<number, string>>({}); // index -> club_id or 'skip'
  const [importing, setImporting] = useState(false);

  const reset = () => {
    setItems([]);
    setSummary(null);
    setReviewOverrides({});
    setReviewExpanded(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFile = async (file: File) => {
    setParsing(true);
    reset();
    try {
      const parsed = await parseXlsx(file);
      const refs = clubs.map((c) => ({ id: c.id, name: c.name, league: c.league, tier: c.tier }));
      const ex = existingSources.map((s) => ({ club_id: s.club_id, url: s.url }));
      const { items: built, summary: sum } = buildPreview(parsed, refs, ex);
      setItems(built);
      setSummary(sum);
    } catch (e: any) {
      toast.error(`Failed to parse file: ${e.message ?? 'unknown error'}`);
    } finally {
      setParsing(false);
    }
  };

  const reviewItems = useMemo(
    () => items.map((it, idx) => ({ it, idx })).filter((x) => x.it.status === 'needs_review'),
    [items]
  );

  const finalToInsert = useMemo(() => {
    return items
      .map((it, idx) => {
        if (it.status === 'ready') {
          return { club_id: it.matchedClubId!, url: it.normalizedUrl, label: it.label };
        }
        if (it.status === 'needs_review') {
          const ovr = reviewOverrides[idx];
          if (ovr && ovr !== 'skip') {
            return { club_id: ovr, url: it.normalizedUrl, label: it.label };
          }
        }
        return null;
      })
      .filter((x): x is { club_id: string; url: string; label: string } => !!x);
  }, [items, reviewOverrides]);

  const handleConfirm = async () => {
    if (finalToInsert.length === 0) {
      toast.error('Nothing to import');
      return;
    }
    setImporting(true);
    try {
      const { data, error } = await supabase.rpc('bulk_import_club_sources' as any, {
        p_sources: finalToInsert as any,
      });
      if (error) {
        toast.error(`Import failed: ${error.message}`);
      } else {
        const d = data as { inserted: number; skipped: number; errors: any[] };
        toast.success(`Imported ${d.inserted} sources, skipped ${d.skipped} duplicates`);
        if (d.errors?.length > 0) {
          console.error('Import errors:', d.errors);
          toast.warning(`${d.errors.length} items had errors — check console`);
        }
        qc.invalidateQueries({ queryKey: ['club-sources'] });
        onOpenChange(false);
        reset();
      }
    } catch (e: any) {
      toast.error(`Import failed: ${e.message ?? 'unknown error'}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import sources from xlsx</DialogTitle>
        </DialogHeader>

        {!summary && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Each sheet is a league. Rows under each club become sources for that club. Preview
              runs before any data is written.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <Button
              onClick={() => fileRef.current?.click()}
              disabled={parsing}
              className="w-full"
            >
              {parsing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Parsing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" /> Choose .xlsx file
                </>
              )}
            </Button>
          </div>
        )}

        {summary && (
          <div className="space-y-4">
            <div className="rounded-md border border-border p-3 bg-muted/20">
              <div className="text-sm font-medium mb-2">Summary</div>
              <ul className="text-sm space-y-1 font-mono">
                <li>✓ {summary.ready} sources ready to import</li>
                <li>⚠ {summary.needsReview} sources need review (fuzzy match below threshold)</li>
                <li>✗ {summary.invalid} URLs invalid (wrong format)</li>
                <li>↺ {summary.duplicates} sources already exist (will skip)</li>
                <li>✗ {summary.unmatched} unmatched (no club found)</li>
                <li>• {summary.skippedSheets.length} sheets skipped ({summary.skippedSheets.join(', ') || 'none'})</li>
              </ul>
            </div>

            <div>
              <div className="text-sm font-medium mb-2">By league</div>
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-xs font-mono">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="text-left p-2">Sheet</th>
                      <th className="text-right p-2">✓</th>
                      <th className="text-right p-2">⚠</th>
                      <th className="text-right p-2">✗</th>
                      <th className="text-right p-2">↺</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(summary.byLeague).map(([sheet, s]) => (
                      <tr key={sheet} className="border-t border-border">
                        <td className="p-2">{sheet}</td>
                        <td className="text-right p-2">{s.ready}</td>
                        <td className="text-right p-2">{s.needsReview}</td>
                        <td className="text-right p-2">{s.invalid + s.unmatched}</td>
                        <td className="text-right p-2">{s.duplicates}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {summary.unknownLeagues.length > 0 && (
                <p className="text-xs text-destructive mt-2">
                  Unknown leagues (no clubs in CRM): {summary.unknownLeagues.join(', ')}
                </p>
              )}
            </div>

            {reviewItems.length > 0 && (
              <div>
                <button
                  onClick={() => setReviewExpanded((v) => !v)}
                  className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  {reviewExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  Show items needing review ({reviewItems.length})
                </button>
                {reviewExpanded && (
                  <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
                    {reviewItems.map(({ it, idx }) => (
                      <div key={idx} className="rounded-md border border-border p-2 text-xs">
                        <div className="font-mono text-muted-foreground">{it.sheetName}</div>
                        <div className="font-medium">{it.rawClubName}</div>
                        <div className="text-muted-foreground truncate">{it.normalizedUrl}</div>
                        <Select
                          value={reviewOverrides[idx] ?? ''}
                          onValueChange={(v) => setReviewOverrides((p) => ({ ...p, [idx]: v }))}
                        >
                          <SelectTrigger className="mt-1 h-8">
                            <SelectValue placeholder="Pick a target club or skip" />
                          </SelectTrigger>
                          <SelectContent>
                            {(it.reviewCandidates ?? []).map((c) => (
                              <SelectItem key={c.clubId} value={c.clubId}>
                                {c.clubName} ({c.score}%)
                              </SelectItem>
                            ))}
                            <SelectItem value="skip">Skip this row</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
                Cancel
              </Button>
              <Button onClick={handleConfirm} disabled={importing || finalToInsert.length === 0}>
                {importing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing...
                  </>
                ) : (
                  `Confirm Import ${finalToInsert.length} sources`
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
