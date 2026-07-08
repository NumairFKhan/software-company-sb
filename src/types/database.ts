export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type PlayerLevel =
  | "beginner"
  | "intermediate"
  | "advanced"
  | "competitive"
  | "professional";

export type Handedness = "right" | "left";

export type BackhandType = "one_handed" | "two_handed";

export type LogType = "practice" | "match" | "fitness" | "recovery";

// ── Per-type JSONB details shapes ────────────────────────────────────────────

export interface PracticeDetails {
  focus_area?: string;
  drill_notes?: string;
}

export interface MatchDetails {
  opponent_level?: string;
  sets_score?: string;
  surface?: string;
}

export interface FitnessDetails {
  activity_type?: string;
  gym_notes?: string;
}

export interface RecoveryDetails {
  sleep_quality?: number; // 1–5
  soreness_areas?: string;
}

export type SessionDetails =
  | PracticeDetails
  | MatchDetails
  | FitnessDetails
  | RecoveryDetails
  | Record<string, Json>;

// ── Daily recommendation shape ────────────────────────────────────────────────

export interface DailyRecommendationContent {
  session_goal: string;
  warmup: string;
  main_block: string;
  secondary_drill: string;
  fitness_note: string;
  mental_focus: string;
  cooldown: string;
  estimated_duration_mins: number;
}

// ── Physical status derived from recovery logs ───────────────────────────────

export type PhysicalStatus =
  | "Feeling good"
  | "Moderate fatigue"
  | "Recovery day needed"
  | "No recent recovery log";

// ── Supabase Database type ───────────────────────────────────────────────────
// Mirrors the schema in supabase/migrations/

export interface Database {
  public: {
    Tables: {
      player_profiles: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
          updated_at: string;
          display_name: string;
          level: PlayerLevel;
          handedness: Handedness;
          backhand_type: BackhandType;
          goals: string[];
          technical_focus: string[];
          available_days: string[];
          session_length_minutes: number;
          known_injuries: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          created_at?: string;
          updated_at?: string;
          display_name: string;
          level: PlayerLevel;
          handedness: Handedness;
          backhand_type: BackhandType;
          goals?: string[];
          technical_focus?: string[];
          available_days?: string[];
          session_length_minutes?: number;
          known_injuries?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          created_at?: string;
          updated_at?: string;
          display_name?: string;
          level?: PlayerLevel;
          handedness?: Handedness;
          backhand_type?: BackhandType;
          goals?: string[];
          technical_focus?: string[];
          available_days?: string[];
          session_length_minutes?: number;
          known_injuries?: string | null;
        };
        Relationships: [];
      };

      daily_recommendations: {
        Row: {
          id: string;
          user_id: string;
          recommendation_date: string; // DATE as ISO "YYYY-MM-DD"
          created_at: string;
          updated_at: string;
          session_goal: string;
          warmup: string;
          main_block: string;
          secondary_drill: string;
          fitness_note: string;
          mental_focus: string;
          cooldown: string;
          estimated_duration_mins: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          recommendation_date?: string;
          created_at?: string;
          updated_at?: string;
          session_goal: string;
          warmup: string;
          main_block: string;
          secondary_drill: string;
          fitness_note: string;
          mental_focus: string;
          cooldown: string;
          estimated_duration_mins: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          recommendation_date?: string;
          created_at?: string;
          updated_at?: string;
          session_goal?: string;
          warmup?: string;
          main_block?: string;
          secondary_drill?: string;
          fitness_note?: string;
          mental_focus?: string;
          cooldown?: string;
          estimated_duration_mins?: number;
        };
        Relationships: [];
      };

      chat_messages: {
        Row: {
          id: string;
          user_id: string;
          session_id: string;
          role: "user" | "assistant";
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          session_id: string;
          role: "user" | "assistant";
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          session_id?: string;
          role?: "user" | "assistant";
          content?: string;
          created_at?: string;
        };
        Relationships: [];
      };

      session_logs: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          log_date: string;         // DATE as ISO string "YYYY-MM-DD"
          log_type: LogType;
          duration_mins: number;
          intensity: number | null; // 1–5
          fatigue: number | null;   // 1–5
          pain_notes: string | null;
          free_notes: string | null;
          details: Json;            // JSONB
        };
        Insert: {
          id?: string;
          user_id: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          log_date?: string;
          log_type: LogType;
          duration_mins: number;
          intensity?: number | null;
          fatigue?: number | null;
          pain_notes?: string | null;
          free_notes?: string | null;
          details?: Json;
        };
        Update: {
          id?: string;
          user_id?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          log_date?: string;
          log_type?: LogType;
          duration_mins?: number;
          intensity?: number | null;
          fatigue?: number | null;
          pain_notes?: string | null;
          free_notes?: string | null;
          details?: Json;
        };
        Relationships: [];
      };

      google_tokens: {
        Row: {
          id: string;
          user_id: string;
          access_token: string;
          refresh_token: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          access_token: string;
          refresh_token?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          access_token?: string;
          refresh_token?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      player_level: PlayerLevel;
      handedness: Handedness;
      backhand_type: BackhandType;
      session_log_type: LogType;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

// Convenience aliases
export type PlayerProfile =
  Database["public"]["Tables"]["player_profiles"]["Row"];
export type PlayerProfileInsert =
  Database["public"]["Tables"]["player_profiles"]["Insert"];
export type PlayerProfileUpdate =
  Database["public"]["Tables"]["player_profiles"]["Update"];

export type SessionLog =
  Database["public"]["Tables"]["session_logs"]["Row"];
export type SessionLogInsert =
  Database["public"]["Tables"]["session_logs"]["Insert"];
export type SessionLogUpdate =
  Database["public"]["Tables"]["session_logs"]["Update"];

export type ChatMessage =
  Database["public"]["Tables"]["chat_messages"]["Row"];
export type ChatMessageInsert =
  Database["public"]["Tables"]["chat_messages"]["Insert"];

export type DailyRecommendation =
  Database["public"]["Tables"]["daily_recommendations"]["Row"];
export type DailyRecommendationInsert =
  Database["public"]["Tables"]["daily_recommendations"]["Insert"];
export type DailyRecommendationUpdate =
  Database["public"]["Tables"]["daily_recommendations"]["Update"];

export type GoogleToken =
  Database["public"]["Tables"]["google_tokens"]["Row"];
export type GoogleTokenInsert =
  Database["public"]["Tables"]["google_tokens"]["Insert"];
export type GoogleTokenUpdate =
  Database["public"]["Tables"]["google_tokens"]["Update"];
