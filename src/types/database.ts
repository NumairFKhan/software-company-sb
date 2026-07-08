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

// ── Supabase Database type ───────────────────────────────────────────────────
// Mirrors the schema in supabase/migrations/001_initial_schema.sql

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
