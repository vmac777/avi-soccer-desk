import { ExternalLink, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  sourceHealth,
  type ClubNewsReport as Report,
  type ReportRelevance,
  type SourceStatus,
} from '@/lib/clubNewsReport';

/**
 * A generated report, laid out the way an agent reads one: the line that
 * matters, then what to do about it, then the evidence.
 *
 * `agency_angle` sits above the stories deliberately. The stories are the
 * research; the angle is the reason anyone opened the page. Burying it under
 * ten headlines turns a decision aid back into a news digest.
 */

const RELEVANCE_STYLE: Record<ReportRelevance, string> = {
  high: 'bg-primary/15 text-primary border-primary/30',
  medium: 'bg-muted text-muted-foreground border-border',
  low: 'bg-transparent text-muted-foreground/70 border-border',
};

/** Turn the recorded status into something readable without a lookup table in your head. */
function describeStatus(status: string): string {
  if (status === 'ok') return 'read';
  if (status === 'empty') return 'nothing on the page';
  if (status === 'timeout') return 'timed out';
  if (status === 'page_too_large') return 'page too large';
  const http = status.match(/^http_(\d{3})$/);
  if (http) return http[1] === '403' ? 'blocked (403)' : `HTTP ${http[1]}`;
  return status;
}

export default function ClubNewsReport({
  report,
  sourceStatus,
  className,
}: {
  report: Report;
  sourceStatus: SourceStatus[];
  className?: string;
}) {
  const health = sourceHealth(sourceStatus);
  const shortfall = health.total - health.ok;

  return (
    <div className={cn('space-y-5', className)}>
      <div className="space-y-1">
        <h2 className="text-base font-semibold leading-snug">{report.headline}</h2>
        {report.as_of && (
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            As of {report.as_of}
          </p>
        )}
      </div>

      {/*
        Said before anything else it might have coloured. Three blocked pages and
        three good ones produce equally confident prose, and this line is the
        only place the difference shows.
      */}
      {shortfall > 0 && (
        <div className="flex items-start gap-1.5 rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[10px] text-amber-500/90">
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
          <span>
            {health.ok} of {health.total} sources could be read.{' '}
            {sourceStatus
              .filter((s) => s.status !== 'ok')
              .map((s) => `${s.label || s.identifier} ${describeStatus(s.status)}`)
              .join(', ')}.
          </span>
        </div>
      )}

      {report.agency_angle.length > 0 && (
        <div className="rounded border border-primary/25 bg-primary/5 p-3">
          <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-primary">
            What this means for us
          </h3>
          <ul className="space-y-1.5">
            {report.agency_angle.map((point, i) => (
              <li key={i} className="flex gap-2 text-xs leading-relaxed">
                <span className="text-primary">—</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {report.stories.length} {report.stories.length === 1 ? 'story' : 'stories'}
        </h3>
        {report.stories.map((story, i) => (
          <div key={i} className="rounded border border-border p-3 space-y-1.5">
            <div className="flex items-start gap-2">
              <span
                className={cn(
                  'shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider',
                  RELEVANCE_STYLE[story.relevance],
                )}
              >
                {story.relevance}
              </span>
              <h4 className="text-xs font-medium leading-snug">{story.title}</h4>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{story.summary}</p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
              <span className="uppercase tracking-wider">{story.category}</span>
              {story.published_hint && <span>· {story.published_hint}</span>}
              {/*
                Absent rather than dead. A link the model could not source is
                left off entirely — an href that goes nowhere reads as evidence
                right up until somebody clicks it in front of a client.
              */}
              {story.source_url ? (
                <a
                  href={story.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-primary hover:underline"
                >
                  {story.source_name || 'Source'} <ExternalLink className="h-2.5 w-2.5" />
                </a>
              ) : (
                <span className="italic">{story.source_name || 'source not linked'}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {report.gaps && (
        <div className="border-t border-border pt-3">
          <h3 className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Not covered
          </h3>
          <p className="text-xs leading-relaxed text-muted-foreground">{report.gaps}</p>
        </div>
      )}
    </div>
  );
}
