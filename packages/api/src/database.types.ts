export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17";
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      adhkar_logs: {
        Row: {
          created_at: string;
          id: number;
          local_date: string;
          period: Database["public"]["Enums"]["adhkar_period"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: never;
          local_date: string;
          period: Database["public"]["Enums"]["adhkar_period"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: never;
          local_date?: string;
          period?: Database["public"]["Enums"]["adhkar_period"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "adhkar_logs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_reports: {
        Row: {
          created_at: string;
          id: number;
          local_date: string;
          model: string;
          payload: Json;
          report_type: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: never;
          local_date: string;
          model: string;
          payload: Json;
          report_type: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: never;
          local_date?: string;
          model?: string;
          payload?: Json;
          report_type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_reports_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      announcements: {
        Row: {
          applied_at: string | null;
          course_id: number;
          created_at: string;
          external_id: string | null;
          failure_reason: string | null;
          id: number;
          parse_confidence: number | null;
          parsed_diff: Json | null;
          raw_text: string;
          source: string;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          applied_at?: string | null;
          course_id: number;
          created_at?: string;
          external_id?: string | null;
          failure_reason?: string | null;
          id?: never;
          parse_confidence?: number | null;
          parsed_diff?: Json | null;
          raw_text: string;
          source?: string;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          applied_at?: string | null;
          course_id?: number;
          created_at?: string;
          external_id?: string | null;
          failure_reason?: string | null;
          id?: never;
          parse_confidence?: number | null;
          parsed_diff?: Json | null;
          raw_text?: string;
          source?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "announcements_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "announcements_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      app_usage: {
        Row: {
          app_name: string;
          category: string | null;
          created_at: string;
          id: number;
          local_date: string;
          minutes: number;
          source: string;
          user_id: string;
        };
        Insert: {
          app_name: string;
          category?: string | null;
          created_at?: string;
          id?: never;
          local_date: string;
          minutes: number;
          source?: string;
          user_id: string;
        };
        Update: {
          app_name?: string;
          category?: string | null;
          created_at?: string;
          id?: never;
          local_date?: string;
          minutes?: number;
          source?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "app_usage_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      attempts: {
        Row: {
          confidence: string;
          correct: boolean;
          created_at: string;
          id: number;
          local_date: string;
          question_id: number;
          user_id: string;
        };
        Insert: {
          confidence: string;
          correct: boolean;
          created_at?: string;
          id?: never;
          local_date: string;
          question_id: number;
          user_id: string;
        };
        Update: {
          confidence?: string;
          correct?: boolean;
          created_at?: string;
          id?: never;
          local_date?: string;
          question_id?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attempts_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attempts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      backplan_milestones: {
        Row: {
          backplan_id: number;
          completed: boolean;
          id: number;
          milestone_date: string;
          minutes: number;
          phase: string;
          user_id: string;
        };
        Insert: {
          backplan_id: number;
          completed?: boolean;
          id?: never;
          milestone_date: string;
          minutes: number;
          phase: string;
          user_id: string;
        };
        Update: {
          backplan_id?: number;
          completed?: boolean;
          id?: never;
          milestone_date?: string;
          minutes?: number;
          phase?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "backplan_milestones_backplan_id_fkey";
            columns: ["backplan_id"];
            isOneToOne: false;
            referencedRelation: "deliverable_backplans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "backplan_milestones_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      brightspace_feeds: {
        Row: {
          created_at: string;
          id: number;
          last_synced_at: string | null;
          user_id: string;
          vault_secret_id: string;
        };
        Insert: {
          created_at?: string;
          id?: never;
          last_synced_at?: string | null;
          user_id: string;
          vault_secret_id: string;
        };
        Update: {
          created_at?: string;
          id?: never;
          last_synced_at?: string | null;
          user_id?: string;
          vault_secret_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "brightspace_feeds_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      calendar_events: {
        Row: {
          course_id: number | null;
          created_at: string;
          end_at: string;
          external_id: string | null;
          id: number;
          is_busy: boolean;
          is_class_meeting: boolean;
          source: string;
          start_at: string;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          course_id?: number | null;
          created_at?: string;
          end_at: string;
          external_id?: string | null;
          id?: never;
          is_busy?: boolean;
          is_class_meeting?: boolean;
          source?: string;
          start_at: string;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          course_id?: number | null;
          created_at?: string;
          end_at?: string;
          external_id?: string | null;
          id?: never;
          is_busy?: boolean;
          is_class_meeting?: boolean;
          source?: string;
          start_at?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_events_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calendar_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      canvas_connections: {
        Row: {
          base_url: string;
          created_at: string;
          id: number;
          last_polled_at: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          base_url: string;
          created_at?: string;
          id?: never;
          last_polled_at?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          base_url?: string;
          created_at?: string;
          id?: never;
          last_polled_at?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "canvas_connections_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      canvas_course_links: {
        Row: {
          canvas_course_id: number;
          canvas_course_name: string;
          course_id: number;
          created_at: string;
          id: number;
          user_id: string;
        };
        Insert: {
          canvas_course_id: number;
          canvas_course_name: string;
          course_id: number;
          created_at?: string;
          id?: never;
          user_id: string;
        };
        Update: {
          canvas_course_id?: number;
          canvas_course_name?: string;
          course_id?: number;
          created_at?: string;
          id?: never;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "canvas_course_links_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "canvas_course_links_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      canvas_grade_extractions: {
        Row: {
          applied_at: string | null;
          applied_grade_item_id: number | null;
          canvas_assignment_id: number;
          canvas_assignment_name: string;
          course_id: number;
          graded_at: string | null;
          id: number;
          points_possible: number | null;
          score: number;
          status: string;
          suggested_grade_item_id: number | null;
          synced_at: string;
          user_id: string;
        };
        Insert: {
          applied_at?: string | null;
          applied_grade_item_id?: number | null;
          canvas_assignment_id: number;
          canvas_assignment_name: string;
          course_id: number;
          graded_at?: string | null;
          id?: never;
          points_possible?: number | null;
          score: number;
          status?: string;
          suggested_grade_item_id?: number | null;
          synced_at?: string;
          user_id: string;
        };
        Update: {
          applied_at?: string | null;
          applied_grade_item_id?: number | null;
          canvas_assignment_id?: number;
          canvas_assignment_name?: string;
          course_id?: number;
          graded_at?: string | null;
          id?: never;
          points_possible?: number | null;
          score?: number;
          status?: string;
          suggested_grade_item_id?: number | null;
          synced_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "canvas_grade_extractions_applied_grade_item_id_fkey";
            columns: ["applied_grade_item_id"];
            isOneToOne: false;
            referencedRelation: "grade_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "canvas_grade_extractions_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "canvas_grade_extractions_suggested_grade_item_id_fkey";
            columns: ["suggested_grade_item_id"];
            isOneToOne: false;
            referencedRelation: "grade_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "canvas_grade_extractions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      card_states: {
        Row: {
          card_id: number;
          difficulty: number | null;
          due_at: string | null;
          lapses: number;
          last_rating: Database["public"]["Enums"]["fsrs_rating"] | null;
          last_review_at: string | null;
          learning_steps: number;
          reps: number;
          stability: number | null;
          state: Database["public"]["Enums"]["fsrs_card_state"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          card_id: number;
          difficulty?: number | null;
          due_at?: string | null;
          lapses?: number;
          last_rating?: Database["public"]["Enums"]["fsrs_rating"] | null;
          last_review_at?: string | null;
          learning_steps?: number;
          reps?: number;
          stability?: number | null;
          state?: Database["public"]["Enums"]["fsrs_card_state"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          card_id?: number;
          difficulty?: number | null;
          due_at?: string | null;
          lapses?: number;
          last_rating?: Database["public"]["Enums"]["fsrs_rating"] | null;
          last_review_at?: string | null;
          learning_steps?: number;
          reps?: number;
          stability?: number | null;
          state?: Database["public"]["Enums"]["fsrs_card_state"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "card_states_card_id_fkey";
            columns: ["card_id"];
            isOneToOne: false;
            referencedRelation: "lesson_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "card_states_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      cards: {
        Row: {
          active: boolean;
          created_at: string;
          id: number;
          text: string;
          type: Database["public"]["Enums"]["card_type"];
          updated_at: string;
          user_id: string;
          weight: number;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: never;
          text: string;
          type: Database["public"]["Enums"]["card_type"];
          updated_at?: string;
          user_id: string;
          weight?: number;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: never;
          text?: string;
          type?: Database["public"]["Enums"]["card_type"];
          updated_at?: string;
          user_id?: string;
          weight?: number;
        };
        Relationships: [
          {
            foreignKeyName: "cards_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      commitment_escalation_events: {
        Row: {
          from_level: Database["public"]["Enums"]["commitment_level"];
          id: number;
          kill_habit_id: number;
          occurred_at: string;
          reason: string | null;
          to_level: Database["public"]["Enums"]["commitment_level"];
          user_id: string;
        };
        Insert: {
          from_level: Database["public"]["Enums"]["commitment_level"];
          id?: never;
          kill_habit_id: number;
          occurred_at?: string;
          reason?: string | null;
          to_level: Database["public"]["Enums"]["commitment_level"];
          user_id: string;
        };
        Update: {
          from_level?: Database["public"]["Enums"]["commitment_level"];
          id?: never;
          kill_habit_id?: number;
          occurred_at?: string;
          reason?: string | null;
          to_level?: Database["public"]["Enums"]["commitment_level"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "commitment_escalation_events_kill_habit_id_fkey";
            columns: ["kill_habit_id"];
            isOneToOne: false;
            referencedRelation: "kill_habits";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commitment_escalation_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      course_meetings: {
        Row: {
          course_id: number;
          day_of_week: number;
          end_time: string;
          id: number;
          location: string | null;
          start_time: string;
          user_id: string;
        };
        Insert: {
          course_id: number;
          day_of_week: number;
          end_time: string;
          id?: never;
          location?: string | null;
          start_time: string;
          user_id: string;
        };
        Update: {
          course_id?: number;
          day_of_week?: number;
          end_time?: string;
          id?: never;
          location?: string | null;
          start_time?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "course_meetings_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "course_meetings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      course_office_hours: {
        Row: {
          course_id: number;
          day_of_week: number;
          end_time: string;
          id: number;
          location: string | null;
          start_time: string;
          user_id: string;
        };
        Insert: {
          course_id: number;
          day_of_week: number;
          end_time: string;
          id?: never;
          location?: string | null;
          start_time: string;
          user_id: string;
        };
        Update: {
          course_id?: number;
          day_of_week?: number;
          end_time?: string;
          id?: never;
          location?: string | null;
          start_time?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "course_office_hours_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "course_office_hours_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      courses: {
        Row: {
          allowed_absences: number | null;
          archived_at: string | null;
          attendance_policy: string | null;
          code: string;
          color: string | null;
          confidence_rating: number | null;
          created_at: string;
          difficulty_rating: number | null;
          id: number;
          late_policy: string | null;
          name: string;
          professor_contact: string | null;
          professor_name: string | null;
          target_grade_pct: number | null;
          term: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          allowed_absences?: number | null;
          archived_at?: string | null;
          attendance_policy?: string | null;
          code: string;
          color?: string | null;
          confidence_rating?: number | null;
          created_at?: string;
          difficulty_rating?: number | null;
          id?: never;
          late_policy?: string | null;
          name: string;
          professor_contact?: string | null;
          professor_name?: string | null;
          target_grade_pct?: number | null;
          term: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          allowed_absences?: number | null;
          archived_at?: string | null;
          attendance_policy?: string | null;
          code?: string;
          color?: string | null;
          confidence_rating?: number | null;
          created_at?: string;
          difficulty_rating?: number | null;
          id?: never;
          late_policy?: string | null;
          name?: string;
          professor_contact?: string | null;
          professor_name?: string | null;
          target_grade_pct?: number | null;
          term?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "courses_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_checkins: {
        Row: {
          capacity_minutes: number | null;
          created_at: string;
          derailment_reason: string | null;
          energy: number;
          floor_minutes: number | null;
          id: number;
          local_date: string;
          mood: number;
          recovery_mode_total: number | null;
          recovery_mode_triggered: boolean;
          submitted_at: string;
          target_minutes: number | null;
          user_id: string;
        };
        Insert: {
          capacity_minutes?: number | null;
          created_at?: string;
          derailment_reason?: string | null;
          energy: number;
          floor_minutes?: number | null;
          id?: never;
          local_date: string;
          mood: number;
          recovery_mode_total?: number | null;
          recovery_mode_triggered?: boolean;
          submitted_at?: string;
          target_minutes?: number | null;
          user_id: string;
        };
        Update: {
          capacity_minutes?: number | null;
          created_at?: string;
          derailment_reason?: string | null;
          energy?: number;
          floor_minutes?: number | null;
          id?: never;
          local_date?: string;
          mood?: number;
          recovery_mode_total?: number | null;
          recovery_mode_triggered?: boolean;
          submitted_at?: string;
          target_minutes?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "daily_checkins_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_predictions: {
        Row: {
          actual_completion_pct: number | null;
          created_at: string;
          expected_energy_tonight: number | null;
          hardest_task_id: number | null;
          id: number;
          likely_failure_mode: string | null;
          local_date: string;
          predicted_completion_pct: number | null;
          scored_at: string | null;
          user_id: string;
        };
        Insert: {
          actual_completion_pct?: number | null;
          created_at?: string;
          expected_energy_tonight?: number | null;
          hardest_task_id?: number | null;
          id?: never;
          likely_failure_mode?: string | null;
          local_date: string;
          predicted_completion_pct?: number | null;
          scored_at?: string | null;
          user_id: string;
        };
        Update: {
          actual_completion_pct?: number | null;
          created_at?: string;
          expected_energy_tonight?: number | null;
          hardest_task_id?: number | null;
          id?: never;
          likely_failure_mode?: string | null;
          local_date?: string;
          predicted_completion_pct?: number | null;
          scored_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "daily_predictions_hardest_task_id_fkey";
            columns: ["hardest_task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "daily_predictions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_reviews: {
        Row: {
          created_at: string;
          deep_work_actual_min: number | null;
          deep_work_planned_min: number | null;
          distracting_time_min: number | null;
          id: number;
          important_note_text: string | null;
          kill_list_success_count: number | null;
          kill_list_total: number | null;
          local_date: string;
          mits_completed: number;
          mits_planned: number;
          proud_text: string | null;
          screen_time_min: number | null;
          submitted_at: string;
          user_id: string;
          went_wrong_text: string | null;
          workout_completed: boolean | null;
        };
        Insert: {
          created_at?: string;
          deep_work_actual_min?: number | null;
          deep_work_planned_min?: number | null;
          distracting_time_min?: number | null;
          id?: never;
          important_note_text?: string | null;
          kill_list_success_count?: number | null;
          kill_list_total?: number | null;
          local_date: string;
          mits_completed?: number;
          mits_planned?: number;
          proud_text?: string | null;
          screen_time_min?: number | null;
          submitted_at?: string;
          user_id: string;
          went_wrong_text?: string | null;
          workout_completed?: boolean | null;
        };
        Update: {
          created_at?: string;
          deep_work_actual_min?: number | null;
          deep_work_planned_min?: number | null;
          distracting_time_min?: number | null;
          id?: never;
          important_note_text?: string | null;
          kill_list_success_count?: number | null;
          kill_list_total?: number | null;
          local_date?: string;
          mits_completed?: number;
          mits_planned?: number;
          proud_text?: string | null;
          screen_time_min?: number | null;
          submitted_at?: string;
          user_id?: string;
          went_wrong_text?: string | null;
          workout_completed?: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: "daily_reviews_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_summaries: {
        Row: {
          created_at: string;
          id: number;
          local_date: string;
          summary: Json;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: never;
          local_date: string;
          summary: Json;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: never;
          local_date?: string;
          summary?: Json;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "daily_summaries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      days: {
        Row: {
          baseline_hours: number;
          created_at: string;
          id: number;
          local_date: string;
          morning_brief: string | null;
          morning_brief_generated_at: string | null;
          morning_brief_source: string | null;
          sleep_intent_at: string | null;
          updated_at: string;
          user_id: string;
          wake_at: string | null;
        };
        Insert: {
          baseline_hours?: number;
          created_at?: string;
          id?: never;
          local_date: string;
          morning_brief?: string | null;
          morning_brief_generated_at?: string | null;
          morning_brief_source?: string | null;
          sleep_intent_at?: string | null;
          updated_at?: string;
          user_id: string;
          wake_at?: string | null;
        };
        Update: {
          baseline_hours?: number;
          created_at?: string;
          id?: never;
          local_date?: string;
          morning_brief?: string | null;
          morning_brief_generated_at?: string | null;
          morning_brief_source?: string | null;
          sleep_intent_at?: string | null;
          updated_at?: string;
          user_id?: string;
          wake_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "days_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      decision_journal: {
        Row: {
          actual_outcome: string | null;
          created_at: string;
          decision: string;
          id: number;
          local_date: string;
          occurred_at: string;
          predicted_outcome: string | null;
          prediction_pct: number | null;
          rationale: string | null;
          scored_at: string | null;
          user_id: string;
        };
        Insert: {
          actual_outcome?: string | null;
          created_at?: string;
          decision: string;
          id?: never;
          local_date: string;
          occurred_at?: string;
          predicted_outcome?: string | null;
          prediction_pct?: number | null;
          rationale?: string | null;
          scored_at?: string | null;
          user_id: string;
        };
        Update: {
          actual_outcome?: string | null;
          created_at?: string;
          decision?: string;
          id?: never;
          local_date?: string;
          occurred_at?: string;
          predicted_outcome?: string | null;
          prediction_pct?: number | null;
          rationale?: string | null;
          scored_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "decision_journal_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      deliverable_backplans: {
        Row: {
          compressed: boolean;
          deliverable_id: number;
          dropped_phases: string[];
          generated_at: string;
          id: number;
          infeasible: boolean;
          shortfall_minutes: number;
          target_completion_date: string;
          user_id: string;
        };
        Insert: {
          compressed?: boolean;
          deliverable_id: number;
          dropped_phases?: string[];
          generated_at?: string;
          id?: never;
          infeasible?: boolean;
          shortfall_minutes?: number;
          target_completion_date: string;
          user_id: string;
        };
        Update: {
          compressed?: boolean;
          deliverable_id?: number;
          dropped_phases?: string[];
          generated_at?: string;
          id?: never;
          infeasible?: boolean;
          shortfall_minutes?: number;
          target_completion_date?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deliverable_backplans_deliverable_id_fkey";
            columns: ["deliverable_id"];
            isOneToOne: false;
            referencedRelation: "deliverables";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deliverable_backplans_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      deliverables: {
        Row: {
          course_id: number;
          created_at: string;
          due_at: string;
          estimated_minutes: number | null;
          grade_item_id: number | null;
          id: number;
          local_due_date: string;
          status: string;
          title: string;
          type: Database["public"]["Enums"]["deliverable_type"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          course_id: number;
          created_at?: string;
          due_at: string;
          estimated_minutes?: number | null;
          grade_item_id?: number | null;
          id?: never;
          local_due_date: string;
          status?: string;
          title: string;
          type: Database["public"]["Enums"]["deliverable_type"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          course_id?: number;
          created_at?: string;
          due_at?: string;
          estimated_minutes?: number | null;
          grade_item_id?: number | null;
          id?: never;
          local_due_date?: string;
          status?: string;
          title?: string;
          type?: Database["public"]["Enums"]["deliverable_type"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deliverables_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deliverables_grade_item_id_fkey";
            columns: ["grade_item_id"];
            isOneToOne: false;
            referencedRelation: "grade_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deliverables_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      distractions: {
        Row: {
          cause: Database["public"]["Enums"]["distraction_cause"];
          created_at: string;
          id: number;
          occurred_at: string;
          local_date: string | null;
          session_id: number | null;
          trigger_id: number | null;
          user_id: string;
        };
        Insert: {
          cause: Database["public"]["Enums"]["distraction_cause"];
          created_at?: string;
          id?: never;
          occurred_at?: string;
          local_date?: string | null;
          session_id?: number | null;
          trigger_id?: number | null;
          user_id: string;
        };
        Update: {
          cause?: Database["public"]["Enums"]["distraction_cause"];
          created_at?: string;
          id?: never;
          occurred_at?: string;
          local_date?: string | null;
          session_id?: number | null;
          trigger_id?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "distractions_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "task_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "distractions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      experiment_measurements: {
        Row: {
          created_at: string;
          experiment_id: number;
          id: number;
          local_date: string;
          metric: string;
          user_id: string;
          value: number;
        };
        Insert: {
          created_at?: string;
          experiment_id: number;
          id?: never;
          local_date: string;
          metric: string;
          user_id: string;
          value: number;
        };
        Update: {
          created_at?: string;
          experiment_id?: number;
          id?: never;
          local_date?: string;
          metric?: string;
          user_id?: string;
          value?: number;
        };
        Relationships: [
          {
            foreignKeyName: "experiment_measurements_experiment_id_fkey";
            columns: ["experiment_id"];
            isOneToOne: false;
            referencedRelation: "experiments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "experiment_measurements_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      experiments: {
        Row: {
          baseline_value: number | null;
          created_at: string;
          end_date: string | null;
          hypothesis: string;
          hypothesized_direction: string | null;
          id: number;
          lesson_id: number | null;
          insight_id: number | null;
          metric_name: string | null;
          outcome_summary: string | null;
          protocol: string | null;
          start_date: string;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          baseline_value?: number | null;
          created_at?: string;
          end_date?: string | null;
          hypothesis: string;
          hypothesized_direction?: string | null;
          id?: never;
          lesson_id?: number | null;
          insight_id?: number | null;
          metric_name?: string | null;
          outcome_summary?: string | null;
          protocol?: string | null;
          start_date: string;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          baseline_value?: number | null;
          created_at?: string;
          end_date?: string | null;
          hypothesis?: string;
          hypothesized_direction?: string | null;
          id?: never;
          lesson_id?: number | null;
          insight_id?: number | null;
          metric_name?: string | null;
          outcome_summary?: string | null;
          protocol?: string | null;
          start_date?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "experiments_insight_id_fkey";
            columns: ["insight_id"];
            isOneToOne: false;
            referencedRelation: "insights";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "experiments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      friction_logs: {
        Row: {
          cause: Database["public"]["Enums"]["friction_cause"];
          cause_detail: string | null;
          created_at: string;
          id: number;
          local_date: string;
          occurred_at: string;
          related_task_id: number | null;
          user_id: string;
        };
        Insert: {
          cause: Database["public"]["Enums"]["friction_cause"];
          cause_detail?: string | null;
          created_at?: string;
          id?: never;
          local_date: string;
          occurred_at?: string;
          related_task_id?: number | null;
          user_id: string;
        };
        Update: {
          cause?: Database["public"]["Enums"]["friction_cause"];
          cause_detail?: string | null;
          created_at?: string;
          id?: never;
          local_date?: string;
          occurred_at?: string;
          related_task_id?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "friction_logs_related_task_id_fkey";
            columns: ["related_task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "friction_logs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      goals: {
        Row: {
          active: boolean;
          created_at: string;
          deadline: string | null;
          id: number;
          mom_id: number | null;
          number: string | null;
          position: number;
          reason: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          deadline?: string | null;
          id?: never;
          mom_id?: number | null;
          number?: string | null;
          position: number;
          reason?: string | null;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          deadline?: string | null;
          id?: never;
          mom_id?: number | null;
          number?: string | null;
          position?: number;
          reason?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goals_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goals_mom_id_fkey";
            columns: ["mom_id"];
            isOneToOne: false;
            referencedRelation: "moms";
            referencedColumns: ["id"];
          },
        ];
      };
      grade_boundaries: {
        Row: {
          course_id: number;
          id: number;
          letter: string;
          min_pct: number;
          user_id: string;
        };
        Insert: {
          course_id: number;
          id?: never;
          letter: string;
          min_pct: number;
          user_id: string;
        };
        Update: {
          course_id?: number;
          id?: never;
          letter?: string;
          min_pct?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "grade_boundaries_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "grade_boundaries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      grade_categories: {
        Row: {
          course_id: number;
          created_at: string;
          drop_lowest_n: number;
          expected_item_count: number;
          id: number;
          name: string;
          updated_at: string;
          user_id: string;
          weight_pct: number;
        };
        Insert: {
          course_id: number;
          created_at?: string;
          drop_lowest_n?: number;
          expected_item_count?: number;
          id?: never;
          name: string;
          updated_at?: string;
          user_id: string;
          weight_pct: number;
        };
        Update: {
          course_id?: number;
          created_at?: string;
          drop_lowest_n?: number;
          expected_item_count?: number;
          id?: never;
          name?: string;
          updated_at?: string;
          user_id?: string;
          weight_pct?: number;
        };
        Relationships: [
          {
            foreignKeyName: "grade_categories_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "grade_categories_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      grade_items: {
        Row: {
          category_id: number;
          course_id: number;
          created_at: string;
          id: number;
          is_excused: boolean;
          name: string;
          points_earned: number | null;
          points_possible: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          category_id: number;
          course_id: number;
          created_at?: string;
          id?: never;
          is_excused?: boolean;
          name: string;
          points_earned?: number | null;
          points_possible: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          category_id?: number;
          course_id?: number;
          created_at?: string;
          id?: never;
          is_excused?: boolean;
          name?: string;
          points_earned?: number | null;
          points_possible?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "grade_items_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "grade_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "grade_items_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "grade_items_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      grade_snapshots: {
        Row: {
          assumption_used: string | null;
          category_results: Json;
          course_id: number;
          created_at: string;
          current_grade: number | null;
          id: number;
          projected_grade: number | null;
          snapshot_date: string;
          user_id: string;
        };
        Insert: {
          assumption_used?: string | null;
          category_results: Json;
          course_id: number;
          created_at?: string;
          current_grade?: number | null;
          id?: never;
          projected_grade?: number | null;
          snapshot_date: string;
          user_id: string;
        };
        Update: {
          assumption_used?: string | null;
          category_results?: Json;
          course_id?: number;
          created_at?: string;
          current_grade?: number | null;
          id?: never;
          projected_grade?: number | null;
          snapshot_date?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "grade_snapshots_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "grade_snapshots_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      habit_logs: {
        Row: {
          created_at: string;
          done: boolean;
          habit_id: number;
          id: number;
          local_date: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          done?: boolean;
          habit_id: number;
          id?: never;
          local_date: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          done?: boolean;
          habit_id?: number;
          id?: never;
          local_date?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "habit_logs_habit_id_fkey";
            columns: ["habit_id"];
            isOneToOne: false;
            referencedRelation: "habits";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "habit_logs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      habits: {
        Row: {
          active: boolean;
          created_at: string;
          id: number;
          identity: string;
          name: string;
          paused: boolean;
          schedule: Json;
          updated_at: string;
          user_id: string;
          why_card: string | null;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: never;
          identity: string;
          name: string;
          paused?: boolean;
          schedule?: Json;
          updated_at?: string;
          user_id: string;
          why_card?: string | null;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: never;
          identity?: string;
          name?: string;
          paused?: boolean;
          schedule?: Json;
          updated_at?: string;
          user_id?: string;
          why_card?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "habits_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      health_daily: {
        Row: {
          created_at: string;
          hrv_ms: number | null;
          id: number;
          local_date: string;
          resting_hr: number | null;
          sleep_hours: number | null;
          source: string;
          strain: number | null;
          user_id: string;
          whoop_recovery_pct: number | null;
          workout_completed: boolean | null;
        };
        Insert: {
          created_at?: string;
          hrv_ms?: number | null;
          id?: never;
          local_date: string;
          resting_hr?: number | null;
          sleep_hours?: number | null;
          source?: string;
          strain?: number | null;
          user_id: string;
          whoop_recovery_pct?: number | null;
          workout_completed?: boolean | null;
        };
        Update: {
          created_at?: string;
          hrv_ms?: number | null;
          id?: never;
          local_date?: string;
          resting_hr?: number | null;
          sleep_hours?: number | null;
          source?: string;
          strain?: number | null;
          user_id?: string;
          whoop_recovery_pct?: number | null;
          workout_completed?: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: "health_daily_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      ics_event_extractions: {
        Row: {
          confirmed_at: string | null;
          course_id: number | null;
          description: string | null;
          end_at: string | null;
          external_id: string;
          feed_id: number;
          id: number;
          is_all_day: boolean;
          location: string | null;
          start_at: string;
          status: string;
          summary: string;
          synced_at: string;
          user_id: string;
        };
        Insert: {
          confirmed_at?: string | null;
          course_id?: number | null;
          description?: string | null;
          end_at?: string | null;
          external_id: string;
          feed_id: number;
          id?: never;
          is_all_day?: boolean;
          location?: string | null;
          start_at: string;
          status?: string;
          summary: string;
          synced_at?: string;
          user_id: string;
        };
        Update: {
          confirmed_at?: string | null;
          course_id?: number | null;
          description?: string | null;
          end_at?: string | null;
          external_id?: string;
          feed_id?: number;
          id?: never;
          is_all_day?: boolean;
          location?: string | null;
          start_at?: string;
          status?: string;
          summary?: string;
          synced_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ics_event_extractions_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ics_event_extractions_feed_id_fkey";
            columns: ["feed_id"];
            isOneToOne: false;
            referencedRelation: "brightspace_feeds";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ics_event_extractions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      insights: {
        Row: {
          claim: string;
          confidence_claimed_by_model:
            Database["public"]["Enums"]["insight_confidence_level"] | null;
          confidence_stored: Database["public"]["Enums"]["insight_confidence_level"];
          created_at: string;
          effect_size: number | null;
          evidence: Json | null;
          id: number;
          sample_size: number;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          claim: string;
          confidence_claimed_by_model?:
            Database["public"]["Enums"]["insight_confidence_level"] | null;
          confidence_stored: Database["public"]["Enums"]["insight_confidence_level"];
          created_at?: string;
          effect_size?: number | null;
          evidence?: Json | null;
          id?: never;
          sample_size: number;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          claim?: string;
          confidence_claimed_by_model?:
            Database["public"]["Enums"]["insight_confidence_level"] | null;
          confidence_stored?: Database["public"]["Enums"]["insight_confidence_level"];
          created_at?: string;
          effect_size?: number | null;
          evidence?: Json | null;
          id?: never;
          sample_size?: number;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "insights_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      interventions: {
        Row: {
          action_taken: string | null;
          actions: string[];
          id: number;
          kind: string;
          local_date: string;
          message: string;
          occurred_at: string;
          related_kill_habit_id: number | null;
          related_task_id: number | null;
          responded_at: string | null;
          status: string;
          trigger_reason: string;
          user_id: string;
        };
        Insert: {
          action_taken?: string | null;
          actions: string[];
          id?: never;
          kind: string;
          local_date: string;
          message: string;
          occurred_at?: string;
          related_kill_habit_id?: number | null;
          related_task_id?: number | null;
          responded_at?: string | null;
          status?: string;
          trigger_reason: string;
          user_id: string;
        };
        Update: {
          action_taken?: string | null;
          actions?: string[];
          id?: never;
          kind?: string;
          local_date?: string;
          message?: string;
          occurred_at?: string;
          related_kill_habit_id?: number | null;
          related_task_id?: number | null;
          responded_at?: string | null;
          status?: string;
          trigger_reason?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "interventions_related_kill_habit_id_fkey";
            columns: ["related_kill_habit_id"];
            isOneToOne: false;
            referencedRelation: "kill_habits";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "interventions_related_task_id_fkey";
            columns: ["related_task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "interventions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      journal_entries: {
        Row: {
          content: string;
          created_at: string;
          deleted_at: string | null;
          entry_type: string;
          id: number;
          local_date: string;
          user_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          deleted_at?: string | null;
          entry_type: string;
          id?: never;
          local_date: string;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          deleted_at?: string | null;
          entry_type?: string;
          id?: never;
          local_date?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "journal_entries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      kill_events: {
        Row: {
          created_at: string;
          duration_min: number | null;
          id: number;
          kill_habit_id: number;
          local_date: string;
          mood_before: number | null;
          occurred_at: string;
          outcome: string;
          trigger_context: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          duration_min?: number | null;
          id?: never;
          kill_habit_id: number;
          local_date: string;
          mood_before?: number | null;
          occurred_at?: string;
          outcome: string;
          trigger_context?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          duration_min?: number | null;
          id?: never;
          kill_habit_id?: number;
          local_date?: string;
          mood_before?: number | null;
          occurred_at?: string;
          outcome?: string;
          trigger_context?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kill_events_kill_habit_id_fkey";
            columns: ["kill_habit_id"];
            isOneToOne: false;
            referencedRelation: "kill_habits";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kill_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      kill_habits: {
        Row: {
          active: boolean;
          created_at: string;
          escalation_level: Database["public"]["Enums"]["commitment_level"];
          id: number;
          immediate_reward: string | null;
          implementation_intention: string | null;
          long_term_cost: string | null;
          max_escalation_level: Database["public"]["Enums"]["commitment_level"];
          name: string;
          replacement_behavior: string | null;
          trigger_description: string | null;
          updated_at: string;
          urge_description: string | null;
          user_id: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          escalation_level?: Database["public"]["Enums"]["commitment_level"];
          id?: never;
          immediate_reward?: string | null;
          implementation_intention?: string | null;
          long_term_cost?: string | null;
          max_escalation_level?: Database["public"]["Enums"]["commitment_level"];
          name: string;
          replacement_behavior?: string | null;
          trigger_description?: string | null;
          updated_at?: string;
          urge_description?: string | null;
          user_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          escalation_level?: Database["public"]["Enums"]["commitment_level"];
          id?: never;
          immediate_reward?: string | null;
          implementation_intention?: string | null;
          long_term_cost?: string | null;
          max_escalation_level?: Database["public"]["Enums"]["commitment_level"];
          name?: string;
          replacement_behavior?: string | null;
          trigger_description?: string | null;
          updated_at?: string;
          urge_description?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kill_habits_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      lecture_transcripts: {
        Row: {
          audio_deleted: boolean;
          course_id: number;
          created_at: string;
          deepgram_request_id: string | null;
          failure_reason: string | null;
          id: number;
          lecture_date: string;
          segments: Json | null;
          status: string;
          storage_path: string;
          transcript: string | null;
          updated_at: string;
          user_id: string;
          webhook_token: string;
        };
        Insert: {
          audio_deleted?: boolean;
          course_id: number;
          created_at?: string;
          deepgram_request_id?: string | null;
          failure_reason?: string | null;
          id?: never;
          lecture_date: string;
          segments?: Json | null;
          status?: string;
          storage_path: string;
          transcript?: string | null;
          updated_at?: string;
          user_id: string;
          webhook_token: string;
        };
        Update: {
          audio_deleted?: boolean;
          course_id?: number;
          created_at?: string;
          deepgram_request_id?: string | null;
          failure_reason?: string | null;
          id?: never;
          lecture_date?: string;
          segments?: Json | null;
          status?: string;
          storage_path?: string;
          transcript?: string | null;
          updated_at?: string;
          user_id?: string;
          webhook_token?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lecture_transcripts_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lecture_transcripts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      llm_usage_log: {
        Row: {
          cache_read_tokens: number;
          cache_write_tokens: number;
          call_type: string;
          content_hash: string | null;
          cost_usd: number;
          created_at: string;
          id: number;
          input_tokens: number;
          latency_ms: number | null;
          model: string;
          output_tokens: number;
          success: boolean;
          user_id: string | null;
        };
        Insert: {
          cache_read_tokens?: number;
          cache_write_tokens?: number;
          call_type: string;
          content_hash?: string | null;
          cost_usd: number;
          created_at?: string;
          id?: never;
          input_tokens?: number;
          latency_ms?: number | null;
          model: string;
          output_tokens?: number;
          success: boolean;
          user_id?: string | null;
        };
        Update: {
          cache_read_tokens?: number;
          cache_write_tokens?: number;
          call_type?: string;
          content_hash?: string | null;
          cost_usd?: number;
          created_at?: string;
          id?: never;
          input_tokens?: number;
          latency_ms?: number | null;
          model?: string;
          output_tokens?: number;
          success?: boolean;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "llm_usage_log_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      milestones: {
        Row: {
          created_at: string;
          done: boolean;
          goal_id: number;
          id: number;
          month: string;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          done?: boolean;
          goal_id: number;
          id?: never;
          month: string;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          done?: boolean;
          goal_id?: number;
          id?: never;
          month?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "milestones_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "milestones_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      monthly_summaries: {
        Row: {
          created_at: string;
          id: number;
          month_start_date: string;
          summary: Json;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: never;
          month_start_date: string;
          summary: Json;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: never;
          month_start_date?: string;
          summary?: Json;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "monthly_summaries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      oauth_connections: {
        Row: {
          connected_at: string;
          created_at: string;
          expires_at: string | null;
          external_account_id: string | null;
          id: number;
          provider: string;
          scope: string | null;
          status: string;
          updated_at: string;
          user_id: string;
          vault_secret_id: string;
        };
        Insert: {
          connected_at?: string;
          created_at?: string;
          expires_at?: string | null;
          external_account_id?: string | null;
          id?: never;
          provider: string;
          scope?: string | null;
          status?: string;
          updated_at?: string;
          user_id: string;
          vault_secret_id: string;
        };
        Update: {
          connected_at?: string;
          created_at?: string;
          expires_at?: string | null;
          external_account_id?: string | null;
          id?: never;
          provider?: string;
          scope?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
          vault_secret_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "oauth_connections_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      practice_tests: {
        Row: {
          conditions: string | null;
          course_id: number;
          created_at: string;
          deliverable_id: number | null;
          id: number;
          local_date: string;
          score_pct: number;
          timed: boolean;
          user_id: string;
        };
        Insert: {
          conditions?: string | null;
          course_id: number;
          created_at?: string;
          deliverable_id?: number | null;
          id?: never;
          local_date: string;
          score_pct: number;
          timed?: boolean;
          user_id: string;
        };
        Update: {
          conditions?: string | null;
          course_id?: number;
          created_at?: string;
          deliverable_id?: number | null;
          id?: never;
          local_date?: string;
          score_pct?: number;
          timed?: boolean;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "practice_tests_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "practice_tests_deliverable_id_fkey";
            columns: ["deliverable_id"];
            isOneToOne: false;
            referencedRelation: "deliverables";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "practice_tests_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      prayers: {
        Row: {
          created_at: string;
          id: number;
          local_date: string;
          logged_at: string;
          prayer_name: Database["public"]["Enums"]["prayer_name"];
          status: Database["public"]["Enums"]["prayer_status"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: never;
          local_date: string;
          logged_at?: string;
          prayer_name: Database["public"]["Enums"]["prayer_name"];
          status: Database["public"]["Enums"]["prayer_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: never;
          local_date?: string;
          logged_at?: string;
          prayer_name?: Database["public"]["Enums"]["prayer_name"];
          status?: Database["public"]["Enums"]["prayer_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prayers_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          asr_madhab: string;
          checkin_interval_minutes: number;
          checkin_nudge_enabled: boolean;
          checkin_window_end: string | null;
          checkin_window_start: string | null;
          created_at: string;
          daily_new_lesson_limit: number;
          desired_retention: number;
          display_name: string | null;
          email: string;
          id: string;
          learn_notification_time: string | null;
          llm_monthly_budget_usd: number;
          location_label: string | null;
          location_lat: number | null;
          location_lng: number | null;
          prayer_calc_method: string;
          qada_owed: number;
          signal_domains: Database["public"]["Enums"]["life_domain"][];
          sleep_baseline_hours: number | null;
          timezone: string;
          tracking_started_on: string | null;
          updated_at: string;
          weekday_baselines: Json;
        };
        Insert: {
          asr_madhab?: string;
          checkin_interval_minutes?: number;
          checkin_nudge_enabled?: boolean;
          checkin_window_end?: string | null;
          checkin_window_start?: string | null;
          created_at?: string;
          daily_new_lesson_limit?: number;
          desired_retention?: number;
          display_name?: string | null;
          email: string;
          id: string;
          learn_notification_time?: string | null;
          llm_monthly_budget_usd?: number;
          location_label?: string | null;
          location_lat?: number | null;
          location_lng?: number | null;
          prayer_calc_method?: string;
          qada_owed?: number;
          signal_domains?: Database["public"]["Enums"]["life_domain"][];
          sleep_baseline_hours?: number | null;
          timezone?: string;
          tracking_started_on?: string | null;
          updated_at?: string;
          weekday_baselines?: Json;
        };
        Update: {
          asr_madhab?: string;
          checkin_interval_minutes?: number;
          checkin_nudge_enabled?: boolean;
          checkin_window_end?: string | null;
          checkin_window_start?: string | null;
          created_at?: string;
          daily_new_lesson_limit?: number;
          desired_retention?: number;
          display_name?: string | null;
          email?: string;
          id?: string;
          learn_notification_time?: string | null;
          llm_monthly_budget_usd?: number;
          location_label?: string | null;
          location_lat?: number | null;
          location_lng?: number | null;
          prayer_calc_method?: string;
          qada_owed?: number;
          signal_domains?: Database["public"]["Enums"]["life_domain"][];
          sleep_baseline_hours?: number | null;
          timezone?: string;
          tracking_started_on?: string | null;
          updated_at?: string;
          weekday_baselines?: Json;
        };
        Relationships: [];
      };
      quran_sessions: {
        Row: {
          created_at: string;
          id: number;
          juz: number | null;
          local_date: string;
          notes: string | null;
          pages_read: number | null;
          surah: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: never;
          juz?: number | null;
          local_date: string;
          notes?: string | null;
          pages_read?: number | null;
          surah?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: never;
          juz?: number | null;
          local_date?: string;
          notes?: string | null;
          pages_read?: number | null;
          surah?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quran_sessions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      questions: {
        Row: {
          active: boolean;
          answer: string;
          course_id: number;
          created_at: string;
          id: number;
          origin: string;
          prompt: string;
          source_anchor: string | null;
          source_skipped: boolean;
          topic: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          active?: boolean;
          answer: string;
          course_id: number;
          created_at?: string;
          id?: never;
          origin?: string;
          prompt: string;
          source_anchor?: string | null;
          source_skipped?: boolean;
          topic?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          answer?: string;
          course_id?: number;
          created_at?: string;
          id?: never;
          origin?: string;
          prompt?: string;
          source_anchor?: string | null;
          source_skipped?: boolean;
          topic?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "questions_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "questions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      reflection_entries: {
        Row: {
          created_at: string;
          id: number;
          intensity: Database["public"]["Enums"]["reflection_intensity"];
          local_date: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: never;
          intensity: Database["public"]["Enums"]["reflection_intensity"];
          local_date: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: never;
          intensity?: Database["public"]["Enums"]["reflection_intensity"];
          local_date?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reflection_entries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      risk_snapshots: {
        Row: {
          band: Database["public"]["Enums"]["risk_band"];
          confidence: Database["public"]["Enums"]["confidence_level"];
          course_id: number | null;
          created_at: string;
          deliverable_id: number | null;
          id: number;
          scope: string;
          score: number;
          snapshot_date: string;
          trace: Json;
          user_id: string;
        };
        Insert: {
          band: Database["public"]["Enums"]["risk_band"];
          confidence: Database["public"]["Enums"]["confidence_level"];
          course_id?: number | null;
          created_at?: string;
          deliverable_id?: number | null;
          id?: never;
          scope: string;
          score: number;
          snapshot_date: string;
          trace: Json;
          user_id: string;
        };
        Update: {
          band?: Database["public"]["Enums"]["risk_band"];
          confidence?: Database["public"]["Enums"]["confidence_level"];
          course_id?: number | null;
          created_at?: string;
          deliverable_id?: number | null;
          id?: never;
          scope?: string;
          score?: number;
          snapshot_date?: string;
          trace?: Json;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "risk_snapshots_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "risk_snapshots_deliverable_id_fkey";
            columns: ["deliverable_id"];
            isOneToOne: false;
            referencedRelation: "deliverables";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "risk_snapshots_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      routines: {
        Row: {
          created_at: string;
          id: number;
          items: Json;
          local_date: string;
          type: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: never;
          items?: Json;
          local_date: string;
          type: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: never;
          items?: Json;
          local_date?: string;
          type?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "routines_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      screen_daily: {
        Row: {
          created_at: string;
          distracting_min: number | null;
          id: number;
          local_date: string;
          productive_min: number | null;
          source: string;
          total_screen_min: number | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          distracting_min?: number | null;
          id?: never;
          local_date: string;
          productive_min?: number | null;
          source?: string;
          total_screen_min?: number | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          distracting_min?: number | null;
          id?: never;
          local_date?: string;
          productive_min?: number | null;
          source?: string;
          total_screen_min?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "screen_daily_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      semester_lessons: {
        Row: {
          confidence: Database["public"]["Enums"]["insight_confidence_level"];
          created_at: string;
          id: number;
          lesson: string;
          source_insight_id: number | null;
          source_report_id: number | null;
          term: string;
          user_id: string;
        };
        Insert: {
          confidence?: Database["public"]["Enums"]["insight_confidence_level"];
          created_at?: string;
          id?: never;
          lesson: string;
          source_insight_id?: number | null;
          source_report_id?: number | null;
          term: string;
          user_id: string;
        };
        Update: {
          confidence?: Database["public"]["Enums"]["insight_confidence_level"];
          created_at?: string;
          id?: never;
          lesson?: string;
          source_insight_id?: number | null;
          source_report_id?: number | null;
          term?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "semester_lessons_source_insight_id_fkey";
            columns: ["source_insight_id"];
            isOneToOne: false;
            referencedRelation: "insights";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "semester_lessons_source_report_id_fkey";
            columns: ["source_report_id"];
            isOneToOne: false;
            referencedRelation: "agent_reports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "semester_lessons_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      sunnah_logs: {
        Row: {
          created_at: string;
          id: number;
          local_date: string;
          prayer_name: Database["public"]["Enums"]["prayer_name"];
          slot: Database["public"]["Enums"]["sunnah_slot"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: never;
          local_date: string;
          prayer_name: Database["public"]["Enums"]["prayer_name"];
          slot: Database["public"]["Enums"]["sunnah_slot"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: never;
          local_date?: string;
          prayer_name?: Database["public"]["Enums"]["prayer_name"];
          slot?: Database["public"]["Enums"]["sunnah_slot"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sunnah_logs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      syllabus_extractions: {
        Row: {
          confirmed_at: string | null;
          created_at: string;
          extracted_payload: Json;
          extraction_confidence: number;
          id: number;
          item_type: string;
          source_snippet: string;
          status: string;
          upload_id: number;
          user_id: string;
        };
        Insert: {
          confirmed_at?: string | null;
          created_at?: string;
          extracted_payload: Json;
          extraction_confidence: number;
          id?: never;
          item_type: string;
          source_snippet: string;
          status?: string;
          upload_id: number;
          user_id: string;
        };
        Update: {
          confirmed_at?: string | null;
          created_at?: string;
          extracted_payload?: Json;
          extraction_confidence?: number;
          id?: never;
          item_type?: string;
          source_snippet?: string;
          status?: string;
          upload_id?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "syllabus_extractions_upload_id_fkey";
            columns: ["upload_id"];
            isOneToOne: false;
            referencedRelation: "syllabus_uploads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "syllabus_extractions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      syllabus_uploads: {
        Row: {
          course_id: number | null;
          extraction_status: string;
          failure_reason: string | null;
          file_name: string;
          id: number;
          storage_path: string;
          uploaded_at: string;
          user_id: string;
        };
        Insert: {
          course_id?: number | null;
          extraction_status?: string;
          failure_reason?: string | null;
          file_name: string;
          id?: never;
          storage_path: string;
          uploaded_at?: string;
          user_id: string;
        };
        Update: {
          course_id?: number | null;
          extraction_status?: string;
          failure_reason?: string | null;
          file_name?: string;
          id?: never;
          storage_path?: string;
          uploaded_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "syllabus_uploads_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "syllabus_uploads_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      task_sessions: {
        Row: {
          actual_duration_min: number | null;
          actual_start: string | null;
          category: string | null;
          created_at: string;
          deliverable: string | null;
          domain: Database["public"]["Enums"]["life_domain"];
          hour_index: number | null;
          id: number;
          interruptions: number;
          local_date: string | null;
          location: string | null;
          mode: string | null;
          objective_output: string | null;
          phone_usage_min: number | null;
          planned_duration_min: number;
          planned_start: string;
          sunnah_slot: "before" | "after";
          session_type: Database["public"]["Enums"]["session_type"];
          status: string;
          subjective_focus: number | null;
          target_achieved: string | null;
          task_id: number | null;
          user_id: string;
        };
        Insert: {
          actual_duration_min?: number | null;
          actual_start?: string | null;
          category?: string | null;
          created_at?: string;
          deliverable?: string | null;
          domain?: Database["public"]["Enums"]["life_domain"];
          hour_index?: number | null;
          id?: never;
          interruptions?: number;
          local_date?: string | null;
          location?: string | null;
          mode?: string | null;
          objective_output?: string | null;
          phone_usage_min?: number | null;
          planned_duration_min: number;
          planned_start: string;
          session_type?: Database["public"]["Enums"]["session_type"];
          status?: string;
          subjective_focus?: number | null;
          target_achieved?: string | null;
          task_id?: number | null;
          user_id: string;
        };
        Update: {
          actual_duration_min?: number | null;
          actual_start?: string | null;
          category?: string | null;
          created_at?: string;
          deliverable?: string | null;
          domain?: Database["public"]["Enums"]["life_domain"];
          hour_index?: number | null;
          id?: never;
          interruptions?: number;
          local_date?: string | null;
          location?: string | null;
          mode?: string | null;
          objective_output?: string | null;
          phone_usage_min?: number | null;
          planned_duration_min?: number;
          planned_start?: string;
          session_type?: Database["public"]["Enums"]["session_type"];
          status?: string;
          subjective_focus?: number | null;
          target_achieved?: string | null;
          task_id?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_sessions_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_sessions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      tasks: {
        Row: {
          actual_minutes: number | null;
          category: string;
          completed_at: string | null;
          course_id: number | null;
          created_at: string;
          deliverable_id: number | null;
          estimated_minutes: number | null;
          id: number;
          mit_rank: number | null;
          mom_id: number | null;
          planned_date: string;
          planned_location: string | null;
          planned_start_at: string | null;
          proof_of_work_content: string | null;
          proof_of_work_type: string | null;
          requires_proof_of_work: boolean;
          status: string;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          actual_minutes?: number | null;
          category: string;
          completed_at?: string | null;
          course_id?: number | null;
          created_at?: string;
          deliverable_id?: number | null;
          estimated_minutes?: number | null;
          id?: never;
          mit_rank?: number | null;
          mom_id?: number | null;
          planned_date: string;
          planned_location?: string | null;
          planned_start_at?: string | null;
          proof_of_work_content?: string | null;
          proof_of_work_type?: string | null;
          requires_proof_of_work?: boolean;
          status?: string;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          actual_minutes?: number | null;
          category?: string;
          completed_at?: string | null;
          course_id?: number | null;
          created_at?: string;
          deliverable_id?: number | null;
          estimated_minutes?: number | null;
          id?: never;
          mit_rank?: number | null;
          mom_id?: number | null;
          planned_date?: string;
          planned_location?: string | null;
          planned_start_at?: string | null;
          proof_of_work_content?: string | null;
          proof_of_work_type?: string | null;
          requires_proof_of_work?: boolean;
          status?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_deliverable_id_fkey";
            columns: ["deliverable_id"];
            isOneToOne: false;
            referencedRelation: "deliverables";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_mom_id_fkey";
            columns: ["mom_id"];
            isOneToOne: false;
            referencedRelation: "moms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      telemetry_events: {
        Row: {
          created_at: string;
          external_id: string | null;
          id: number;
          local_date: string;
          metric: string;
          occurred_at: string;
          source: string;
          type: string;
          unit: string | null;
          user_id: string;
          value: number;
        };
        Insert: {
          created_at?: string;
          external_id?: string | null;
          id?: never;
          local_date: string;
          metric: string;
          occurred_at?: string;
          source: string;
          type: string;
          unit?: string | null;
          user_id: string;
          value: number;
        };
        Update: {
          created_at?: string;
          external_id?: string | null;
          id?: never;
          local_date?: string;
          metric?: string;
          occurred_at?: string;
          source?: string;
          type?: string;
          unit?: string | null;
          user_id?: string;
          value?: number;
        };
        Relationships: [
          {
            foreignKeyName: "telemetry_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      weekly_plan_blocks: {
        Row: {
          block_date: string;
          course_id: number | null;
          deliverable_id: number | null;
          end_at: string;
          id: number;
          minutes: number;
          start_at: string;
          status: string;
          task_id: number | null;
          user_id: string;
          weekly_plan_id: number;
        };
        Insert: {
          block_date: string;
          course_id?: number | null;
          deliverable_id?: number | null;
          end_at: string;
          id?: never;
          minutes: number;
          start_at: string;
          status?: string;
          task_id?: number | null;
          user_id: string;
          weekly_plan_id: number;
        };
        Update: {
          block_date?: string;
          course_id?: number | null;
          deliverable_id?: number | null;
          end_at?: string;
          id?: never;
          minutes?: number;
          start_at?: string;
          status?: string;
          task_id?: number | null;
          user_id?: string;
          weekly_plan_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "weekly_plan_blocks_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "weekly_plan_blocks_deliverable_id_fkey";
            columns: ["deliverable_id"];
            isOneToOne: false;
            referencedRelation: "deliverables";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "weekly_plan_blocks_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "weekly_plan_blocks_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "weekly_plan_blocks_weekly_plan_id_fkey";
            columns: ["weekly_plan_id"];
            isOneToOne: false;
            referencedRelation: "weekly_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      weekly_plan_unplaced: {
        Row: {
          course_id: number | null;
          deliverable_id: number | null;
          id: number;
          minutes_needed: number;
          minutes_placed: number;
          minutes_shortfall: number;
          reason: string;
          user_id: string;
          weekly_plan_id: number;
        };
        Insert: {
          course_id?: number | null;
          deliverable_id?: number | null;
          id?: never;
          minutes_needed: number;
          minutes_placed: number;
          minutes_shortfall: number;
          reason: string;
          user_id: string;
          weekly_plan_id: number;
        };
        Update: {
          course_id?: number | null;
          deliverable_id?: number | null;
          id?: never;
          minutes_needed?: number;
          minutes_placed?: number;
          minutes_shortfall?: number;
          reason?: string;
          user_id?: string;
          weekly_plan_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "weekly_plan_unplaced_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "weekly_plan_unplaced_deliverable_id_fkey";
            columns: ["deliverable_id"];
            isOneToOne: false;
            referencedRelation: "deliverables";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "weekly_plan_unplaced_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "weekly_plan_unplaced_weekly_plan_id_fkey";
            columns: ["weekly_plan_id"];
            isOneToOne: false;
            referencedRelation: "weekly_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      weekly_plans: {
        Row: {
          academic_load: string;
          generated_at: string;
          has_unplaced_work: boolean;
          id: number;
          total_capacity_minutes: number;
          total_needed_minutes: number;
          user_id: string;
          week_start_date: string;
        };
        Insert: {
          academic_load: string;
          generated_at?: string;
          has_unplaced_work?: boolean;
          id?: never;
          total_capacity_minutes: number;
          total_needed_minutes: number;
          user_id: string;
          week_start_date: string;
        };
        Update: {
          academic_load?: string;
          generated_at?: string;
          has_unplaced_work?: boolean;
          id?: never;
          total_capacity_minutes?: number;
          total_needed_minutes?: number;
          user_id?: string;
          week_start_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: "weekly_plans_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      weekly_summaries: {
        Row: {
          created_at: string;
          id: number;
          summary: Json;
          user_id: string;
          week_start_date: string;
        };
        Insert: {
          created_at?: string;
          id?: never;
          summary: Json;
          user_id: string;
          week_start_date: string;
        };
        Update: {
          created_at?: string;
          id?: never;
          summary?: Json;
          user_id?: string;
          week_start_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: "weekly_summaries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      worries: {
        Row: {
          created_at: string;
          id: number;
          status: string;
          text: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: never;
          status?: string;
          text: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: never;
          status?: string;
          text?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "worries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      allocation_checkins: {
        Row: {
          answered_at: string | null;
          created_at: string;
          id: number;
          local_date: string;
          source: string;
          updated_at: string;
          user_id: string;
          window_end: string;
          window_start: string;
        };
        Insert: {
          answered_at?: string | null;
          created_at?: string;
          id?: never;
          local_date: string;
          source?: string;
          updated_at?: string;
          user_id: string;
          window_end: string;
          window_start: string;
        };
        Update: {
          answered_at?: string | null;
          created_at?: string;
          id?: never;
          local_date?: string;
          source?: string;
          updated_at?: string;
          user_id?: string;
          window_end?: string;
          window_start?: string;
        };
        Relationships: [
          {
            foreignKeyName: "allocation_checkins_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      body_metrics: {
        Row: {
          created_at: string;
          id: number;
          local_date: string;
          user_id: string;
          waist_in: number | null;
          weight_lb: number | null;
        };
        Insert: {
          created_at?: string;
          id?: never;
          local_date: string;
          user_id: string;
          waist_in?: number | null;
          weight_lb?: number | null;
        };
        Update: {
          created_at?: string;
          id?: never;
          local_date?: string;
          user_id?: string;
          waist_in?: number | null;
          weight_lb?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "body_metrics_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      checkin_allocations: {
        Row: {
          checkin_id: number;
          created_at: string;
          domain: Database["public"]["Enums"]["life_domain"];
          id: number;
          minutes: number;
          user_id: string;
        };
        Insert: {
          checkin_id: number;
          created_at?: string;
          domain: Database["public"]["Enums"]["life_domain"];
          id?: never;
          minutes: number;
          user_id: string;
        };
        Update: {
          checkin_id?: number;
          created_at?: string;
          domain?: Database["public"]["Enums"]["life_domain"];
          id?: never;
          minutes?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "checkin_allocations_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "checkin_allocations_checkin_id_fkey";
            columns: ["checkin_id"];
            isOneToOne: false;
            referencedRelation: "allocation_checkins";
            referencedColumns: ["id"];
          },
        ];
      };
      dimension_routes: {
        Row: {
          created_at: string;
          dimension_id: number;
          id: number;
          kind: Database["public"]["Enums"]["evidence_kind"];
          match_value: string | null;
          user_id: string;
          weight: number;
        };
        Insert: {
          created_at?: string;
          dimension_id: number;
          id?: never;
          kind: Database["public"]["Enums"]["evidence_kind"];
          match_value?: string | null;
          user_id: string;
          weight?: number;
        };
        Update: {
          created_at?: string;
          dimension_id?: number;
          id?: never;
          kind?: Database["public"]["Enums"]["evidence_kind"];
          match_value?: string | null;
          user_id?: string;
          weight?: number;
        };
        Relationships: [
          {
            foreignKeyName: "dimension_routes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dimension_routes_dimension_id_fkey";
            columns: ["dimension_id"];
            isOneToOne: false;
            referencedRelation: "dimensions";
            referencedColumns: ["id"];
          },
        ];
      };
      dimensions: {
        Row: {
          archived: boolean;
          ceiling: number | null;
          created_at: string;
          definition: string | null;
          drift_alerts_enabled: boolean;
          drift_statement: string | null;
          id: number;
          name: string;
          parent_id: number | null;
          sort_order: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          archived?: boolean;
          ceiling?: number | null;
          created_at?: string;
          definition?: string | null;
          drift_alerts_enabled?: boolean;
          drift_statement?: string | null;
          id?: never;
          name: string;
          parent_id?: number | null;
          sort_order?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          archived?: boolean;
          ceiling?: number | null;
          created_at?: string;
          definition?: string | null;
          drift_alerts_enabled?: boolean;
          drift_statement?: string | null;
          id?: never;
          name?: string;
          parent_id?: number | null;
          sort_order?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dimensions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dimensions_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "dimensions";
            referencedColumns: ["id"];
          },
        ];
      };
      distraction_triggers: {
        Row: {
          archived: boolean;
          created_at: string;
          description: string | null;
          domain: Database["public"]["Enums"]["life_domain"] | null;
          id: number;
          name: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          archived?: boolean;
          created_at?: string;
          description?: string | null;
          domain?: Database["public"]["Enums"]["life_domain"] | null;
          id?: never;
          name: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          archived?: boolean;
          created_at?: string;
          description?: string | null;
          domain?: Database["public"]["Enums"]["life_domain"] | null;
          id?: never;
          name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "distraction_triggers_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      exercises: {
        Row: {
          active: boolean;
          created_at: string;
          id: number;
          name: string;
          notes: string | null;
          primary_muscles: Database["public"]["Enums"]["muscle_group"][];
          secondary_muscles: Database["public"]["Enums"]["muscle_group"][];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: never;
          name: string;
          notes?: string | null;
          primary_muscles?: Database["public"]["Enums"]["muscle_group"][];
          secondary_muscles?: Database["public"]["Enums"]["muscle_group"][];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: never;
          name?: string;
          notes?: string | null;
          primary_muscles?: Database["public"]["Enums"]["muscle_group"][];
          secondary_muscles?: Database["public"]["Enums"]["muscle_group"][];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exercises_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      fitness_benchmarks: {
        Row: {
          created_at: string;
          exercise_id: number;
          id: number;
          local_date: string;
          max_load: number | null;
          max_reps: number | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          exercise_id: number;
          id?: never;
          local_date: string;
          max_load?: number | null;
          max_reps?: number | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          exercise_id?: number;
          id?: never;
          local_date?: string;
          max_load?: number | null;
          max_reps?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fitness_benchmarks_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fitness_benchmarks_exercise_id_fkey";
            columns: ["exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          },
        ];
      };
      fitness_cycle_anchor: {
        Row: {
          anchor_date: string;
          created_at: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          anchor_date: string;
          created_at?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          anchor_date?: string;
          created_at?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fitness_cycle_anchor_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      ingest_jobs: {
        Row: {
          attempts: number;
          cost_usd: number;
          created_at: string;
          cursor: Json;
          heartbeat_at: string;
          id: number;
          last_error: string | null;
          progress_current: number | null;
          progress_total: number | null;
          source_id: number;
          step: Database["public"]["Enums"]["ingest_step"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          attempts?: number;
          cost_usd?: number;
          created_at?: string;
          cursor?: Json;
          heartbeat_at?: string;
          id?: never;
          last_error?: string | null;
          progress_current?: number | null;
          progress_total?: number | null;
          source_id: number;
          step?: Database["public"]["Enums"]["ingest_step"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          attempts?: number;
          cost_usd?: number;
          created_at?: string;
          cursor?: Json;
          heartbeat_at?: string;
          id?: never;
          last_error?: string | null;
          progress_current?: number | null;
          progress_total?: number | null;
          source_id?: number;
          step?: Database["public"]["Enums"]["ingest_step"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ingest_jobs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ingest_jobs_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
        ];
      };
      learn_sessions: {
        Row: {
          cards_reviewed: number;
          completed_at: string | null;
          created_at: string;
          id: number;
          local_date: string;
          new_lessons_introduced: number;
          started_at: string;
          task_session_id: number | null;
          user_id: string;
        };
        Insert: {
          cards_reviewed?: number;
          completed_at?: string | null;
          created_at?: string;
          id?: never;
          local_date: string;
          new_lessons_introduced?: number;
          started_at?: string;
          task_session_id?: number | null;
          user_id: string;
        };
        Update: {
          cards_reviewed?: number;
          completed_at?: string | null;
          created_at?: string;
          id?: never;
          local_date?: string;
          new_lessons_introduced?: number;
          started_at?: string;
          task_session_id?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "learn_sessions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "learn_sessions_task_session_id_fkey";
            columns: ["task_session_id"];
            isOneToOne: false;
            referencedRelation: "task_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      lesson_cards: {
        Row: {
          active: boolean;
          answer: string;
          created_at: string;
          id: number;
          lesson_id: number;
          prompt: string;
          prompt_type: Database["public"]["Enums"]["lesson_prompt_type"];
          sort_order: number;
          suspended_at: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          active?: boolean;
          answer: string;
          created_at?: string;
          id?: never;
          lesson_id: number;
          prompt: string;
          prompt_type: Database["public"]["Enums"]["lesson_prompt_type"];
          sort_order?: number;
          suspended_at?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          answer?: string;
          created_at?: string;
          id?: never;
          lesson_id?: number;
          prompt?: string;
          prompt_type?: Database["public"]["Enums"]["lesson_prompt_type"];
          sort_order?: number;
          suspended_at?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lesson_cards_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lesson_cards_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
        ];
      };
      lesson_reviews: {
        Row: {
          ai_feedback: string | null;
          answered_text: string | null;
          card_id: number;
          elapsed_ms: number | null;
          id: number;
          local_date: string;
          rating: Database["public"]["Enums"]["fsrs_rating"];
          reviewed_at: string;
          session_id: number | null;
          user_id: string;
        };
        Insert: {
          ai_feedback?: string | null;
          answered_text?: string | null;
          card_id: number;
          elapsed_ms?: number | null;
          id?: never;
          local_date: string;
          rating: Database["public"]["Enums"]["fsrs_rating"];
          reviewed_at?: string;
          session_id?: number | null;
          user_id: string;
        };
        Update: {
          ai_feedback?: string | null;
          answered_text?: string | null;
          card_id?: number;
          elapsed_ms?: number | null;
          id?: never;
          local_date?: string;
          rating?: Database["public"]["Enums"]["fsrs_rating"];
          reviewed_at?: string;
          session_id?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lesson_reviews_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lesson_reviews_card_id_fkey";
            columns: ["card_id"];
            isOneToOne: false;
            referencedRelation: "lesson_cards";
            referencedColumns: ["id"];
          },
        ];
      };
      lessons: {
        Row: {
          claim_to_task: string | null;
          core_claim: string;
          created_at: string;
          embedding: string | null;
          evidence_strength: Database["public"]["Enums"]["evidence_strength"] | null;
          id: number;
          mechanism: string | null;
          page_ref: number | null;
          provenance_quote: string;
          section_id: number | null;
          source_id: number;
          status: Database["public"]["Enums"]["lesson_status"];
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          claim_to_task?: string | null;
          core_claim: string;
          created_at?: string;
          embedding?: string | null;
          evidence_strength?: Database["public"]["Enums"]["evidence_strength"] | null;
          id?: never;
          mechanism?: string | null;
          page_ref?: number | null;
          provenance_quote: string;
          section_id?: number | null;
          source_id: number;
          status?: Database["public"]["Enums"]["lesson_status"];
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          claim_to_task?: string | null;
          core_claim?: string;
          created_at?: string;
          embedding?: string | null;
          evidence_strength?: Database["public"]["Enums"]["evidence_strength"] | null;
          id?: never;
          mechanism?: string | null;
          page_ref?: number | null;
          provenance_quote?: string;
          section_id?: number | null;
          source_id?: number;
          status?: Database["public"]["Enums"]["lesson_status"];
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lessons_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lessons_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lessons_section_id_fkey";
            columns: ["section_id"];
            isOneToOne: false;
            referencedRelation: "source_sections";
            referencedColumns: ["id"];
          },
        ];
      };
      plan_session_exercises: {
        Row: {
          created_at: string;
          exercise_id: number;
          id: number;
          plan_session_id: number;
          sort_order: number;
          target_load: number | null;
          target_reps_high: number | null;
          target_reps_low: number | null;
          target_sets: number | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          exercise_id: number;
          id?: never;
          plan_session_id: number;
          sort_order?: number;
          target_load?: number | null;
          target_reps_high?: number | null;
          target_reps_low?: number | null;
          target_sets?: number | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          exercise_id?: number;
          id?: never;
          plan_session_id?: number;
          sort_order?: number;
          target_load?: number | null;
          target_reps_high?: number | null;
          target_reps_low?: number | null;
          target_sets?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plan_session_exercises_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plan_session_exercises_plan_session_id_fkey";
            columns: ["plan_session_id"];
            isOneToOne: false;
            referencedRelation: "plan_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plan_session_exercises_exercise_id_fkey";
            columns: ["exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          },
        ];
      };
      plan_sessions: {
        Row: {
          created_at: string;
          duration_minutes: number | null;
          id: number;
          name: string;
          plan_id: number;
          schedule_days: number[];
          sort_order: number;
          start_time: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          duration_minutes?: number | null;
          id?: never;
          name: string;
          plan_id: number;
          schedule_days?: number[];
          sort_order?: number;
          start_time?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          duration_minutes?: number | null;
          id?: never;
          name?: string;
          plan_id?: number;
          schedule_days?: number[];
          sort_order?: number;
          start_time?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plan_sessions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plan_sessions_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "workout_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      session_sets: {
        Row: {
          created_at: string;
          exercise_id: number;
          id: number;
          load: number | null;
          reps: number | null;
          sort_order: number;
          user_id: string;
          workout_session_id: number;
        };
        Insert: {
          created_at?: string;
          exercise_id: number;
          id?: never;
          load?: number | null;
          reps?: number | null;
          sort_order?: number;
          user_id: string;
          workout_session_id: number;
        };
        Update: {
          created_at?: string;
          exercise_id?: number;
          id?: never;
          load?: number | null;
          reps?: number | null;
          sort_order?: number;
          user_id?: string;
          workout_session_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "session_sets_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "session_sets_workout_session_id_fkey";
            columns: ["workout_session_id"];
            isOneToOne: false;
            referencedRelation: "workout_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "session_sets_exercise_id_fkey";
            columns: ["exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          },
        ];
      };
      source_chunks: {
        Row: {
          created_at: string;
          embedding: string | null;
          id: number;
          page_end: number | null;
          page_start: number | null;
          section_id: number | null;
          sort_order: number;
          source_id: number;
          text: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          embedding?: string | null;
          id?: never;
          page_end?: number | null;
          page_start?: number | null;
          section_id?: number | null;
          sort_order?: number;
          source_id: number;
          text: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          embedding?: string | null;
          id?: never;
          page_end?: number | null;
          page_start?: number | null;
          section_id?: number | null;
          sort_order?: number;
          source_id?: number;
          text?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "source_chunks_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "source_chunks_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "source_chunks_section_id_fkey";
            columns: ["section_id"];
            isOneToOne: false;
            referencedRelation: "source_sections";
            referencedColumns: ["id"];
          },
        ];
      };
      source_sections: {
        Row: {
          created_at: string;
          id: number;
          page_end: number | null;
          page_start: number | null;
          sort_order: number;
          source_id: number;
          title: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: never;
          page_end?: number | null;
          page_start?: number | null;
          sort_order?: number;
          source_id: number;
          title?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: never;
          page_end?: number | null;
          page_start?: number | null;
          sort_order?: number;
          source_id?: number;
          title?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "source_sections_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "source_sections_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
        ];
      };
      sources: {
        Row: {
          author: string | null;
          created_at: string;
          id: number;
          kind: Database["public"]["Enums"]["source_kind"];
          lesson_count: number;
          page_count: number | null;
          status: Database["public"]["Enums"]["source_status"];
          storage_path: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          author?: string | null;
          created_at?: string;
          id?: never;
          kind?: Database["public"]["Enums"]["source_kind"];
          lesson_count?: number;
          page_count?: number | null;
          status?: Database["public"]["Enums"]["source_status"];
          storage_path?: string | null;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          author?: string | null;
          created_at?: string;
          id?: never;
          kind?: Database["public"]["Enums"]["source_kind"];
          lesson_count?: number;
          page_count?: number | null;
          status?: Database["public"]["Enums"]["source_status"];
          storage_path?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sources_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      trigger_action_plans: {
        Row: {
          body: string;
          created_at: string;
          id: number;
          supersede_reason: string | null;
          superseded_at: string | null;
          trigger_id: number;
          user_id: string;
          version: number;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: never;
          supersede_reason?: string | null;
          superseded_at?: string | null;
          trigger_id: number;
          user_id: string;
          version?: number;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: never;
          supersede_reason?: string | null;
          superseded_at?: string | null;
          trigger_id?: number;
          user_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "trigger_action_plans_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trigger_action_plans_trigger_id_fkey";
            columns: ["trigger_id"];
            isOneToOne: false;
            referencedRelation: "distraction_triggers";
            referencedColumns: ["id"];
          },
        ];
      };
      trigger_plan_outcomes: {
        Row: {
          created_at: string;
          followed: boolean | null;
          id: number;
          local_date: string;
          plan_id: number;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          followed?: boolean | null;
          id?: never;
          local_date: string;
          plan_id: number;
          user_id: string;
        };
        Update: {
          created_at?: string;
          followed?: boolean | null;
          id?: never;
          local_date?: string;
          plan_id?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trigger_plan_outcomes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trigger_plan_outcomes_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "trigger_action_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      weekly_goals: {
        Row: {
          completed_at: string | null;
          created_at: string;
          domain: Database["public"]["Enums"]["life_domain"];
          goal_id: number | null;
          headline: string;
          id: number;
          milestones: string | null;
          updated_at: string;
          user_id: string;
          week_start_date: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          domain: Database["public"]["Enums"]["life_domain"];
          goal_id?: number | null;
          headline: string;
          id?: never;
          milestones?: string | null;
          updated_at?: string;
          user_id: string;
          week_start_date: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          domain?: Database["public"]["Enums"]["life_domain"];
          goal_id?: number | null;
          headline?: string;
          id?: never;
          milestones?: string | null;
          updated_at?: string;
          user_id?: string;
          week_start_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: "weekly_goals_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "weekly_goals_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
        ];
      };
      work_shifts: {
        Row: {
          created_at: string;
          end_time: string;
          id: number;
          label: string | null;
          local_date: string | null;
          start_time: string;
          updated_at: string;
          user_id: string;
          weekday: number | null;
        };
        Insert: {
          created_at?: string;
          end_time: string;
          id?: never;
          label?: string | null;
          local_date?: string | null;
          start_time: string;
          updated_at?: string;
          user_id: string;
          weekday?: number | null;
        };
        Update: {
          created_at?: string;
          end_time?: string;
          id?: never;
          label?: string | null;
          local_date?: string | null;
          start_time?: string;
          updated_at?: string;
          user_id?: string;
          weekday?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "work_shifts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      work_target_tasks: {
        Row: {
          blocked_reason: string | null;
          completed_at: string | null;
          created_at: string;
          deadline: string | null;
          id: number;
          sort_order: number;
          status: Database["public"]["Enums"]["work_target_status"];
          target_id: number;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          blocked_reason?: string | null;
          completed_at?: string | null;
          created_at?: string;
          deadline?: string | null;
          id?: never;
          sort_order?: number;
          status?: Database["public"]["Enums"]["work_target_status"];
          target_id: number;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          blocked_reason?: string | null;
          completed_at?: string | null;
          created_at?: string;
          deadline?: string | null;
          id?: never;
          sort_order?: number;
          status?: Database["public"]["Enums"]["work_target_status"];
          target_id?: number;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "work_target_tasks_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_target_tasks_target_id_fkey";
            columns: ["target_id"];
            isOneToOne: false;
            referencedRelation: "work_targets";
            referencedColumns: ["id"];
          },
        ];
      };
      work_targets: {
        Row: {
          completed_at: string | null;
          created_at: string;
          deadline: string | null;
          id: number;
          sort_order: number;
          status: Database["public"]["Enums"]["work_target_status"];
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          deadline?: string | null;
          id?: never;
          sort_order?: number;
          status?: Database["public"]["Enums"]["work_target_status"];
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          deadline?: string | null;
          id?: never;
          sort_order?: number;
          status?: Database["public"]["Enums"]["work_target_status"];
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "work_targets_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      workout_plans: {
        Row: {
          active: boolean;
          created_at: string;
          description: string | null;
          id: number;
          name: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          description?: string | null;
          id?: never;
          name: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          description?: string | null;
          id?: never;
          name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workout_plans_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      workout_sessions: {
        Row: {
          confirmed_at: string | null;
          created_at: string;
          id: number;
          local_date: string;
          notes: string | null;
          plan_session_id: number | null;
          task_session_id: number | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          confirmed_at?: string | null;
          created_at?: string;
          id?: never;
          local_date: string;
          notes?: string | null;
          plan_session_id?: number | null;
          task_session_id?: number | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          confirmed_at?: string | null;
          created_at?: string;
          id?: never;
          local_date?: string;
          notes?: string | null;
          plan_session_id?: number | null;
          task_session_id?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workout_sessions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workout_sessions_plan_session_id_fkey";
            columns: ["plan_session_id"];
            isOneToOne: false;
            referencedRelation: "plan_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workout_sessions_task_session_id_fkey";
            columns: ["task_session_id"];
            isOneToOne: false;
            referencedRelation: "task_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      beachheads: {
        Row: {
          active: boolean;
          created_at: string;
          ends_on: string | null;
          id: number;
          starts_on: string | null;
          target: string | null;
          title: string;
          updated_at: string;
          user_id: string;
          vision_id: number | null;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          ends_on?: string | null;
          id?: never;
          starts_on?: string | null;
          target?: string | null;
          title: string;
          updated_at?: string;
          user_id: string;
          vision_id?: number | null;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          ends_on?: string | null;
          id?: never;
          starts_on?: string | null;
          target?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
          vision_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "beachheads_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "beachheads_vision_id_fkey";
            columns: ["vision_id"];
            isOneToOne: false;
            referencedRelation: "visions";
            referencedColumns: ["id"];
          },
        ];
      };
      missions: {
        Row: {
          active: boolean;
          beachhead_id: number | null;
          created_at: string;
          ends_on: string | null;
          id: number;
          starts_on: string | null;
          target: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          active?: boolean;
          beachhead_id?: number | null;
          created_at?: string;
          ends_on?: string | null;
          id?: never;
          starts_on?: string | null;
          target?: string | null;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          beachhead_id?: number | null;
          created_at?: string;
          ends_on?: string | null;
          id?: never;
          starts_on?: string | null;
          target?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "missions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "missions_beachhead_id_fkey";
            columns: ["beachhead_id"];
            isOneToOne: false;
            referencedRelation: "beachheads";
            referencedColumns: ["id"];
          },
        ];
      };
      mom_reviews: {
        Row: {
          created_at: string;
          id: number;
          local_date: string;
          mom_id: number;
          next_mom_id: number | null;
          outcome: Database["public"]["Enums"]["mom_outcome"];
          updated_at: string;
          user_id: string;
          what_happened: string | null;
        };
        Insert: {
          created_at?: string;
          id?: never;
          local_date: string;
          mom_id: number;
          next_mom_id?: number | null;
          outcome: Database["public"]["Enums"]["mom_outcome"];
          updated_at?: string;
          user_id: string;
          what_happened?: string | null;
        };
        Update: {
          created_at?: string;
          id?: never;
          local_date?: string;
          mom_id?: number;
          next_mom_id?: number | null;
          outcome?: Database["public"]["Enums"]["mom_outcome"];
          updated_at?: string;
          user_id?: string;
          what_happened?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "mom_reviews_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mom_reviews_mom_id_fkey";
            columns: ["mom_id"];
            isOneToOne: false;
            referencedRelation: "moms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mom_reviews_next_mom_id_fkey";
            columns: ["next_mom_id"];
            isOneToOne: false;
            referencedRelation: "moms";
            referencedColumns: ["id"];
          },
        ];
      };
      moms: {
        Row: {
          active: boolean;
          created_at: string;
          ends_on: string | null;
          id: number;
          mission_id: number | null;
          starts_on: string | null;
          target: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          ends_on?: string | null;
          id?: never;
          mission_id?: number | null;
          starts_on?: string | null;
          target?: string | null;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          ends_on?: string | null;
          id?: never;
          mission_id?: number | null;
          starts_on?: string | null;
          target?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "moms_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moms_mission_id_fkey";
            columns: ["mission_id"];
            isOneToOne: false;
            referencedRelation: "missions";
            referencedColumns: ["id"];
          },
        ];
      };
      visions: {
        Row: {
          active: boolean;
          body: string;
          created_at: string;
          id: number;
          mandate_environmental: string | null;
          mandate_family: string | null;
          mandate_financial: string | null;
          mandate_physical: string | null;
          mandate_professional: string | null;
          mandate_relational: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          active?: boolean;
          body: string;
          created_at?: string;
          id?: never;
          mandate_environmental?: string | null;
          mandate_family?: string | null;
          mandate_financial?: string | null;
          mandate_physical?: string | null;
          mandate_professional?: string | null;
          mandate_relational?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          body?: string;
          created_at?: string;
          id?: never;
          mandate_environmental?: string | null;
          mandate_family?: string | null;
          mandate_financial?: string | null;
          mandate_physical?: string | null;
          mandate_professional?: string | null;
          mandate_relational?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "visions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      drift_events: {
        Row: {
          created_at: string;
          dimension_id: number;
          evidence: Json;
          id: number;
          local_date: string;
          responded_at: string | null;
          responded_with: Database["public"]["Enums"]["drift_response"] | null;
          shown_at: string;
          trigger: Database["public"]["Enums"]["drift_trigger"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          dimension_id: number;
          evidence?: Json;
          id?: never;
          local_date: string;
          responded_at?: string | null;
          responded_with?: Database["public"]["Enums"]["drift_response"] | null;
          shown_at?: string;
          trigger: Database["public"]["Enums"]["drift_trigger"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          dimension_id?: number;
          evidence?: Json;
          id?: never;
          local_date?: string;
          responded_at?: string | null;
          responded_with?: Database["public"]["Enums"]["drift_response"] | null;
          shown_at?: string;
          trigger?: Database["public"]["Enums"]["drift_trigger"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "drift_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "drift_events_dimension_id_fkey";
            columns: ["dimension_id"];
            isOneToOne: false;
            referencedRelation: "dimensions";
            referencedColumns: ["id"];
          },
        ];
      };
      goal_priority_scores: {
        Row: {
          compound_benefit: number;
          created_at: string;
          goal_id: number;
          leverage: number;
          opportunity_cost: number;
          scored_on: string;
          updated_at: string;
          user_id: string;
          vision_alignment: number;
        };
        Insert: {
          compound_benefit: number;
          created_at?: string;
          goal_id: number;
          leverage: number;
          opportunity_cost: number;
          scored_on: string;
          updated_at?: string;
          user_id: string;
          vision_alignment: number;
        };
        Update: {
          compound_benefit?: number;
          created_at?: string;
          goal_id?: number;
          leverage?: number;
          opportunity_cost?: number;
          scored_on?: string;
          updated_at?: string;
          user_id?: string;
          vision_alignment?: number;
        };
        Relationships: [
          {
            foreignKeyName: "goal_priority_scores_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_priority_scores_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
        ];
      };
      goal_relationships: {
        Row: {
          created_at: string;
          goal_a_id: number;
          goal_b_id: number;
          id: number;
          note: string | null;
          relationship: Database["public"]["Enums"]["goal_relationship"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          goal_a_id: number;
          goal_b_id: number;
          id?: never;
          note?: string | null;
          relationship: Database["public"]["Enums"]["goal_relationship"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          goal_a_id?: number;
          goal_b_id?: number;
          id?: never;
          note?: string | null;
          relationship?: Database["public"]["Enums"]["goal_relationship"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_relationships_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_relationships_goal_a_id_fkey";
            columns: ["goal_a_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_relationships_goal_b_id_fkey";
            columns: ["goal_b_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
        ];
      };
      screen_time_extractions: {
        Row: {
          confidence: number | null;
          confirmed_at: string | null;
          created_at: string;
          id: number;
          item_type: string;
          label: string | null;
          minutes: number | null;
          needs_input: boolean;
          source_snippet: string | null;
          status: string;
          upload_id: number;
          user_id: string;
        };
        Insert: {
          confidence?: number | null;
          confirmed_at?: string | null;
          created_at?: string;
          id?: never;
          item_type: string;
          label?: string | null;
          minutes?: number | null;
          needs_input?: boolean;
          source_snippet?: string | null;
          status?: string;
          upload_id: number;
          user_id: string;
        };
        Update: {
          confidence?: number | null;
          confirmed_at?: string | null;
          created_at?: string;
          id?: never;
          item_type?: string;
          label?: string | null;
          minutes?: number | null;
          needs_input?: boolean;
          source_snippet?: string | null;
          status?: string;
          upload_id?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "screen_time_extractions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "screen_time_extractions_upload_id_fkey";
            columns: ["upload_id"];
            isOneToOne: false;
            referencedRelation: "screen_time_uploads";
            referencedColumns: ["id"];
          },
        ];
      };
      screen_time_uploads: {
        Row: {
          created_at: string;
          error_message: string | null;
          id: number;
          status: string;
          storage_path: string;
          updated_at: string;
          user_id: string;
          week_start_date: string;
        };
        Insert: {
          created_at?: string;
          error_message?: string | null;
          id?: never;
          status?: string;
          storage_path: string;
          updated_at?: string;
          user_id: string;
          week_start_date: string;
        };
        Update: {
          created_at?: string;
          error_message?: string | null;
          id?: never;
          status?: string;
          storage_path?: string;
          updated_at?: string;
          user_id?: string;
          week_start_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: "screen_time_uploads_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      screen_time_weeks: {
        Row: {
          breakdown: Json;
          confirmed_at: string;
          created_at: string;
          daily_average_minutes: number;
          id: number;
          user_id: string;
          week_start_date: string;
        };
        Insert: {
          breakdown?: Json;
          confirmed_at?: string;
          created_at?: string;
          daily_average_minutes: number;
          id?: never;
          user_id: string;
          week_start_date: string;
        };
        Update: {
          breakdown?: Json;
          confirmed_at?: string;
          created_at?: string;
          daily_average_minutes?: number;
          id?: never;
          user_id?: string;
          week_start_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: "screen_time_weeks_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      delete_user_vault_secrets: {
        Args: { p_user_id: string };
        Returns: number;
      };
      disconnect_brightspace_feed: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
      disconnect_oauth_connection: {
        Args: { p_provider: string; p_user_id: string };
        Returns: boolean;
      };
      get_brightspace_feed_url: { Args: { p_user_id: string }; Returns: string };
      get_oauth_token: {
        Args: { p_provider: string; p_user_id: string };
        Returns: string;
      };
      list_user_scoped_tables: { Args: never; Returns: string[] };
      local_date: { Args: { ts: string; tz: string }; Returns: string };
      store_brightspace_feed_url: {
        Args: { p_ics_url: string; p_user_id: string };
        Returns: number;
      };
      store_oauth_token: {
        Args: {
          p_expires_at?: string;
          p_provider: string;
          p_scope?: string;
          p_token: string;
          p_user_id: string;
        };
        Returns: number;
      };
      submit_learn_review: {
        Args: {
          p_ai_feedback?: string;
          p_answered_text?: string;
          p_card_id: number;
          p_elapsed_ms?: number;
          p_local_date: string;
          p_next_state: Json;
          p_rating: Database["public"]["Enums"]["fsrs_rating"];
          p_reviewed_at: string;
          p_session_id?: number;
        };
        Returns: Database["public"]["Tables"]["lesson_reviews"]["Row"];
      };
    };
    Enums: {
      card_type: "goal" | "motivation" | "thought_habit" | "trait" | "tenx" | "enemy";
      drift_response: "started_hour" | "crowned_tomorrow" | "dismissed";
      drift_trigger:
        | "distracted_hour"
        | "abandoned_hour"
        | "dimension_dormant"
        | "mit_recrowned"
        | "day_under_baseline";
      goal_relationship: "competing" | "neutral" | "synergistic";
      evidence_kind:
        | "session"
        | "habit_log"
        | "prayer"
        | "quran_session"
        | "workout_set"
        | "body_metric"
        | "lesson_review"
        | "milestone"
        | "experiment";
      evidence_strength: "author_anecdote" | "single_study" | "strong_research";
      fsrs_card_state: "new" | "learning" | "review" | "relearning";
      fsrs_rating: "again" | "hard" | "good" | "easy";
      ingest_step:
        | "queued"
        | "extracting_text"
        | "parsing_structure"
        | "chunking"
        | "embedding"
        | "extracting_lessons"
        | "merging"
        | "generating_cards"
        | "done"
        | "failed";
      lesson_prompt_type: "free_recall" | "application" | "cloze" | "why";
      lesson_status: "provisional" | "active" | "archived";
      mom_outcome: "hit" | "partial" | "missed" | "changed";
      muscle_group:
        | "chest"
        | "back_lats"
        | "back_mid"
        | "front_delt"
        | "side_delt"
        | "rear_delt"
        | "biceps"
        | "triceps"
        | "quads"
        | "hamstrings"
        | "glutes"
        | "calves"
        | "core";
      source_kind: "pdf" | "epub" | "article" | "video" | "course";
      source_status: "uploaded" | "processing" | "partial" | "ready" | "failed";
      work_target_status: "active" | "blocked" | "done" | "dropped";
      commitment_level:
        | "l0_reminder"
        | "l1_stronger_notification"
        | "l2_distraction_block"
        | "l3_accountability_partner"
        | "l4_consequence";
      confidence_level: "high" | "moderate" | "low" | "insufficient";
      deliverable_type:
        | "paper"
        | "report"
        | "problem_set"
        | "exam"
        | "project"
        | "reading"
        | "quiz"
        | "post"
        | "admin";
      distraction_cause:
        "phone" | "got_hard" | "finished_early" | "notification" | "reflex" | "bored";
      friction_cause:
        | "underestimated_duration"
        | "unclear_next_action"
        | "distracted"
        | "tired"
        | "schedule_changed"
        | "avoided_task"
        | "higher_priority_appeared"
        | "other";
      adhkar_period: "morning" | "evening";
      insight_confidence_level: "high" | "medium" | "testing";
      life_domain: "deen" | "business" | "school" | "fitness" | "work";
      prayer_name: "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";
      prayer_status: "on_time" | "qada" | "missed";
      reflection_intensity: "light" | "moderate" | "heavy";
      risk_band: "low" | "moderate" | "high" | "critical";
      sunnah_slot: "before" | "after";
      session_type: "deep_work" | "deep_study" | "learn" | "anti_worry" | "exam_prep";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      card_type: ["goal", "motivation", "thought_habit", "trait", "tenx"],
      commitment_level: [
        "l0_reminder",
        "l1_stronger_notification",
        "l2_distraction_block",
        "l3_accountability_partner",
        "l4_consequence",
      ],
      confidence_level: ["high", "moderate", "low", "insufficient"],
      deliverable_type: [
        "paper",
        "report",
        "problem_set",
        "exam",
        "project",
        "reading",
        "quiz",
        "post",
        "admin",
      ],
      distraction_cause: ["phone", "got_hard", "finished_early", "notification", "reflex", "bored"],
      friction_cause: [
        "underestimated_duration",
        "unclear_next_action",
        "distracted",
        "tired",
        "schedule_changed",
        "avoided_task",
        "higher_priority_appeared",
        "other",
      ],
      insight_confidence_level: ["high", "medium", "testing"],
      risk_band: ["low", "moderate", "high", "critical"],
    },
  },
} as const;
