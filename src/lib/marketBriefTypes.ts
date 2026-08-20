// Shared type contract for the Country Market Brief feature.
// Consumed by:
//   - generate-market-brief edge function (request, response, brief_json shape)
//   - MarketBriefModal.tsx (request construction)
//   - MarketBriefRenderer.tsx (response rendering)
//   - market_briefs.brief_json column (persistence)
//
// Versioning rule: bumping MarketBriefJson is a breaking change. Bump
// market_briefs.system_prompt_version to a new minor (v1.0 -> v1.1) and ensure
// the renderer handles both shapes for a release window before deprecating.

// ──────────────────────────────────────────────────────────────────────
// Inputs
// ──────────────────────────────────────────────────────────────────────

export type MarketBriefAngle =
  | 'market_fit'
  | 'valuation'
  | 'risk'
  | 'pitch_strategy';

/**
 * Snapshot of an own-squad player, built client-side from `@/lib/squadData`
 * and passed in the request for `kind: 'squad'`. Mirrors the `local_tr_data`
 * pattern used by the Club Brief's BriefMeModal — the edge function can't
 * import client modules, and there is no DB-side squad table with TR fields.
 */
export interface SquadPlayerLocalTrData {
  display_name?: string;
  full_name?: string;
  position?: string;
  dob?: string;
  current_team?: string;
  contract_end?: string | null;
  xtv?: number | null;
  xtv_change_6m?: number | null;
  xtv_change_12m?: number | null;
  base_value?: number | null;
  salary_low?: number | null;
  salary_high?: number | null;
  gbe_score?: number | null;
  gbe_result?: string | null;
  playing_style?: string | null;
  second_position?: string | null;
  available_for_sale?: string | boolean | null;
  asking_price?: number | null;
  agency?: string | null;
  agency_verified?: string | null;
  rating?: number | null;
  potential?: number | null;
  preferred_foot?: string | null;
}

export interface SquadPlayerSnapshot {
  name: string;                                // Display name, e.g. "Vitinho".
  position: string;                            // TR taxonomy.
  age: number | null;
  current_club: string;                        // Typically the deployment's own club (CLIENT.legalName).
  tr_player_id: number | null;
  local_tr_data: SquadPlayerLocalTrData | null;
}

export type MarketBriefPlayerInput =
  | { kind: 'squad'; slug: string; snapshot: SquadPlayerSnapshot }
  | { kind: 'scouted'; id: string }
  | {
      kind: 'freetext';
      name: string;
      position: string;          // TR taxonomy: GK, CB, LB, RB, LWB, RWB, DM, CM, AM, LW, RW, CF, ST, SS.
      age?: number;
      current_club?: string;
      current_club_id?: string;  // UUID from public.clubs. Enables server-side TR_ID fuzzy resolution.
      asking_price_eur?: number;
      tr_player_id?: number;     // Optional: if user knows the TR PlayerId, paste it.
    };

export interface MarketBriefRequest {
  player: MarketBriefPlayerInput;
  country: string;               // Canonical English name: 'England', 'Saudi Arabia', 'Portugal'.
  tier_filter?: number[];        // Default [1, 2]. Caps target_clubs to these tiers.
  angle?: MarketBriefAngle;      // Default 'market_fit'.
  budget_hint?: string;          // Free text, e.g. "max €15M fee, €3M/yr salary".
  /**
   * Granular TR position codes the user considers comparable to the input player.
   * Used to filter target-club rosters AND told to the LLM for comparable_transfers.
   * If omitted, the edge function falls back to defaultComparablePositions(player.position).
   * Coarse codes (D/M/W/F) are auto-included server-side when their family is present.
   */
  comparable_positions?: string[];
}

// Default cluster mapping used by both the modal (pre-check) and the edge function (fallback).
// Granular TR taxonomy only — coarse codes (D/M/W/F) are auto-expanded server-side.
export function defaultComparablePositions(position: string | null | undefined): string[] {
  const raw = (position || '').toUpperCase().trim();
  if (!raw) return [];

  // Split composite positions like "DM/CM", "RB-CB", "LB, LWB" into individual codes.
  const parts = raw.split(/[\/,\-|&+\s]+/).map(s => s.trim()).filter(Boolean);

  const oneCode = (p: string): string[] => {
    switch (p) {
      case 'GK':  return ['GK'];
      case 'CB':  return ['CB'];
      case 'LB':
      case 'RB':
      case 'LWB':
      case 'RWB': return ['LB', 'RB', 'LWB', 'RWB'];
      case 'DM':  return ['DM', 'CM'];
      case 'CM':  return ['CM', 'DM', 'AM'];
      case 'AM':  return ['AM', 'CM', 'SS'];
      case 'LW':
      case 'RW':  return ['LW', 'RW'];
      case 'CF':
      case 'ST':  return ['CF', 'ST', 'SS'];
      case 'SS':  return ['SS', 'CF', 'ST', 'AM'];
      default:    return [];
    }
  };

  const out = new Set<string>();
  for (const p of parts) for (const code of oneCode(p)) out.add(code);
  // Fallback: if nothing recognized but we had a single token, keep it.
  if (out.size === 0 && parts.length === 1) out.add(parts[0]);
  return Array.from(out);
}


// ──────────────────────────────────────────────────────────────────────
// LLM output (stored verbatim in market_briefs.brief_json)
// ──────────────────────────────────────────────────────────────────────

export interface MarketBriefEurBand {
  low_eur: number;
  high_eur: number;
}

export interface MarketBriefCitedPoint {
  claim: string;
  implication: string;
  sources: string[];             // Identifiers; resolved to URLs via response.source_urls.
}

