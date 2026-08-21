import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, Send, Bug } from 'lucide-react';
import { useCrashes, useAcknowledgeCrash } from '@/hooks/useCrashes';
import { toast } from 'sonner';
import { useState } from 'react';

type Health = {
  last_digest_sent_at: string | null;
  last_super_urgent_sent_at: string | null;
  pending_digest_count: number;
  pending_super_urgent_count: number;
  failures_last_24h: number;
  submissions_last_hour: Record<string, { total: number; super_urgent: number }>;
  unresolved_failures: Array<{
    id: string; news_item_id: string | null; email_type: string;
    error_message: string; attempted_at: string; retry_count: number;
  }>;
};

const fmt = (d: string | null) => d ? new Date(d).toLocaleString('en-GB', {
  day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
}) + ' BRT' : '—';

export default function SystemHealth() {
  const [triggering, setTriggering] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const { data, refetch, isLoading } = useQuery({
    queryKey: ['system-health'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('system_health');
      if (error) throw error;
      setLastUpdated(new Date());
      return data as unknown as Health;
    },
    refetchInterval: 30_000,
  });

  const triggerDigest = async () => {
    if (!confirm('This will email all pending urgent items to the desk immediately. Proceed?')) return;
    setTriggering(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('send-daily-digest', { body: {} });
      if (error) throw error;
      const status = (res as any)?.status ?? 'unknown';
      const count = (res as any)?.count ?? 0;
      if (status === 'nothing_to_send') toast.info('Nothing to send — no pending urgent items.');
      else if (status === 'sent') toast.success(`Digest sent: ${count} items.`);
      else if (status === 'failed') toast.error('Digest failed; will be retried automatically.');
      else toast.message(`Status: ${status}`);
      refetch();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to trigger digest');
    } finally {
      setTriggering(false);
    }
  };

  const { data: crashes = [] } = useCrashes();
  const acknowledge = useAcknowledgeCrash();

  const hasIssues =
    (data?.failures_last_24h ?? 0) > 0
    || (data?.pending_super_urgent_count ?? 0) > 0
    || crashes.length > 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-medium text-foreground">System Health</h1>
        <span className="text-xs text-muted-foreground">Last updated: {Math.round((Date.now() - lastUpdated.getTime()) / 1000)}s ago</span>
      </div>

      {hasIssues && (
        <div className="flex items-start gap-2 p-3 border border-destructive/40 bg-destructive/10 rounded-md">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
          <div className="text-sm text-destructive">
            {(data?.failures_last_24h ?? 0) > 0 && <div>{data!.failures_last_24h} unresolved email failure(s) in last 24h.</div>}
            {(data?.pending_super_urgent_count ?? 0) > 0 && <div>{data!.pending_super_urgent_count} super urgent item(s) awaiting send.</div>}
            {crashes.length > 0 && (
              <div>
                {crashes.reduce((n, c) => n + c.count, 0)} unacknowledged front-end crash(es)
                across {crashes.length} distinct error(s) in the last 7 days.
              </div>
            )}
          </div>
        </div>
      )}

      <Card className="p-5 space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Bug className="h-4 w-4" /> Front-end crashes (7 days)
        </h2>
        {crashes.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-green-600" /> No crashes reported.
          </div>
        ) : (
          <div className="space-y-2">
            {/* Grouped by message: one bug hit fifty times is one line. */}
            {crashes.map((c) => (
              <div key={c.message} className="space-y-1 rounded border border-border p-2 text-xs">
                <div className="flex items-start justify-between gap-3">
                  <span className="break-all font-mono text-destructive">{c.message}</span>
                  <span className="shrink-0 text-muted-foreground">
                    ×{c.count} · {fmt(c.last_seen)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    {c.kind.replace(/_/g, ' ')}{c.route ? ` · ${c.route}` : ''}
                  </span>
                  <button
                    onClick={() => acknowledge.mutate(c.ids)}
                    disabled={acknowledge.isPending}
                    className="shrink-0 rounded border border-border px-2 py-0.5 text-[11px] text-foreground hover:bg-accent disabled:opacity-50"
                  >
                    Acknowledge
                  </button>
                </div>
                {c.stack && (
                  <pre className="overflow-x-auto whitespace-pre-wrap text-[10px] text-muted-foreground">
                    {c.stack.split('\n').slice(0, 4).join('\n')}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="text-sm font-medium text-foreground">Email status</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-2 gap-x-6 text-sm">
          <Row label="Last digest sent" value={fmt(data?.last_digest_sent_at ?? null)} ok={!!data?.last_digest_sent_at} />
          <Row label="Last super urgent" value={fmt(data?.last_super_urgent_sent_at ?? null)} ok={!!data?.last_super_urgent_sent_at} />
          <Row label="Pending digest items" value={String(data?.pending_digest_count ?? 0)} />
          <Row label="Pending super urgent" value={String(data?.pending_super_urgent_count ?? 0)} warn={(data?.pending_super_urgent_count ?? 0) > 0} />
          <Row label="Failures last 24h" value={String(data?.failures_last_24h ?? 0)} warn={(data?.failures_last_24h ?? 0) > 0} />
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="text-sm font-medium text-foreground">Rate limiting (last hour)</h2>
        {data?.submissions_last_hour && Object.keys(data.submissions_last_hour).length > 0 ? (
          <div className="space-y-1 text-sm font-mono">
            {Object.entries(data.submissions_last_hour).map(([name, c]) => (
              <div key={name} className="flex justify-between">
                <span className="text-foreground">{name}</span>
                <span className="text-muted-foreground">{c.total} submissions, {c.super_urgent} super urgent</span>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">No submissions in the last hour.</p>}
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="text-sm font-medium text-foreground">Email failures (unresolved)</h2>
        {(data?.unresolved_failures ?? []).length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-green-600" /> All clear.
          </div>
        ) : (
          <div className="space-y-2">
            {data!.unresolved_failures.map((f) => (
              <div key={f.id} className="text-xs border border-border rounded p-2 space-y-1">
                <div className="flex justify-between">
                  <span className="font-mono text-destructive">{f.email_type}</span>
                  <span className="text-muted-foreground">{fmt(f.attempted_at)}</span>
                </div>
                <div className="text-muted-foreground break-all">{f.error_message}</div>
                {f.news_item_id && <a href={`/news/item/${f.news_item_id}`} className="text-primary hover:underline">View item →</a>}
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="flex gap-2">
        <Button onClick={triggerDigest} disabled={triggering || isLoading}>
          <Send className="h-4 w-4 mr-2" />
          {triggering ? 'Sending…' : 'Manually trigger digest'}
        </Button>
        <Button variant="outline" onClick={() => refetch()}>Run health check</Button>
      </div>
    </div>
  );
}

function Row({ label, value, ok, warn }: { label: string; value: string; ok?: boolean; warn?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}:</span>
      <span className={`font-mono ${warn ? 'text-destructive' : ok ? 'text-green-600' : 'text-foreground'}`}>{value}</span>
    </div>
  );
}
