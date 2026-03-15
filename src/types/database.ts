// SipPing Database Types
// Can be regenerated with: npx supabase gen types typescript --linked > src/types/database.ts

export type DrinkType = "water" | "shot";
export type PingStatus = "pending" | "accepted" | "declined" | "snoozed";
export type TripStatus = "active" | "completed" | "archived";

export interface User {
  id: string;
  name: string;
  email: string;
  expo_push_token: string | null;
  created_at: string;
  updated_at: string;
}

export interface Trip {
  id: string;
  name: string;
  start_date: string;
  end_date: string | null;
  status: TripStatus;
  created_by: string;
  invite_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface TripMember {
  trip_id: string;
  user_id: string;
  joined_at: string;
}

export interface DrinkPing {
  id: string;
  trip_id: string;
  from_user_id: string;
  to_user_id: string;
  type: DrinkType;
  status: PingStatus;
  sender_note: string | null;
  response_note: string | null;
  scheduled_at: string | null;
  responded_at: string | null;
  snoozed_until: string | null;
  snooze_count: number;
  created_at: string;
}

export interface ScheduledRule {
  id: string;
  trip_id: string;
  from_user_id: string;
  to_user_id: string;
  type: DrinkType;
  start_time: string;
  end_time: string;
  interval_minutes: number;
  timezone: string;
  active: boolean;
  last_fired_at: string | null;
  created_at: string;
}

export interface DrinkLog {
  id: string;
  trip_id: string;
  user_id: string;
  type: DrinkType;
  logged_at: string;
  ping_id: string | null;
  image_url: string | null;
}

// Supabase Database type mapping (for typed supabase-js client)
export interface Database {
  public: {
    Tables: {
      users: {
        Row: User;
        Insert: Omit<User, "created_at" | "updated_at">;
        Update: Partial<Omit<User, "id" | "created_at" | "updated_at">>;
      };
      trips: {
        Row: Trip;
        Insert: Omit<Trip, "id" | "created_at" | "updated_at" | "status"> & {
          id?: string;
          status?: TripStatus;
        };
        Update: Partial<Omit<Trip, "id" | "created_at" | "updated_at">>;
      };
      trip_members: {
        Row: TripMember;
        Insert: Omit<TripMember, "joined_at"> & { joined_at?: string };
        Update: never;
      };
      drink_pings: {
        Row: DrinkPing;
        Insert: Omit<
          DrinkPing,
          "id" | "created_at" | "snooze_count" | "status"
        > & {
          id?: string;
          status?: PingStatus;
          snooze_count?: number;
        };
        Update: Partial<
          Pick<
            DrinkPing,
            | "status"
            | "response_note"
            | "responded_at"
            | "snoozed_until"
            | "snooze_count"
          >
        >;
      };
      scheduled_rules: {
        Row: ScheduledRule;
        Insert: Omit<
          ScheduledRule,
          "id" | "created_at" | "active" | "last_fired_at" | "timezone"
        > & {
          id?: string;
          active?: boolean;
          timezone?: string;
        };
        Update: Partial<
          Omit<ScheduledRule, "id" | "created_at" | "trip_id" | "from_user_id">
        >;
      };
      drink_log: {
        Row: DrinkLog;
        Insert: Omit<DrinkLog, "id" | "logged_at"> & {
          id?: string;
          logged_at?: string;
        };
        Update: Partial<Pick<DrinkLog, "image_url">>;
      };
    };
  };
}
