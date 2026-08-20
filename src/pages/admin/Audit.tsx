import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type AuditSummary = {
  total: number;
  by_urgency: Record<string, number>;
  top_submitter: { name: string | null; count: number } | null;
  top_clubs: Array<{ name: string; count: number }>;
};

type Row = {
  id: string;
  created_at: string;
  url: string;
  blurb: string;
  urgency: string;
  digest_emailed_at: string | null;
  super_urgent_emailed_at: string | null;
  submitted_by: string;
  submitter_name: string | null;
  clubs: string;
  deleted_at: string | null;
};

const urgencyColor = (u: string) =>
  u === 'super_urgent' ? 'bg-destructive/15 text-destructive border-destructive/30'
  : u === 'urgent' ? 'bg-primary/15 text-primary border-primary/30'
  : 'bg-muted text-muted-foreground border-border';

const PAGE_SIZE = 100;

export default function Audit() {
  const [urgencyFilter, setUrgencyFilter] = useState<string>('all');
  const [submitterFilter, setSubmitterFilter] = useState<string>('all');
  const [clubFilter, setClubFilter] = useState<string>('');
  const [daysBack, setDaysBack] = useState<number>(7);
  const [page, setPage] = useState(0);

  const { data: summary } = useQuery({
    queryKey: ['audit-summary'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('audit_summary_week');
      if (error) throw error;
      return data as unknown as AuditSummary;
    },
  });

  const { data: rows = [], refetch } = useQuery({
    queryKey: ['audit-rows', daysBack],
    queryFn: async () => {
      const since = new Date(Date.now() - daysBack * 86400_000).toISOString();
      const { data, error } = await supabase
        .from('news_items')
        .select('id, created_at, url, blurb, urgency, digest_emailed_at, super_urgent_emailed_at, submitted_by, deleted_at, news_items_clubs(clubs(name))')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(2000);
      if (error) throw error;

      const submitterIds = Array.from(new Set((data ?? []).map((r: any) => r.submitted_by)));
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', submitterIds);
      const nameMap = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]));

      return (data ?? []).map((r: any): Row => ({
        id: r.id,
        created_at: r.created_at,
        url: r.url,
        blurb: r.blurb,
        urgency: r.urgency,
        digest_emailed_at: r.digest_emailed_at,
        super_urgent_emailed_at: r.super_urgent_emailed_at,
        submitted_by: r.submitted_by,
        submitter_name: nameMap.get(r.submitted_by) ?? null,
        clubs: (r.news_items_clubs ?? []).map((nc: any) => nc.clubs?.name).filter(Boolean).join(', '),
        deleted_at: r.deleted_at,
      }));
    },
  });

  const submitters = useMemo(() => {
    const set = new Map<string, string>();
    rows.forEach((r) => { if (r.submitter_name) set.set(r.submitted_by, r.submitter_name); });
    return Array.from(set.entries());
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (r.deleted_at) return false;
      if (urgencyFilter !== 'all' && r.urgency !== urgencyFilter) return false;
      if (submitterFilter !== 'all' && r.submitted_by !== submitterFilter) return false;
      if (clubFilter && !r.clubs.toLowerCase().includes(clubFilter.toLowerCase())) return false;
      return true;
    });
  }, [rows, urgencyFilter, submitterFilter, clubFilter]);

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const exportCsv = () => {
    const headers = ['id', 'created_at', 'submitter', 'clubs', 'urgency', 'blurb', 'url', 'digest_emailed_at', 'super_urgent_emailed_at'];
    const lines = [headers.join(',')];
    filtered.forEach((r) => {
      const cells = [
        r.id, r.created_at, r.submitter_name ?? '', r.clubs, r.urgency,
        r.blurb, r.url, r.digest_emailed_at ?? '', r.super_urgent_emailed_at ?? '',
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
      lines.push(cells.join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `news-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Soft-delete this news item? It will be hidden from the feed.')) return;
    const { error } = await supabase.from('news_items').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Deleted');
    refetch();
  };

  const fmt = (d: string | null) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-medium text-foreground">Submissions Audit</h1>

      {summary && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-4"><div className="text-xs text-muted-foreground">Total (7d)</div><div className="text-2xl font-mono mt-1">{summary.total}</div></Card>
            <Card className="p-4"><div className="text-xs text-muted-foreground">Relevant</div><div className="text-2xl font-mono mt-1">{summary.by_urgency?.relevant ?? 0}</div></Card>
            <Card className="p-4"><div className="text-xs text-muted-foreground">Urgent</div><div className="text-2xl font-mono mt-1 text-primary">{summary.by_urgency?.urgent ?? 0}</div></Card>
            <Card className="p-4"><div className="text-xs text-muted-foreground">Super Urgent</div><div className="text-2xl font-mono mt-1 text-destructive">{summary.by_urgency?.super_urgent ?? 0}</div></Card>
          </div>
          <div className="text-sm text-muted-foreground space-y-1">
            {summary.top_submitter?.name && <div>Most active submitter: <span className="text-foreground font-medium">{summary.top_submitter.name}</span> ({summary.top_submitter.count} items)</div>}
            {summary.top_clubs?.length > 0 && (
              <div>Top clubs this week: {summary.top_clubs.map((c, i) => (
                <span key={c.name}>{i > 0 && ', '}<span className="text-foreground">{c.name}</span> ({c.count})</span>
              ))}</div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Select value={String(daysBack)} onValueChange={(v) => { setDaysBack(Number(v)); setPage(0); }}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
        <Select value={urgencyFilter} onValueChange={(v) => { setUrgencyFilter(v); setPage(0); }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Urgency" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All urgencies</SelectItem>
            <SelectItem value="relevant">Relevant</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="super_urgent">Super Urgent</SelectItem>
          </SelectContent>
        </Select>
        <Select value={submitterFilter} onValueChange={(v) => { setSubmitterFilter(v); setPage(0); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Submitter" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All submitters</SelectItem>
            {submitters.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="Club contains…" value={clubFilter} onChange={(e) => { setClubFilter(e.target.value); setPage(0); }} className="w-48" />
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{filtered.length} rows</span>
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-3.5 w-3.5 mr-1" />Export CSV</Button>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Submitter</TableHead>
              <TableHead>Clubs</TableHead>
              <TableHead>Urgency</TableHead>
              <TableHead>Blurb</TableHead>
              <TableHead>URL</TableHead>
              <TableHead>Emailed</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No rows match these filters.</TableCell></TableRow>
            )}
            {paged.map((r) => {
              let domain = '';
              try { domain = new URL(r.url).hostname.replace(/^www\./, ''); } catch { domain = r.url; }
              const emailed = r.urgency === 'super_urgent' ? r.super_urgent_emailed_at
                : r.urgency === 'urgent' ? r.digest_emailed_at : null;
              return (
                <TableRow key={r.id}>
                  <TableCell className="text-xs font-mono whitespace-nowrap">{fmt(r.created_at)}</TableCell>
                  <TableCell className="text-xs">{r.submitter_name ?? '—'}</TableCell>
                  <TableCell className="text-xs max-w-[180px] truncate" title={r.clubs}>{r.clubs}</TableCell>
                  <TableCell><span className={`text-[10px] px-2 py-0.5 rounded border ${urgencyColor(r.urgency)}`}>{r.urgency}</span></TableCell>
                  <TableCell className="text-xs max-w-[260px] truncate" title={r.blurb}>{r.blurb}</TableCell>
                  <TableCell className="text-xs"><a href={r.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{domain}</a></TableCell>
                  <TableCell className="text-xs font-mono whitespace-nowrap">{r.urgency === 'relevant' ? '—' : fmt(emailed)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" asChild><a href={`/news/item/${r.id}`}>View →</a></Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(r.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}