export interface MarketBriefTargetClub {
  club_name: string;
  tier: number | null;           // 1 | 2 | 3+ | null when not in our clubs table.
  rationale: string;
  estimated_fee_band: MarketBriefEurBand | null;
  estimated_salary_band_per_year: MarketBriefEurBand | null;
  recent_signings_at_position: string;
  current_squad_gap: string;
  sources: string[];
}

export interface MarketBriefComparableTransfer {
  player_name: string;
  from_club: string;
  to_club: string;
  date: string;                  // YYYY-MM-DD
  fee_eur: number | null;        // null = undisclosed
  age_at_transfer: number | null;
  position: string;
  fit_note: string;              // Why this comp is relevant to the input player.
  sources: string[];             // Typically ['TR_COUNTRY_TRANSFERS'].
}

export interface MarketBriefRisk {
  risk: string;
  severity: 'low' | 'medium' | 'high';
  mitigation: string;
  sources: string[];
}

export interface MarketBriefJson {
  // ── Echoed scope (LLM repeats so the renderer doesn't need extra props) ──
  player_name: string;
  player_position: string;
  player_age: number | null;
  player_current_club: string;
  country: string;
  angle: MarketBriefAngle;
  tier_filter: number[];

  // Footnote-style disclaimer rendered at the bottom of the brief.
  data_quality_disclaimer: string | null;

  // 3-5 bullets, each <30 words. Synthesis — no citations required.
  executive_summary: string[];

  // Country market shape: spending power, fee bands, regulation.
  market_overview: {
    headline: string;
    points: MarketBriefCitedPoint[];   // 4-7 points.
  };

  // Qualitative 1-10. Synthesis — no citations required.
  fit_score: {
    score: number;                     // 1-10 integer.
    reasoning: string;                 // Single paragraph.
    style_fit: string;
    league_physicality_fit: string;
    age_vs_market_norms: string;
  };

  // Ranked plausible buyers (3-8; fewer is fine if the universe is small).
  target_clubs: MarketBriefTargetClub[];

  // Last-24m comparable transfers into the target country (up to 8).
  comparable_transfers: MarketBriefComparableTransfer[];

  // Pricing for THIS player into THIS country.
  pricing_recommendation: {
    ask_eur: number | null;
    floor_eur: number | null;
    ceiling_eur: number | null;
    structure_notes: string;           // Installments, add-ons, sell-on, image rights.
    sources: string[];
  };

  // Typical agencies / intermediaries on the player's league -> target country corridor.
  agent_and_intermediary_landscape: {
    headline: string;
    points: MarketBriefCitedPoint[];   // 2-4 points.
  };

  // Risks specific to this (player, country) pair. Severity-ranked. Empty if none.
  risks_and_blockers: MarketBriefRisk[];

  // The pitch. Synthesis — no citations required.
  recommended_angle: {
    pitch_narrative: string;           // Single paragraph, max ~80 words.
    first_moves: string[];             // 2-3 concrete actions, sequenced.
  };
}

// ──────────────────────────────────────────────────────────────────────
// Edge function response envelope
// ──────────────────────────────────────────────────────────────────────

export interface MarketBriefMetadata {
  market_brief_id: string;
  generated_at: string;                // ISO 8601
  duration_ms: number;
  model: string;
  system_prompt_version: string;
  web_search_enabled: boolean;
  source_status: Record<string, string>;   // identifier -> 'ok (...)' | 'skipped: ...' | 'failed: ...'
  tokens: {
    input: number;
    output: number;
    search_calls: number;
  };
}

// Trimmed transfer row used by the "show your work" modal in the renderer.
export interface MarketBriefTrTransfer {
  date: string;
  player: string;
  from_team: string;
  to_team: string;
  competition_id: number;
  fee_eur: number | null;
  xtv_at_date_eur: number | null;
  transfer_type: string | null;
}

export interface MarketBriefResponse {
  brief: MarketBriefJson;
  metadata: MarketBriefMetadata;
  source_urls: Record<string, string>;         // identifier -> URL, for SourcePill rendering.
  tr_country_transfers: MarketBriefTrTransfer[]; // Raw transfers that powered the brief.
}

// ──────────────────────────────────────────────────────────────────────
// Source identifier conventions
// ──────────────────────────────────────────────────────────────────────

/**
 * Identifiers the system prompt may emit in `sources` arrays.
 *
 * Stable identifiers (always the same string):
 *   TR_PLAYER_DETAIL              — input player's TR record (xTV, GBE, salary band, agency)
 *   TR_COUNTRY_TRANSFERS          — transfers INTO any tier-matching comp in country, last 24m
 *   CLUBS_IN_COUNTRY              — Supabase clubs table snapshot for the country
 *   PITCH_HISTORY                 — prior pitches / buy_pitches into this country
 *   SCOUTED_TARGET_DATA           — internal scouting fields (only when input is a scouted target)
 *   WEB_SEARCH                    — Anthropic web_search; append a descriptor (e.g. WEB_SEARCH_GBE_RULES)
 *
 * Dynamic identifiers:
 *   TR_TARGET_CLUB_ROSTER_<N>     — depth chart for the N-th ranked target club
 *   APP_NEWS_<N>                  — pasted news item N (resolves to URL via source_urls)
 *
 * Press source identifiers come from each clubs.club_sources.label normalized
 * (uppercase, non-alnum -> '_'), e.g. GLOBO_ESPORTE, THE_ATHLETIC, RECORD_PT.
 */
export const KNOWN_SOURCE_IDS = [
  'TR_PLAYER_DETAIL',
  'TR_COUNTRY_TRANSFERS',
  'CLUBS_IN_COUNTRY',
  'PITCH_HISTORY',
  'SCOUTED_TARGET_DATA',
  'WEB_SEARCH',
] as const;

export type KnownSourceId = (typeof KNOWN_SOURCE_IDS)[number];
