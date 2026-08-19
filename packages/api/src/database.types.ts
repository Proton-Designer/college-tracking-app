export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      agent_reports: {
        Row: {
          created_at: string
          id: number
          local_date: string
          model: string
          payload: Json
          report_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          local_date: string
          model: string
          payload: Json
          report_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: never
          local_date?: string
          model?: string
          payload?: Json
          report_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_usage: {
        Row: {
          app_name: string
          category: string | null
          created_at: string
          id: number
          local_date: string
          minutes: number
          source: string
          user_id: string
        }
        Insert: {
          app_name: string
          category?: string | null
          created_at?: string
          id?: never
          local_date: string
          minutes: number
          source?: string
          user_id: string
        }
        Update: {
          app_name?: string
          category?: string | null
          created_at?: string
          id?: never
          local_date?: string
          minutes?: number
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      backplan_milestones: {
        Row: {
          backplan_id: number
          completed: boolean
          id: number
          milestone_date: string
          minutes: number
          phase: string
          user_id: string
        }
        Insert: {
          backplan_id: number
          completed?: boolean
          id?: never
          milestone_date: string
          minutes: number
          phase: string
          user_id: string
        }
        Update: {
          backplan_id?: number
          completed?: boolean
          id?: never
          milestone_date?: string
          minutes?: number
          phase?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "backplan_milestones_backplan_id_fkey"
            columns: ["backplan_id"]
            isOneToOne: false
            referencedRelation: "deliverable_backplans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backplan_milestones_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brightspace_feeds: {
        Row: {
          created_at: string
          id: number
          last_synced_at: string | null
          user_id: string
          vault_secret_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          last_synced_at?: string | null
          user_id: string
          vault_secret_id: string
        }
        Update: {
          created_at?: string
          id?: never
          last_synced_at?: string | null
          user_id?: string
          vault_secret_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brightspace_feeds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          course_id: number | null
          created_at: string
          end_at: string
          external_id: string | null
          id: number
          is_busy: boolean
          is_class_meeting: boolean
          source: string
          start_at: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          course_id?: number | null
          created_at?: string
          end_at: string
          external_id?: string | null
          id?: never
          is_busy?: boolean
          is_class_meeting?: boolean
          source?: string
          start_at: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          course_id?: number | null
          created_at?: string
          end_at?: string
          external_id?: string | null
          id?: never
          is_busy?: boolean
          is_class_meeting?: boolean
          source?: string
          start_at?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      commitment_escalation_events: {
        Row: {
          from_level: Database["public"]["Enums"]["commitment_level"]
          id: number
          kill_habit_id: number
          occurred_at: string
          reason: string | null
          to_level: Database["public"]["Enums"]["commitment_level"]
          user_id: string
        }
        Insert: {
          from_level: Database["public"]["Enums"]["commitment_level"]
          id?: never
          kill_habit_id: number
          occurred_at?: string
          reason?: string | null
          to_level: Database["public"]["Enums"]["commitment_level"]
          user_id: string
        }
        Update: {
          from_level?: Database["public"]["Enums"]["commitment_level"]
          id?: never
          kill_habit_id?: number
          occurred_at?: string
          reason?: string | null
          to_level?: Database["public"]["Enums"]["commitment_level"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commitment_escalation_events_kill_habit_id_fkey"
            columns: ["kill_habit_id"]
            isOneToOne: false
            referencedRelation: "kill_habits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitment_escalation_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      course_meetings: {
        Row: {
          course_id: number
          day_of_week: number
          end_time: string
          id: number
          location: string | null
          start_time: string
          user_id: string
        }
        Insert: {
          course_id: number
          day_of_week: number
          end_time: string
          id?: never
          location?: string | null
          start_time: string
          user_id: string
        }
        Update: {
          course_id?: number
          day_of_week?: number
          end_time?: string
          id?: never
          location?: string | null
          start_time?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_meetings_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_meetings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      course_office_hours: {
        Row: {
          course_id: number
          day_of_week: number
          end_time: string
          id: number
          location: string | null
          start_time: string
          user_id: string
        }
        Insert: {
          course_id: number
          day_of_week: number
          end_time: string
          id?: never
          location?: string | null
          start_time: string
          user_id: string
        }
        Update: {
          course_id?: number
          day_of_week?: number
          end_time?: string
          id?: never
          location?: string | null
          start_time?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_office_hours_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_office_hours_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          allowed_absences: number | null
          attendance_policy: string | null
          code: string
          color: string | null
          confidence_rating: number | null
          created_at: string
          difficulty_rating: number | null
          id: number
          late_policy: string | null
          name: string
          professor_contact: string | null
          professor_name: string | null
          target_grade_pct: number | null
          term: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed_absences?: number | null
          attendance_policy?: string | null
          code: string
          color?: string | null
          confidence_rating?: number | null
          created_at?: string
          difficulty_rating?: number | null
          id?: never
          late_policy?: string | null
          name: string
          professor_contact?: string | null
          professor_name?: string | null
          target_grade_pct?: number | null
          term: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed_absences?: number | null
          attendance_policy?: string | null
          code?: string
          color?: string | null
          confidence_rating?: number | null
          created_at?: string
          difficulty_rating?: number | null
          id?: never
          late_policy?: string | null
          name?: string
          professor_contact?: string | null
          professor_name?: string | null
          target_grade_pct?: number | null
          term?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_checkins: {
        Row: {
          capacity_minutes: number | null
          created_at: string
          derailment_reason: string | null
          energy: number
          floor_minutes: number | null
          id: number
          local_date: string
          mood: number
          recovery_mode_total: number | null
          recovery_mode_triggered: boolean
          submitted_at: string
          target_minutes: number | null
          user_id: string
        }
        Insert: {
          capacity_minutes?: number | null
          created_at?: string
          derailment_reason?: string | null
          energy: number
          floor_minutes?: number | null
          id?: never
          local_date: string
          mood: number
          recovery_mode_total?: number | null
          recovery_mode_triggered?: boolean
          submitted_at?: string
          target_minutes?: number | null
          user_id: string
        }
        Update: {
          capacity_minutes?: number | null
          created_at?: string
          derailment_reason?: string | null
          energy?: number
          floor_minutes?: number | null
          id?: never
          local_date?: string
          mood?: number
          recovery_mode_total?: number | null
          recovery_mode_triggered?: boolean
          submitted_at?: string
          target_minutes?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_predictions: {
        Row: {
          actual_completion_pct: number | null
          created_at: string
          expected_energy_tonight: number | null
          hardest_task_id: number | null
          id: number
          likely_failure_mode: string | null
          local_date: string
          predicted_completion_pct: number
          scored_at: string | null
          user_id: string
        }
        Insert: {
          actual_completion_pct?: number | null
          created_at?: string
          expected_energy_tonight?: number | null
          hardest_task_id?: number | null
          id?: never
          likely_failure_mode?: string | null
          local_date: string
          predicted_completion_pct: number
          scored_at?: string | null
          user_id: string
        }
        Update: {
          actual_completion_pct?: number | null
          created_at?: string
          expected_energy_tonight?: number | null
          hardest_task_id?: number | null
          id?: never
          likely_failure_mode?: string | null
          local_date?: string
          predicted_completion_pct?: number
          scored_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_predictions_hardest_task_id_fkey"
            columns: ["hardest_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_predictions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_reviews: {
        Row: {
          created_at: string
          deep_work_actual_min: number | null
          deep_work_planned_min: number | null
          distracting_time_min: number | null
          id: number
          important_note_text: string | null
          kill_list_success_count: number | null
          kill_list_total: number | null
          local_date: string
          mits_completed: number
          mits_planned: number
          proud_text: string | null
          screen_time_min: number | null
          submitted_at: string
          user_id: string
          went_wrong_text: string | null
          workout_completed: boolean | null
        }
        Insert: {
          created_at?: string
          deep_work_actual_min?: number | null
          deep_work_planned_min?: number | null
          distracting_time_min?: number | null
          id?: never
          important_note_text?: string | null
          kill_list_success_count?: number | null
          kill_list_total?: number | null
          local_date: string
          mits_completed?: number
          mits_planned?: number
          proud_text?: string | null
          screen_time_min?: number | null
          submitted_at?: string
          user_id: string
          went_wrong_text?: string | null
          workout_completed?: boolean | null
        }
        Update: {
          created_at?: string
          deep_work_actual_min?: number | null
          deep_work_planned_min?: number | null
          distracting_time_min?: number | null
          id?: never
          important_note_text?: string | null
          kill_list_success_count?: number | null
          kill_list_total?: number | null
          local_date?: string
          mits_completed?: number
          mits_planned?: number
          proud_text?: string | null
          screen_time_min?: number | null
          submitted_at?: string
          user_id?: string
          went_wrong_text?: string | null
          workout_completed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_summaries: {
        Row: {
          created_at: string
          id: number
          local_date: string
          summary: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          local_date: string
          summary: Json
          user_id: string
        }
        Update: {
          created_at?: string
          id?: never
          local_date?: string
          summary?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_summaries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_journal: {
        Row: {
          actual_outcome: string | null
          created_at: string
          decision: string
          id: number
          local_date: string
          occurred_at: string
          predicted_outcome: string | null
          prediction_pct: number | null
          rationale: string | null
          scored_at: string | null
          user_id: string
        }
        Insert: {
          actual_outcome?: string | null
          created_at?: string
          decision: string
          id?: never
          local_date: string
          occurred_at?: string
          predicted_outcome?: string | null
          prediction_pct?: number | null
          rationale?: string | null
          scored_at?: string | null
          user_id: string
        }
        Update: {
          actual_outcome?: string | null
          created_at?: string
          decision?: string
          id?: never
          local_date?: string
          occurred_at?: string
          predicted_outcome?: string | null
          prediction_pct?: number | null
          rationale?: string | null
          scored_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_journal_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deliverable_backplans: {
        Row: {
          compressed: boolean
          deliverable_id: number
          dropped_phases: string[]
          generated_at: string
          id: number
          infeasible: boolean
          shortfall_minutes: number
          target_completion_date: string
          user_id: string
        }
        Insert: {
          compressed?: boolean
          deliverable_id: number
          dropped_phases?: string[]
          generated_at?: string
          id?: never
          infeasible?: boolean
          shortfall_minutes?: number
          target_completion_date: string
          user_id: string
        }
        Update: {
          compressed?: boolean
          deliverable_id?: number
          dropped_phases?: string[]
          generated_at?: string
          id?: never
          infeasible?: boolean
          shortfall_minutes?: number
          target_completion_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliverable_backplans_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: false
            referencedRelation: "deliverables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverable_backplans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deliverables: {
        Row: {
          course_id: number
          created_at: string
          due_at: string
          estimated_minutes: number | null
          grade_item_id: number | null
          id: number
          local_due_date: string
          status: string
          title: string
          type: Database["public"]["Enums"]["deliverable_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          course_id: number
          created_at?: string
          due_at: string
          estimated_minutes?: number | null
          grade_item_id?: number | null
          id?: never
          local_due_date: string
          status?: string
          title: string
          type: Database["public"]["Enums"]["deliverable_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          course_id?: number
          created_at?: string
          due_at?: string
          estimated_minutes?: number | null
          grade_item_id?: number | null
          id?: never
          local_due_date?: string
          status?: string
          title?: string
          type?: Database["public"]["Enums"]["deliverable_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliverables_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverables_grade_item_id_fkey"
            columns: ["grade_item_id"]
            isOneToOne: false
            referencedRelation: "grade_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverables_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_measurements: {
        Row: {
          created_at: string
          experiment_id: number
          id: number
          local_date: string
          metric: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          experiment_id: number
          id?: never
          local_date: string
          metric: string
          user_id: string
          value: number
        }
        Update: {
          created_at?: string
          experiment_id?: number
          id?: never
          local_date?: string
          metric?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "experiment_measurements_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiment_measurements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      experiments: {
        Row: {
          baseline_value: number | null
          created_at: string
          end_date: string | null
          hypothesis: string
          hypothesized_direction: string | null
          id: number
          insight_id: number | null
          outcome_summary: string | null
          protocol: string | null
          start_date: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          baseline_value?: number | null
          created_at?: string
          end_date?: string | null
          hypothesis: string
          hypothesized_direction?: string | null
          id?: never
          insight_id?: number | null
          outcome_summary?: string | null
          protocol?: string | null
          start_date: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          baseline_value?: number | null
          created_at?: string
          end_date?: string | null
          hypothesis?: string
          hypothesized_direction?: string | null
          id?: never
          insight_id?: number | null
          outcome_summary?: string | null
          protocol?: string | null
          start_date?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiments_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friction_logs: {
        Row: {
          cause: Database["public"]["Enums"]["friction_cause"]
          cause_detail: string | null
          created_at: string
          id: number
          local_date: string
          occurred_at: string
          related_task_id: number | null
          user_id: string
        }
        Insert: {
          cause: Database["public"]["Enums"]["friction_cause"]
          cause_detail?: string | null
          created_at?: string
          id?: never
          local_date: string
          occurred_at?: string
          related_task_id?: number | null
          user_id: string
        }
        Update: {
          cause?: Database["public"]["Enums"]["friction_cause"]
          cause_detail?: string | null
          created_at?: string
          id?: never
          local_date?: string
          occurred_at?: string
          related_task_id?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "friction_logs_related_task_id_fkey"
            columns: ["related_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friction_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_boundaries: {
        Row: {
          course_id: number
          id: number
          letter: string
          min_pct: number
          user_id: string
        }
        Insert: {
          course_id: number
          id?: never
          letter: string
          min_pct: number
          user_id: string
        }
        Update: {
          course_id?: number
          id?: never
          letter?: string
          min_pct?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grade_boundaries_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_boundaries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_categories: {
        Row: {
          course_id: number
          created_at: string
          drop_lowest_n: number
          expected_item_count: number
          id: number
          name: string
          updated_at: string
          user_id: string
          weight_pct: number
        }
        Insert: {
          course_id: number
          created_at?: string
          drop_lowest_n?: number
          expected_item_count?: number
          id?: never
          name: string
          updated_at?: string
          user_id: string
          weight_pct: number
        }
        Update: {
          course_id?: number
          created_at?: string
          drop_lowest_n?: number
          expected_item_count?: number
          id?: never
          name?: string
          updated_at?: string
          user_id?: string
          weight_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "grade_categories_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_categories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_items: {
        Row: {
          category_id: number
          course_id: number
          created_at: string
          id: number
          is_excused: boolean
          name: string
          points_earned: number | null
          points_possible: number
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id: number
          course_id: number
          created_at?: string
          id?: never
          is_excused?: boolean
          name: string
          points_earned?: number | null
          points_possible: number
          updated_at?: string
          user_id: string
        }
        Update: {
          category_id?: number
          course_id?: number
          created_at?: string
          id?: never
          is_excused?: boolean
          name?: string
          points_earned?: number | null
          points_possible?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grade_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "grade_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_items_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_snapshots: {
        Row: {
          assumption_used: string | null
          category_results: Json
          course_id: number
          created_at: string
          current_grade: number | null
          id: number
          projected_grade: number | null
          snapshot_date: string
          user_id: string
        }
        Insert: {
          assumption_used?: string | null
          category_results: Json
          course_id: number
          created_at?: string
          current_grade?: number | null
          id?: never
          projected_grade?: number | null
          snapshot_date: string
          user_id: string
        }
        Update: {
          assumption_used?: string | null
          category_results?: Json
          course_id?: number
          created_at?: string
          current_grade?: number | null
          id?: never
          projected_grade?: number | null
          snapshot_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grade_snapshots_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      health_daily: {
        Row: {
          created_at: string
          hrv_ms: number | null
          id: number
          local_date: string
          resting_hr: number | null
          sleep_hours: number | null
          source: string
          strain: number | null
          user_id: string
          whoop_recovery_pct: number | null
          workout_completed: boolean | null
        }
        Insert: {
          created_at?: string
          hrv_ms?: number | null
          id?: never
          local_date: string
          resting_hr?: number | null
          sleep_hours?: number | null
          source?: string
          strain?: number | null
          user_id: string
          whoop_recovery_pct?: number | null
          workout_completed?: boolean | null
        }
        Update: {
          created_at?: string
          hrv_ms?: number | null
          id?: never
          local_date?: string
          resting_hr?: number | null
          sleep_hours?: number | null
          source?: string
          strain?: number | null
          user_id?: string
          whoop_recovery_pct?: number | null
          workout_completed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "health_daily_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ics_event_extractions: {
        Row: {
          confirmed_at: string | null
          course_id: number | null
          description: string | null
          end_at: string | null
          external_id: string
          feed_id: number
          id: number
          is_all_day: boolean
          location: string | null
          start_at: string
          status: string
          summary: string
          synced_at: string
          user_id: string
        }
        Insert: {
          confirmed_at?: string | null
          course_id?: number | null
          description?: string | null
          end_at?: string | null
          external_id: string
          feed_id: number
          id?: never
          is_all_day?: boolean
          location?: string | null
          start_at: string
          status?: string
          summary: string
          synced_at?: string
          user_id: string
        }
        Update: {
          confirmed_at?: string | null
          course_id?: number | null
          description?: string | null
          end_at?: string | null
          external_id?: string
          feed_id?: number
          id?: never
          is_all_day?: boolean
          location?: string | null
          start_at?: string
          status?: string
          summary?: string
          synced_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ics_event_extractions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ics_event_extractions_feed_id_fkey"
            columns: ["feed_id"]
            isOneToOne: false
            referencedRelation: "brightspace_feeds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ics_event_extractions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      insights: {
        Row: {
          claim: string
          confidence_claimed_by_model:
            | Database["public"]["Enums"]["insight_confidence_level"]
            | null
          confidence_stored: Database["public"]["Enums"]["insight_confidence_level"]
          created_at: string
          effect_size: number | null
          evidence: Json | null
          id: number
          sample_size: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          claim: string
          confidence_claimed_by_model?:
            | Database["public"]["Enums"]["insight_confidence_level"]
            | null
          confidence_stored: Database["public"]["Enums"]["insight_confidence_level"]
          created_at?: string
          effect_size?: number | null
          evidence?: Json | null
          id?: never
          sample_size: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          claim?: string
          confidence_claimed_by_model?:
            | Database["public"]["Enums"]["insight_confidence_level"]
            | null
          confidence_stored?: Database["public"]["Enums"]["insight_confidence_level"]
          created_at?: string
          effect_size?: number | null
          evidence?: Json | null
          id?: never
          sample_size?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "insights_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      interventions: {
        Row: {
          action_taken: string | null
          actions: string[]
          id: number
          kind: string
          local_date: string
          message: string
          occurred_at: string
          related_kill_habit_id: number | null
          related_task_id: number | null
          responded_at: string | null
          status: string
          trigger_reason: string
          user_id: string
        }
        Insert: {
          action_taken?: string | null
          actions: string[]
          id?: never
          kind: string
          local_date: string
          message: string
          occurred_at?: string
          related_kill_habit_id?: number | null
          related_task_id?: number | null
          responded_at?: string | null
          status?: string
          trigger_reason: string
          user_id: string
        }
        Update: {
          action_taken?: string | null
          actions?: string[]
          id?: never
          kind?: string
          local_date?: string
          message?: string
          occurred_at?: string
          related_kill_habit_id?: number | null
          related_task_id?: number | null
          responded_at?: string | null
          status?: string
          trigger_reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interventions_related_kill_habit_id_fkey"
            columns: ["related_kill_habit_id"]
            isOneToOne: false
            referencedRelation: "kill_habits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventions_related_task_id_fkey"
            columns: ["related_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          content: string
          created_at: string
          deleted_at: string | null
          entry_type: string
          id: number
          local_date: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          deleted_at?: string | null
          entry_type: string
          id?: never
          local_date: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          deleted_at?: string | null
          entry_type?: string
          id?: never
          local_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kill_events: {
        Row: {
          created_at: string
          duration_min: number | null
          id: number
          kill_habit_id: number
          local_date: string
          mood_before: number | null
          occurred_at: string
          outcome: string
          trigger_context: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_min?: number | null
          id?: never
          kill_habit_id: number
          local_date: string
          mood_before?: number | null
          occurred_at?: string
          outcome: string
          trigger_context?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          duration_min?: number | null
          id?: never
          kill_habit_id?: number
          local_date?: string
          mood_before?: number | null
          occurred_at?: string
          outcome?: string
          trigger_context?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kill_events_kill_habit_id_fkey"
            columns: ["kill_habit_id"]
            isOneToOne: false
            referencedRelation: "kill_habits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kill_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kill_habits: {
        Row: {
          active: boolean
          created_at: string
          escalation_level: Database["public"]["Enums"]["commitment_level"]
          id: number
          immediate_reward: string | null
          implementation_intention: string | null
          long_term_cost: string | null
          max_escalation_level: Database["public"]["Enums"]["commitment_level"]
          name: string
          replacement_behavior: string | null
          trigger_description: string | null
          updated_at: string
          urge_description: string | null
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          escalation_level?: Database["public"]["Enums"]["commitment_level"]
          id?: never
          immediate_reward?: string | null
          implementation_intention?: string | null
          long_term_cost?: string | null
          max_escalation_level?: Database["public"]["Enums"]["commitment_level"]
          name: string
          replacement_behavior?: string | null
          trigger_description?: string | null
          updated_at?: string
          urge_description?: string | null
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          escalation_level?: Database["public"]["Enums"]["commitment_level"]
          id?: never
          immediate_reward?: string | null
          implementation_intention?: string | null
          long_term_cost?: string | null
          max_escalation_level?: Database["public"]["Enums"]["commitment_level"]
          name?: string
          replacement_behavior?: string | null
          trigger_description?: string | null
          updated_at?: string
          urge_description?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kill_habits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_usage_log: {
        Row: {
          cache_read_tokens: number
          cache_write_tokens: number
          call_type: string
          content_hash: string | null
          cost_usd: number
          created_at: string
          id: number
          input_tokens: number
          latency_ms: number | null
          model: string
          output_tokens: number
          success: boolean
          user_id: string | null
        }
        Insert: {
          cache_read_tokens?: number
          cache_write_tokens?: number
          call_type: string
          content_hash?: string | null
          cost_usd: number
          created_at?: string
          id?: never
          input_tokens?: number
          latency_ms?: number | null
          model: string
          output_tokens?: number
          success: boolean
          user_id?: string | null
        }
        Update: {
          cache_read_tokens?: number
          cache_write_tokens?: number
          call_type?: string
          content_hash?: string | null
          cost_usd?: number
          created_at?: string
          id?: never
          input_tokens?: number
          latency_ms?: number | null
          model?: string
          output_tokens?: number
          success?: boolean
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "llm_usage_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_summaries: {
        Row: {
          created_at: string
          id: number
          month_start_date: string
          summary: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          month_start_date: string
          summary: Json
          user_id: string
        }
        Update: {
          created_at?: string
          id?: never
          month_start_date?: string
          summary?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_summaries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_connections: {
        Row: {
          connected_at: string
          created_at: string
          expires_at: string | null
          external_account_id: string | null
          id: number
          provider: string
          scope: string | null
          status: string
          updated_at: string
          user_id: string
          vault_secret_id: string
        }
        Insert: {
          connected_at?: string
          created_at?: string
          expires_at?: string | null
          external_account_id?: string | null
          id?: never
          provider: string
          scope?: string | null
          status?: string
          updated_at?: string
          user_id: string
          vault_secret_id: string
        }
        Update: {
          connected_at?: string
          created_at?: string
          expires_at?: string | null
          external_account_id?: string | null
          id?: never
          provider?: string
          scope?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          vault_secret_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          id: string
          llm_monthly_budget_usd: number
          sleep_baseline_hours: number | null
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          llm_monthly_budget_usd?: number
          sleep_baseline_hours?: number | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          llm_monthly_budget_usd?: number
          sleep_baseline_hours?: number | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      risk_snapshots: {
        Row: {
          band: Database["public"]["Enums"]["risk_band"]
          confidence: Database["public"]["Enums"]["confidence_level"]
          course_id: number | null
          created_at: string
          deliverable_id: number | null
          id: number
          scope: string
          score: number
          snapshot_date: string
          trace: Json
          user_id: string
        }
        Insert: {
          band: Database["public"]["Enums"]["risk_band"]
          confidence: Database["public"]["Enums"]["confidence_level"]
          course_id?: number | null
          created_at?: string
          deliverable_id?: number | null
          id?: never
          scope: string
          score: number
          snapshot_date: string
          trace: Json
          user_id: string
        }
        Update: {
          band?: Database["public"]["Enums"]["risk_band"]
          confidence?: Database["public"]["Enums"]["confidence_level"]
          course_id?: number | null
          created_at?: string
          deliverable_id?: number | null
          id?: never
          scope?: string
          score?: number
          snapshot_date?: string
          trace?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_snapshots_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_snapshots_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: false
            referencedRelation: "deliverables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      screen_daily: {
        Row: {
          created_at: string
          distracting_min: number | null
          id: number
          local_date: string
          productive_min: number | null
          source: string
          total_screen_min: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          distracting_min?: number | null
          id?: never
          local_date: string
          productive_min?: number | null
          source?: string
          total_screen_min?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          distracting_min?: number | null
          id?: never
          local_date?: string
          productive_min?: number | null
          source?: string
          total_screen_min?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "screen_daily_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      semester_lessons: {
        Row: {
          confidence: Database["public"]["Enums"]["insight_confidence_level"]
          created_at: string
          id: number
          lesson: string
          source_insight_id: number | null
          source_report_id: number | null
          term: string
          user_id: string
        }
        Insert: {
          confidence?: Database["public"]["Enums"]["insight_confidence_level"]
          created_at?: string
          id?: never
          lesson: string
          source_insight_id?: number | null
          source_report_id?: number | null
          term: string
          user_id: string
        }
        Update: {
          confidence?: Database["public"]["Enums"]["insight_confidence_level"]
          created_at?: string
          id?: never
          lesson?: string
          source_insight_id?: number | null
          source_report_id?: number | null
          term?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "semester_lessons_source_insight_id_fkey"
            columns: ["source_insight_id"]
            isOneToOne: false
            referencedRelation: "insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "semester_lessons_source_report_id_fkey"
            columns: ["source_report_id"]
            isOneToOne: false
            referencedRelation: "agent_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "semester_lessons_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      syllabus_extractions: {
        Row: {
          confirmed_at: string | null
          created_at: string
          extracted_payload: Json
          extraction_confidence: number
          id: number
          item_type: string
          source_snippet: string
          status: string
          upload_id: number
          user_id: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          extracted_payload: Json
          extraction_confidence: number
          id?: never
          item_type: string
          source_snippet: string
          status?: string
          upload_id: number
          user_id: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          extracted_payload?: Json
          extraction_confidence?: number
          id?: never
          item_type?: string
          source_snippet?: string
          status?: string
          upload_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "syllabus_extractions_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "syllabus_uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "syllabus_extractions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      syllabus_uploads: {
        Row: {
          course_id: number | null
          extraction_status: string
          failure_reason: string | null
          file_name: string
          id: number
          storage_path: string
          uploaded_at: string
          user_id: string
        }
        Insert: {
          course_id?: number | null
          extraction_status?: string
          failure_reason?: string | null
          file_name: string
          id?: never
          storage_path: string
          uploaded_at?: string
          user_id: string
        }
        Update: {
          course_id?: number | null
          extraction_status?: string
          failure_reason?: string | null
          file_name?: string
          id?: never
          storage_path?: string
          uploaded_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "syllabus_uploads_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "syllabus_uploads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_sessions: {
        Row: {
          actual_duration_min: number | null
          actual_start: string | null
          created_at: string
          id: number
          interruptions: number
          location: string | null
          objective_output: string | null
          phone_usage_min: number | null
          planned_duration_min: number
          planned_start: string
          status: string
          subjective_focus: number | null
          target_achieved: string | null
          task_id: number
          user_id: string
        }
        Insert: {
          actual_duration_min?: number | null
          actual_start?: string | null
          created_at?: string
          id?: never
          interruptions?: number
          location?: string | null
          objective_output?: string | null
          phone_usage_min?: number | null
          planned_duration_min: number
          planned_start: string
          status?: string
          subjective_focus?: number | null
          target_achieved?: string | null
          task_id: number
          user_id: string
        }
        Update: {
          actual_duration_min?: number | null
          actual_start?: string | null
          created_at?: string
          id?: never
          interruptions?: number
          location?: string | null
          objective_output?: string | null
          phone_usage_min?: number | null
          planned_duration_min?: number
          planned_start?: string
          status?: string
          subjective_focus?: number | null
          target_achieved?: string | null
          task_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_sessions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          actual_minutes: number | null
          category: string
          completed_at: string | null
          course_id: number | null
          created_at: string
          deliverable_id: number | null
          estimated_minutes: number | null
          id: number
          mit_rank: number | null
          planned_date: string
          planned_location: string | null
          planned_start_at: string | null
          proof_of_work_content: string | null
          proof_of_work_type: string | null
          requires_proof_of_work: boolean
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_minutes?: number | null
          category: string
          completed_at?: string | null
          course_id?: number | null
          created_at?: string
          deliverable_id?: number | null
          estimated_minutes?: number | null
          id?: never
          mit_rank?: number | null
          planned_date: string
          planned_location?: string | null
          planned_start_at?: string | null
          proof_of_work_content?: string | null
          proof_of_work_type?: string | null
          requires_proof_of_work?: boolean
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          actual_minutes?: number | null
          category?: string
          completed_at?: string | null
          course_id?: number | null
          created_at?: string
          deliverable_id?: number | null
          estimated_minutes?: number | null
          id?: never
          mit_rank?: number | null
          planned_date?: string
          planned_location?: string | null
          planned_start_at?: string | null
          proof_of_work_content?: string | null
          proof_of_work_type?: string | null
          requires_proof_of_work?: boolean
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: false
            referencedRelation: "deliverables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      telemetry_events: {
        Row: {
          created_at: string
          external_id: string | null
          id: number
          local_date: string
          metric: string
          occurred_at: string
          source: string
          type: string
          unit: string | null
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          external_id?: string | null
          id?: never
          local_date: string
          metric: string
          occurred_at?: string
          source: string
          type: string
          unit?: string | null
          user_id: string
          value: number
        }
        Update: {
          created_at?: string
          external_id?: string | null
          id?: never
          local_date?: string
          metric?: string
          occurred_at?: string
          source?: string
          type?: string
          unit?: string | null
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "telemetry_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_plan_blocks: {
        Row: {
          block_date: string
          course_id: number | null
          deliverable_id: number | null
          end_at: string
          id: number
          minutes: number
          start_at: string
          status: string
          user_id: string
          weekly_plan_id: number
        }
        Insert: {
          block_date: string
          course_id?: number | null
          deliverable_id?: number | null
          end_at: string
          id?: never
          minutes: number
          start_at: string
          status?: string
          user_id: string
          weekly_plan_id: number
        }
        Update: {
          block_date?: string
          course_id?: number | null
          deliverable_id?: number | null
          end_at?: string
          id?: never
          minutes?: number
          start_at?: string
          status?: string
          user_id?: string
          weekly_plan_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_plan_blocks_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_plan_blocks_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: false
            referencedRelation: "deliverables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_plan_blocks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_plan_blocks_weekly_plan_id_fkey"
            columns: ["weekly_plan_id"]
            isOneToOne: false
            referencedRelation: "weekly_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_plan_unplaced: {
        Row: {
          course_id: number | null
          deliverable_id: number | null
          id: number
          minutes_needed: number
          minutes_placed: number
          minutes_shortfall: number
          reason: string
          user_id: string
          weekly_plan_id: number
        }
        Insert: {
          course_id?: number | null
          deliverable_id?: number | null
          id?: never
          minutes_needed: number
          minutes_placed: number
          minutes_shortfall: number
          reason: string
          user_id: string
          weekly_plan_id: number
        }
        Update: {
          course_id?: number | null
          deliverable_id?: number | null
          id?: never
          minutes_needed?: number
          minutes_placed?: number
          minutes_shortfall?: number
          reason?: string
          user_id?: string
          weekly_plan_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_plan_unplaced_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_plan_unplaced_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: false
            referencedRelation: "deliverables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_plan_unplaced_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_plan_unplaced_weekly_plan_id_fkey"
            columns: ["weekly_plan_id"]
            isOneToOne: false
            referencedRelation: "weekly_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_plans: {
        Row: {
          academic_load: string
          generated_at: string
          has_unplaced_work: boolean
          id: number
          total_capacity_minutes: number
          total_needed_minutes: number
          user_id: string
          week_start_date: string
        }
        Insert: {
          academic_load: string
          generated_at?: string
          has_unplaced_work?: boolean
          id?: never
          total_capacity_minutes: number
          total_needed_minutes: number
          user_id: string
          week_start_date: string
        }
        Update: {
          academic_load?: string
          generated_at?: string
          has_unplaced_work?: boolean
          id?: never
          total_capacity_minutes?: number
          total_needed_minutes?: number
          user_id?: string
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_summaries: {
        Row: {
          created_at: string
          id: number
          summary: Json
          user_id: string
          week_start_date: string
        }
        Insert: {
          created_at?: string
          id?: never
          summary: Json
          user_id: string
          week_start_date: string
        }
        Update: {
          created_at?: string
          id?: never
          summary?: Json
          user_id?: string
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_summaries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_user_vault_secrets: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_brightspace_feed_url: { Args: { p_user_id: string }; Returns: string }
      get_oauth_token: {
        Args: { p_provider: string; p_user_id: string }
        Returns: string
      }
      list_user_scoped_tables: { Args: never; Returns: string[] }
      local_date: { Args: { ts: string; tz: string }; Returns: string }
      store_brightspace_feed_url: {
        Args: { p_ics_url: string; p_user_id: string }
        Returns: number
      }
      store_oauth_token: {
        Args: {
          p_expires_at?: string
          p_provider: string
          p_scope?: string
          p_token: string
          p_user_id: string
        }
        Returns: number
      }
    }
    Enums: {
      commitment_level:
        | "l0_reminder"
        | "l1_stronger_notification"
        | "l2_distraction_block"
        | "l3_accountability_partner"
        | "l4_consequence"
      confidence_level: "high" | "moderate" | "low" | "insufficient"
      deliverable_type:
        | "paper"
        | "report"
        | "problem_set"
        | "exam"
        | "project"
        | "reading"
      friction_cause:
        | "underestimated_duration"
        | "unclear_next_action"
        | "distracted"
        | "tired"
        | "schedule_changed"
        | "avoided_task"
        | "higher_priority_appeared"
        | "other"
      insight_confidence_level: "high" | "medium" | "testing"
      risk_band: "low" | "moderate" | "high" | "critical"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
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
      ],
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
} as const

