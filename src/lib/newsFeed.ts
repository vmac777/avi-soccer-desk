import { supabase } from '@/integrations/supabase/client';

export type Urgency = 'relevant' | 'urgent' | 'super_urgent';

export interface ClubRef {
  id: string;
  name: string;
  league: string | null;
}

export interface FeedItem {
  id: string;
  url: string;
  blurb: string;
  urgency: Urgency;
  created_at: string;
  submitted_by: string;
  deleted_at: string | null;
  submitter_name: string;
  is_read: boolean;
  clubs: ClubRef[];
}

export interface FeedFilters {
  urgency?: Urgency[];
  clubFilter?: string;
  leagueFilter?: string;
  submitter?: string;
  searchQuery?: string;
}

export interface FeedCursor {
  created_at: string;
  id: string;
}

export interface LoadFeedArgs {
  cursor?: FeedCursor | null;
  filters: FeedFilters;
  limit?: number;
  isAdmin: boolean;
  isSuperAdmin?: boolean;
  currentUserId: string;
}

export interface LoadFeedResult {
  items: FeedItem[];
  error: Error | null;
  nextCursor: FeedCursor | null;
}

export async function loadFeed({
  cursor,
  filters,
  limit = 50,
  isAdmin,
  isSuperAdmin = false,
  currentUserId,
}: LoadFeedArgs): Promise<LoadFeedResult> {
  const needsViewJoin = !!(filters.clubFilter || filters.leagueFilter);

  // Branch on table name to keep TS happy with the typed Supabase client.
  const buildQuery = () => {
    if (needsViewJoin) {
      let q: any = supabase
        .from('news_items_with_clubs')
        .select(
          'id, url, blurb, urgency, created_at, submitted_by, deleted_at, club_ids, leagues, clubs_json'
        )
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit);
      if (filters.clubFilter) q = q.contains('club_ids', [filters.clubFilter]);
      if (filters.leagueFilter) q = q.contains('leagues', [filters.leagueFilter]);
      return q;
    }
    let q: any = supabase
      .from('news_items')
      .select('id, url, blurb, urgency, created_at, submitted_by, deleted_at')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit);
    // Only super-admins see deleted items in the feed.
    if (!isSuperAdmin) q = q.is('deleted_at', null);
    return q;
  };

  let q: any = buildQuery();

  if (cursor) {
    const ts = encodeURIComponent(cursor.created_at);
    const id = encodeURIComponent(cursor.id);
    q = q.or(`created_at.lt.${ts},and(created_at.eq.${ts},id.lt.${id})`);
  }

  if (filters.urgency?.length) q = q.in('urgency', filters.urgency);
  if (filters.submitter && isAdmin) q = q.eq('submitted_by', filters.submitter);
  if (filters.searchQuery) {
    q = q.textSearch('blurb_tsv', filters.searchQuery, { config: 'simple' });
  }

  const { data, error } = await q;
  if (error) return { items: [], error: error as unknown as Error, nextCursor: null };

  if (!data || data.length === 0) {
    return { items: [], error: null, nextCursor: null };
  }

  const submitterIds: string[] = Array.from(new Set(data.map((d: any) => d.submitted_by as string)));
  const itemIds: string[] = data.map((d: any) => d.id as string);

  const [submittersRes, readsRes] = await Promise.all([
    supabase.rpc('get_submitter_names', { p_user_ids: submitterIds }),
    supabase
      .from('news_reads')
      .select('news_item_id')
      .in('news_item_id', itemIds)
      .eq('user_id', currentUserId),
  ]);

  const submitterMap = new Map(
    ((submittersRes.data ?? []) as { id: string; full_name: string | null }[]).map((p) => [
      p.id,
      p.full_name,
    ])
  );
  const readSet = new Set(((readsRes.data ?? []) as { news_item_id: string }[]).map((r) => r.news_item_id));

  // Build items explicitly — no spread.
  const items: FeedItem[] = data.map((d: any) => ({
    id: d.id,
    url: d.url,
    blurb: d.blurb,
    urgency: d.urgency,
    created_at: d.created_at,
    submitted_by: d.submitted_by,
    deleted_at: d.deleted_at,
    submitter_name: submitterMap.get(d.submitted_by) ?? 'Unknown',
    is_read: readSet.has(d.id),
    clubs: needsViewJoin ? ((d.clubs_json as ClubRef[]) ?? []) : [],
  }));

  // Bare-table path: load clubs in one batched query
  if (!needsViewJoin && items.length > 0) {
    const { data: joinRows } = await supabase
      .from('news_items_clubs')
      .select('news_item_id, clubs(id, name, league)')
      .in('news_item_id', itemIds);

    const clubsByItem = new Map<string, ClubRef[]>();
    for (const row of (joinRows ?? []) as any[]) {
      if (!row.clubs) continue;
      if (!clubsByItem.has(row.news_item_id)) clubsByItem.set(row.news_item_id, []);
      clubsByItem.get(row.news_item_id)!.push(row.clubs);
    }
    for (const item of items) {
      item.clubs = clubsByItem.get(item.id) ?? [];
    }
  }

  const last = items[items.length - 1];
  const nextCursor: FeedCursor | null =
    items.length === limit ? { created_at: last.created_at, id: last.id } : null;

  return { items, error: null, nextCursor };
}

export async function markAsRead(newsItemId: string, userId: string) {
  await supabase
    .from('news_reads')
    .upsert(
      { news_item_id: newsItemId, user_id: userId },
      { onConflict: 'news_item_id,user_id' }
    );
}

export async function markManyAsRead(newsItemIds: string[], userId: string) {
  if (newsItemIds.length === 0) return;
  const rows = newsItemIds.map((id) => ({ news_item_id: id, user_id: userId }));
  await supabase.from('news_reads').upsert(rows, { onConflict: 'news_item_id,user_id' });
}
