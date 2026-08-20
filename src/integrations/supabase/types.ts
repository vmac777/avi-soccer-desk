export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      buy_negotiation_entries: {
        Row: {
          amount: number | null
          buy_pitch_id: string
          created_at: string
          entry_type: string
          id: string
          logged_by: string
          note: string | null
        }
        Insert: {
          amount?: number | null
          buy_pitch_id: string
          created_at?: string
          entry_type?: string
          id?: string
          logged_by: string
          note?: string | null
        }
        Update: {
          amount?: number | null
          buy_pitch_id?: string
          created_at?: string
          entry_type?: string
          id?: string
          logged_by?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "buy_negotiation_entries_buy_pitch_id_fkey"
            columns: ["buy_pitch_id"]
            isOneToOne: false
            referencedRelation: "buy_pitches"
            referencedColumns: ["id"]
          },
        ]
      }
      buy_pitch_documents: {
        Row: {
          buy_pitch_id: string
          content_type: string | null
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          uploaded_by: string
        }
        Insert: {
          buy_pitch_id: string
          content_type?: string | null
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          uploaded_by: string
        }
        Update: {
          buy_pitch_id?: string
          content_type?: string | null
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "buy_pitch_documents_buy_pitch_id_fkey"
            columns: ["buy_pitch_id"]
            isOneToOne: false
            referencedRelation: "buy_pitches"
            referencedColumns: ["id"]
          },
        ]
      }
      buy_pitch_notes: {
        Row: {
          attachments: Json
          buy_pitch_id: string
          created_at: string
          id: string
          logged_by: string
          note: string
        }
        Insert: {
          attachments?: Json
          buy_pitch_id: string
          created_at?: string
          id?: string
          logged_by: string
          note: string
        }
        Update: {
          attachments?: Json
          buy_pitch_id?: string
          created_at?: string
          id?: string
          logged_by?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "buy_pitch_notes_buy_pitch_id_fkey"
            columns: ["buy_pitch_id"]
            isOneToOne: false
            referencedRelation: "buy_pitches"
            referencedColumns: ["id"]
          },
        ]
      }
      buy_pitches: {
        Row: {
          asking_price: number | null
          ball_in_court: string | null
          club_track: string
          contact_id: string
          created_at: string
          current_offer: number | null
          final_price: number | null
          id: string
          loan_trigger_value: number | null
          loss_reason: string | null
          milestones: Json
          mwp: number | null
          negotiation_type: string | null
          notes: string | null
          player_track: string
          scouted_target_id: string
          stage: string
          updated_at: string
        }
        Insert: {
          asking_price?: number | null
          ball_in_court?: string | null
          club_track?: string
          contact_id: string
          created_at?: string
          current_offer?: number | null
          final_price?: number | null
          id?: string
          loan_trigger_value?: number | null
          loss_reason?: string | null
          milestones?: Json
          mwp?: number | null
          negotiation_type?: string | null
          notes?: string | null
          player_track?: string
          scouted_target_id: string
          stage?: string
          updated_at?: string
        }
        Update: {
          asking_price?: number | null
          ball_in_court?: string | null
          club_track?: string
          contact_id?: string
          created_at?: string
          current_offer?: number | null
          final_price?: number | null
          id?: string
          loan_trigger_value?: number | null
          loss_reason?: string | null
          milestones?: Json
          mwp?: number | null
          negotiation_type?: string | null
          notes?: string | null
          player_track?: string
          scouted_target_id?: string
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "buy_pitches_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buy_pitches_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buy_pitches_scouted_target_id_fkey"
            columns: ["scouted_target_id"]
            isOneToOne: true
            referencedRelation: "scouted_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      club_briefs: {
        Row: {
          angle: string
          assembled_context: string | null
          brief_json: Json | null
          club_id: string | null
          duration_ms: number | null
          generated_at: string
          generated_by: string | null
          id: string
          model: string | null
          player_scope: Json | null
          position_scope: string[]
          source_status: Json | null
          system_prompt_version: string
          total_input_tokens: number | null
          total_output_tokens: number | null
          total_search_calls: number | null
          web_search_enabled: boolean | null
        }
        Insert: {
          angle: string
          assembled_context?: string | null
          brief_json?: Json | null
          club_id?: string | null
          duration_ms?: number | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          model?: string | null
          player_scope?: Json | null
          position_scope?: string[]
          source_status?: Json | null
          system_prompt_version?: string
          total_input_tokens?: number | null
          total_output_tokens?: number | null
          total_search_calls?: number | null
          web_search_enabled?: boolean | null
        }
        Update: {
          angle?: string
          assembled_context?: string | null
          brief_json?: Json | null
          club_id?: string | null
          duration_ms?: number | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          model?: string | null
          player_scope?: Json | null
          position_scope?: string[]
          source_status?: Json | null
          system_prompt_version?: string
          total_input_tokens?: number | null
          total_output_tokens?: number | null
          total_search_calls?: number | null
          web_search_enabled?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "club_briefs_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_briefs_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_sources: {
        Row: {
          club_id: string
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          url: string
        }
        Insert: {
          club_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          url: string
        }
        Update: {
          club_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_sources_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_sources_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          country: string | null
          created_at: string
          id: string
          league: string | null
          name: string
          tier: number | null
          tr_competition_id: number | null
          tr_team_id: number | null
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          id?: string
          league?: string | null
          name: string
          tier?: number | null
          tr_competition_id?: number | null
          tr_team_id?: number | null
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          id?: string
          league?: string | null
          name?: string
          tier?: number | null
          tr_competition_id?: number | null
          tr_team_id?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          club: string
          club_interest: string | null
          contact_person: string | null
          created_at: string | null
          created_by: string | null
          id: string
          is_primary: boolean
          last_contact: string | null
          linkedin: string | null
          market: string
          needs: string | null
          phone1: string | null
          phone2: string | null
          phone3: string | null
          players_offered: string | null
          priority: string | null
          role: string | null
          stage: string | null
          updated_at: string | null
          who_spoke: string | null
        }
        Insert: {
          club: string
          club_interest?: string | null
          contact_person?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_primary?: boolean
          last_contact?: string | null
          linkedin?: string | null
          market: string
          needs?: string | null
          phone1?: string | null
          phone2?: string | null
          phone3?: string | null
          players_offered?: string | null
          priority?: string | null
          role?: string | null
          stage?: string | null
          updated_at?: string | null
          who_spoke?: string | null
        }
        Update: {
          club?: string
          club_interest?: string | null
          contact_person?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_primary?: boolean
          last_contact?: string | null
          linkedin?: string | null
          market?: string
          needs?: string | null
          phone1?: string | null
          phone2?: string | null
          phone3?: string | null
          players_offered?: string | null
          priority?: string | null
          role?: string | null
          stage?: string | null
          updated_at?: string | null
          who_spoke?: string | null
        }
        Relationships: []
      }
      email_failures: {
        Row: {
          attempted_at: string
          email_type: string
          error_message: string
          id: string
          news_item_id: string | null
          resolved_at: string | null
          retry_count: number
        }
        Insert: {
          attempted_at?: string
          email_type: string
          error_message: string
          id?: string
          news_item_id?: string | null
          resolved_at?: string | null
          retry_count?: number
        }
        Update: {
          attempted_at?: string
          email_type?: string
          error_message?: string
          id?: string
          news_item_id?: string | null
          resolved_at?: string | null
          retry_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "email_failures_news_item_id_fkey"
            columns: ["news_item_id"]
            isOneToOne: false
            referencedRelation: "news_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_failures_news_item_id_fkey"
            columns: ["news_item_id"]
            isOneToOne: false
            referencedRelation: "news_items_with_clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_up_links: {
        Row: {
          created_at: string
          follow_up_id: string
          id: string
          link_id: string
          link_label: string
          link_sublabel: string | null
          link_type: string
        }
        Insert: {
          created_at?: string
          follow_up_id: string
          id?: string
          link_id: string
          link_label: string
          link_sublabel?: string | null
          link_type: string
        }
        Update: {
          created_at?: string
          follow_up_id?: string
          id?: string
          link_id?: string
          link_label?: string
          link_sublabel?: string | null
          link_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_links_follow_up_id_fkey"
            columns: ["follow_up_id"]
            isOneToOne: false
            referencedRelation: "follow_ups"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_ups: {
        Row: {
          action_text: string
          completed: boolean
          completed_at: string | null
          contact_club: string | null
          contact_id: string | null
          contact_name: string | null
          created_at: string
          due_date: string
          id: string
          target_id: string
          target_label: string
          target_sublabel: string | null
          target_type: string
        }
        Insert: {
          action_text: string
          completed?: boolean
          completed_at?: string | null
          contact_club?: string | null
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string
          due_date: string
          id?: string
          target_id: string
          target_label: string
          target_sublabel?: string | null
          target_type: string
        }
        Update: {
          action_text?: string
          completed?: boolean
          completed_at?: string | null
          contact_club?: string | null
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string
          due_date?: string
          id?: string
          target_id?: string
          target_label?: string
          target_sublabel?: string | null
          target_type?: string
        }
        Relationships: []
      }
      interactions: {
        Row: {
          contact_id: string | null
          created_at: string | null
          id: string
          interaction_type: string | null
          logged_by: string
          note: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          id?: string
          interaction_type?: string | null
          logged_by: string
          note: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          id?: string
          interaction_type?: string | null
          logged_by?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "interactions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_enriched"
            referencedColumns: ["id"]
          },
        ]
      }
      market_briefs: {
        Row: {
          angle: string
          assembled_context: string | null
          brief_json: Json | null
          budget_hint: string | null
          comparable_positions: string[]
          country: string
          duration_ms: number | null
          freetext_player: Json | null
          generated_at: string
          generated_by: string | null
          hidden_at: string | null
          id: string
          model: string | null
          scouted_target_id: string | null
          source_status: Json | null
          squad_player_slug: string | null
          system_prompt_version: string
          tier_filter: number[]
          total_input_tokens: number | null
          total_output_tokens: number | null
          total_search_calls: number | null
          web_search_enabled: boolean | null
        }
        Insert: {
          angle?: string
          assembled_context?: string | null
          brief_json?: Json | null
          budget_hint?: string | null
          comparable_positions?: string[]
          country: string
          duration_ms?: number | null
          freetext_player?: Json | null
          generated_at?: string
          generated_by?: string | null
          hidden_at?: string | null
          id?: string
          model?: string | null
          scouted_target_id?: string | null
          source_status?: Json | null
          squad_player_slug?: string | null
          system_prompt_version?: string
          tier_filter?: number[]
          total_input_tokens?: number | null
          total_output_tokens?: number | null
          total_search_calls?: number | null
          web_search_enabled?: boolean | null
        }
        Update: {
          angle?: string
          assembled_context?: string | null
          brief_json?: Json | null
          budget_hint?: string | null
          comparable_positions?: string[]
          country?: string
          duration_ms?: number | null
          freetext_player?: Json | null
          generated_at?: string
          generated_by?: string | null
          hidden_at?: string | null
          id?: string
          model?: string | null
          scouted_target_id?: string | null
          source_status?: Json | null
          squad_player_slug?: string | null
          system_prompt_version?: string
          tier_filter?: number[]
          total_input_tokens?: number | null
          total_output_tokens?: number | null
          total_search_calls?: number | null
          web_search_enabled?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "market_briefs_scouted_target_id_fkey"
            columns: ["scouted_target_id"]
            isOneToOne: false
            referencedRelation: "scouted_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      news_items: {
        Row: {
          blurb: string
          blurb_tsv: unknown
          created_at: string
          deleted_at: string | null
          digest_emailed_at: string | null
          id: string
          last_email_attempt_at: string | null
          submitted_by: string
          super_urgent_emailed_at: string | null
          updated_at: string
          urgency: string
          url: string
        }
        Insert: {
          blurb: string
          blurb_tsv?: unknown
          created_at?: string
          deleted_at?: string | null
          digest_emailed_at?: string | null
          id?: string
          last_email_attempt_at?: string | null
          submitted_by: string
          super_urgent_emailed_at?: string | null
          updated_at?: string
          urgency: string
          url: string
        }
        Update: {
          blurb?: string
          blurb_tsv?: unknown
          created_at?: string
          deleted_at?: string | null
          digest_emailed_at?: string | null
          id?: string
          last_email_attempt_at?: string | null
          submitted_by?: string
          super_urgent_emailed_at?: string | null
          updated_at?: string
          urgency?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_items_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      news_items_audit: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          id: string
          new_values: Json | null
          news_item_id: string
          old_values: Json | null
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_values?: Json | null
          news_item_id: string
          old_values?: Json | null
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_values?: Json | null
          news_item_id?: string
          old_values?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "news_items_audit_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      news_items_clubs: {
        Row: {
          club_id: string
          id: string
          news_item_id: string
        }
        Insert: {
          club_id: string
          id?: string
          news_item_id: string
        }
        Update: {
          club_id?: string
          id?: string
          news_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_items_clubs_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_items_clubs_news_item_id_fkey"
            columns: ["news_item_id"]
            isOneToOne: false
            referencedRelation: "news_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_items_clubs_news_item_id_fkey"
            columns: ["news_item_id"]
            isOneToOne: false
            referencedRelation: "news_items_with_clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      news_reads: {
        Row: {
          id: string
          news_item_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          id?: string
          news_item_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          id?: string
          news_item_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_reads_news_item_id_fkey"
            columns: ["news_item_id"]
            isOneToOne: false
            referencedRelation: "news_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_reads_news_item_id_fkey"
            columns: ["news_item_id"]
            isOneToOne: false
            referencedRelation: "news_items_with_clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pitch_documents: {
        Row: {
          content_type: string | null
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          pitch_id: string
          uploaded_by: string
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          pitch_id: string
          uploaded_by: string
        }
        Update: {
          content_type?: string | null
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          pitch_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "pitch_documents_pitch_id_fkey"
            columns: ["pitch_id"]
            isOneToOne: false
            referencedRelation: "pitches"
            referencedColumns: ["id"]
          },
        ]
      }
      pitch_notes: {
        Row: {
          created_at: string
          id: string
          logged_by: string
          note: string
          pitch_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          logged_by: string
          note: string
          pitch_id: string
        }
        Update: {
          created_at?: string
          id?: string
          logged_by?: string
          note?: string
          pitch_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pitch_notes_pitch_id_fkey"
            columns: ["pitch_id"]
            isOneToOne: false
            referencedRelation: "pitches"
            referencedColumns: ["id"]
          },
        ]
      }
      pitches: {
        Row: {
          asking_price: number | null
          contact_id: string
          created_at: string
          current_offer: number | null
          final_price: number | null
          id: string
          notes: string | null
          npv_profit: number | null
          player_id: string
          stage: string
          updated_at: string
        }
        Insert: {
          asking_price?: number | null
          contact_id: string
          created_at?: string
          current_offer?: number | null
          final_price?: number | null
          id?: string
          notes?: string | null
          npv_profit?: number | null
          player_id: string
          stage?: string
          updated_at?: string
        }
        Update: {
          asking_price?: number | null
          contact_id?: string
          created_at?: string
          current_offer?: number | null
          final_price?: number | null
          id?: string
          notes?: string | null
          npv_profit?: number | null
          player_id?: string
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pitches_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pitches_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_enriched"
            referencedColumns: ["id"]
          },
        ]
      }
      player_club_links: {
        Row: {
          contact_id: string | null
          date_linked: string | null
          id: string
          link_type: string | null
          notes: string | null
          player_id: string | null
        }
        Insert: {
          contact_id?: string | null
          date_linked?: string | null
          id?: string
          link_type?: string | null
          notes?: string | null
          player_id?: string | null
        }
        Update: {
          contact_id?: string | null
          date_linked?: string | null
          id?: string
          link_type?: string | null
          notes?: string | null
          player_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_club_links_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_club_links_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_club_links_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players_tracking"
            referencedColumns: ["id"]
          },
        ]
      }
      player_notes: {
        Row: {
          notes: string | null
          player_id: string
          tags: Json | null
          updated_at: string
        }
        Insert: {
          notes?: string | null
          player_id: string
          tags?: Json | null
          updated_at?: string
        }
        Update: {
          notes?: string | null
          player_id?: string
          tags?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      player_recommendations: {
        Row: {
          player_slug: string
          rationale: string
          sell_or_hold: string
          target_price: string
          updated_at: string
          urgency: string
          verdict: string
        }
        Insert: {
          player_slug: string
          rationale?: string
          sell_or_hold?: string
          target_price?: string
          updated_at?: string
          urgency?: string
          verdict?: string
        }
        Update: {
          player_slug?: string
          rationale?: string
          sell_or_hold?: string
          target_price?: string
          updated_at?: string
          urgency?: string
          verdict?: string
        }
        Relationships: []
      }
      players_tracking: {
        Row: {
          created_at: string | null
          current_club: string | null
          id: string
          notes: string | null
          player_name: string
          position: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          current_club?: string | null
          id?: string
          notes?: string | null
          player_name: string
          position?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          current_club?: string | null
          id?: string
          notes?: string | null
          player_name?: string
          position?: string | null
          status?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      scouted_targets: {
        Row: {
          age: number | null
          agent_contact: string | null
          agent_name: string | null
          contract_end: string | null
          created_at: string
          current_club: string | null
          date_of_birth: string | null
          enrichment_notes: string | null
          foot: string | null
          gbe_score: string | null
          has_valuation: boolean
          height: string | null
          id: string
          league: string
          market_value: number | null
          name: string
          nationality: string | null
          notes: string | null
          photo_url: string | null
          position: string | null
          priority_ranking: string | null
          salary_estimate: number | null
          slug: string
          tm_link: string
          tm_player_id: string | null
          tm_status: string | null
          tr_asking_price: number | null
          tr_availability: string | null
          tr_data: Json | null
          tr_player_id: number | null
          tr_salary: number | null
          tr_status: string | null
          updated_at: string
          valuation_url: string
          xtv: number | null
          xtv_as_of: string | null
        }
        Insert: {
          age?: number | null
          agent_contact?: string | null
          agent_name?: string | null
          contract_end?: string | null
          created_at?: string
          current_club?: string | null
          date_of_birth?: string | null
          enrichment_notes?: string | null
          foot?: string | null
          gbe_score?: string | null
          has_valuation?: boolean
          height?: string | null
          id?: string
          league?: string
          market_value?: number | null
          name: string
          nationality?: string | null
          notes?: string | null
          photo_url?: string | null
          position?: string | null
          priority_ranking?: string | null
          salary_estimate?: number | null
          slug: string
          tm_link?: string
          tm_player_id?: string | null
          tm_status?: string | null
          tr_asking_price?: number | null
          tr_availability?: string | null
          tr_data?: Json | null
          tr_player_id?: number | null
          tr_salary?: number | null
          tr_status?: string | null
          updated_at?: string
          valuation_url?: string
          xtv?: number | null
          xtv_as_of?: string | null
        }
        Update: {
          age?: number | null
          agent_contact?: string | null
          agent_name?: string | null
          contract_end?: string | null
          created_at?: string
          current_club?: string | null
          date_of_birth?: string | null
          enrichment_notes?: string | null
          foot?: string | null
          gbe_score?: string | null
          has_valuation?: boolean
          height?: string | null
          id?: string
          league?: string
          market_value?: number | null
          name?: string
          nationality?: string | null
          notes?: string | null
          photo_url?: string | null
          position?: string | null
          priority_ranking?: string | null
          salary_estimate?: number | null
          slug?: string
          tm_link?: string
          tm_player_id?: string | null
          tm_status?: string | null
          tr_asking_price?: number | null
          tr_availability?: string | null
          tr_data?: Json | null
          tr_player_id?: number | null
          tr_salary?: number | null
          tr_status?: string | null
          updated_at?: string
          valuation_url?: string
          xtv?: number | null
          xtv_as_of?: string | null
        }
        Relationships: []
      }
      settings: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      squad_player_xtv_history: {
        Row: {
          month: number
          snapshotted_at: string
          tr_player_id: number
          xtv: number
          year: number
        }
        Insert: {
          month: number
          snapshotted_at?: string
          tr_player_id: number
          xtv: number
          year: number
        }
        Update: {
          month?: number
          snapshotted_at?: string
          tr_player_id?: number
          xtv?: number
          year?: number
        }
        Relationships: []
      }
      submission_rate_limits: {
        Row: {
          submission_count: number
          super_urgent_count: number
          user_id: string
          window_start: string
        }
        Insert: {
          submission_count?: number
          super_urgent_count?: number
          user_id: string
          window_start: string
        }
        Update: {
          submission_count?: number
          super_urgent_count?: number
          user_id?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_rate_limits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tr_club_rosters_cache: {
        Row: {
          club_id: string | null
          fetched_at: string
          players_json: Json
          tr_team_id: number
        }
        Insert: {
          club_id?: string | null
          fetched_at?: string
          players_json: Json
          tr_team_id: number
        }
        Update: {
          club_id?: string | null
          fetched_at?: string
          players_json?: Json
          tr_team_id?: number
        }
        Relationships: []
      }
      tr_competition_players_cache: {
        Row: {
          competition_id: number
          fetched_at: string
          players_json: Json
        }
        Insert: {
          competition_id: number
          fetched_at?: string
          players_json: Json
        }
        Update: {
          competition_id?: number
          fetched_at?: string
          players_json?: Json
        }
        Relationships: []
      }
      tr_competition_players_history: {
        Row: {
          competition_id: number
          players_json: Json
          snapshot_date: string
          snapshotted_at: string
        }
        Insert: {
          competition_id: number
          players_json: Json
          snapshot_date: string
          snapshotted_at?: string
        }
        Update: {
          competition_id?: number
          players_json?: Json
          snapshot_date?: string
          snapshotted_at?: string
        }
        Relationships: []
      }
      tr_competition_transfers_cache: {
        Row: {
          competition_id: number
          fetched_at: string
          transfers_json: Json
        }
        Insert: {
          competition_id: number
          fetched_at?: string
          transfers_json: Json
        }
        Update: {
          competition_id?: number
          fetched_at?: string
          transfers_json?: Json
        }
        Relationships: []
      }
      tr_player_details_cache: {
        Row: {
          fetched_at: string
          player_json: Json
          tr_player_id: number
        }
        Insert: {
          fetched_at?: string
          player_json: Json
          tr_player_id: number
        }
        Update: {
          fetched_at?: string
          player_json?: Json
          tr_player_id?: number
        }
        Relationships: []
      }
      tr_proxy_log: {
        Row: {
          created_at: string
          duration_ms: number | null
          id: string
          query_string: string | null
          response_size_bytes: number | null
          route: string
          status_code: number | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          id?: string
          query_string?: string | null
          response_size_bytes?: number | null
          route: string
          status_code?: number | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          id?: string
          query_string?: string | null
          response_size_bytes?: number | null
          route?: string
          status_code?: number | null
        }
        Relationships: []
      }
      tr_recon_unmatched: {
        Row: {
          clubs_name: string
          created_at: string
          id: string
          resolved: boolean
          tr_candidates: Json | null
        }
        Insert: {
          clubs_name: string
          created_at?: string
          id?: string
          resolved?: boolean
          tr_candidates?: Json | null
        }
        Update: {
          clubs_name?: string
          created_at?: string
          id?: string
          resolved?: boolean
          tr_candidates?: Json | null
        }
        Relationships: []
      }
    }
    Views: {
      contacts_enriched: {
        Row: {
          club: string | null
          club_interest: string | null
          contact_person: string | null
          created_at: string | null
          created_by: string | null
          days_since_contact: number | null
          health_status: string | null
          id: string | null
          interaction_count: number | null
          is_primary: boolean | null
          last_contact: string | null
          linkedin: string | null
          market: string | null
          needs: string | null
          phone1: string | null
          phone2: string | null
          phone3: string | null
          players_offered: string | null
          priority: string | null
          role: string | null
          stage: string | null
          updated_at: string | null
          who_spoke: string | null
        }
        Insert: {
          club?: string | null
          club_interest?: string | null
          contact_person?: string | null
          created_at?: string | null
          created_by?: string | null
          days_since_contact?: never
          health_status?: never
          id?: string | null
          interaction_count?: never
          is_primary?: boolean | null
          last_contact?: string | null
          linkedin?: string | null
          market?: string | null
          needs?: string | null
          phone1?: string | null
          phone2?: string | null
          phone3?: string | null
          players_offered?: string | null
          priority?: string | null
          role?: string | null
          stage?: string | null
          updated_at?: string | null
          who_spoke?: string | null
        }
        Update: {
          club?: string | null
          club_interest?: string | null
          contact_person?: string | null
          created_at?: string | null
          created_by?: string | null
          days_since_contact?: never
          health_status?: never
          id?: string | null
          interaction_count?: never
          is_primary?: boolean | null
          last_contact?: string | null
          linkedin?: string | null
          market?: string | null
          needs?: string | null
          phone1?: string | null
          phone2?: string | null
          phone3?: string | null
          players_offered?: string | null
          priority?: string | null
          role?: string | null
          stage?: string | null
          updated_at?: string | null
          who_spoke?: string | null
        }
        Relationships: []
      }
      news_items_with_clubs: {
        Row: {
          blurb: string | null
          club_ids: string[] | null
          clubs_json: Json | null
          created_at: string | null
          deleted_at: string | null
          id: string | null
          leagues: string[] | null
          submitted_by: string | null
          urgency: string | null
          url: string | null
        }
        Relationships: [
          {
            foreignKeyName: "news_items_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      audit_summary_week: { Args: never; Returns: Json }
      bulk_import_club_sources: { Args: { p_sources: Json }; Returns: Json }
      claim_digest_items: { Args: never; Returns: Json }
      club_news_counts: {
        Args: { p_league?: string }
        Returns: {
          club_id: string
          total_relevant: number
          unread_urgent: number
        }[]
      }
      club_news_counts_for_user: {
        Args: { p_league: string }
        Returns: {
          club_id: string
          club_name: string
          max_urgency: string
          unread_count: number
        }[]
      }
      current_user_role: { Args: never; Returns: string }
      get_app_base_url: { Args: never; Returns: string }
      get_service_role_key: { Args: never; Returns: string }
      get_stuck_super_urgents: {
        Args: never
        Returns: {
          blurb: string
          clubs: Json
          created_at: string
          id: string
          submitted_by: string
          submitter_name: string
          url: string
        }[]
      }
      get_submitter_names: {
        Args: { p_user_ids: string[] }
        Returns: {
          full_name: string
          id: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      league_news_counts_for_user: {
        Args: never
        Returns: {
          league: string
          max_urgency: string
          unread_count: number
        }[]
      }
      snapshot_tr_competition_players: {
        Args: never
        Returns: {
          competition_id: number
          n_players: number
        }[]
      }
      submit_news_item: {
        Args: {
          p_blurb: string
          p_club_ids: string[]
          p_urgency: string
          p_url: string
        }
        Returns: Json
      }
      system_health: { Args: never; Returns: Json }
      vault_seed_service_role_key: {
        Args: { p_value: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
