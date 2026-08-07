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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          actor_name: string | null
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          tenant_id: string
        }
        Insert: {
          action: string
          actor_name?: string | null
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          tenant_id: string
        }
        Update: {
          action?: string
          actor_name?: string | null
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          completed_at: string | null
          context: Json
          created_at: string
          current_node_id: string | null
          customer_id: string | null
          entity_id: string | null
          entity_type: string | null
          error_message: string | null
          failed_at: string | null
          id: string
          idempotency_key: string
          opportunity_id: string | null
          reservation_id: string | null
          started_at: string
          status: string
          tenant_id: string
          trigger_event_id: string | null
          updated_at: string
          workflow_id: string
          workflow_version_id: string
        }
        Insert: {
          completed_at?: string | null
          context?: Json
          created_at?: string
          current_node_id?: string | null
          customer_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          idempotency_key: string
          opportunity_id?: string | null
          reservation_id?: string | null
          started_at?: string
          status?: string
          tenant_id: string
          trigger_event_id?: string | null
          updated_at?: string
          workflow_id: string
          workflow_version_id: string
        }
        Update: {
          completed_at?: string | null
          context?: Json
          created_at?: string
          current_node_id?: string | null
          customer_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          idempotency_key?: string
          opportunity_id?: string | null
          reservation_id?: string | null
          started_at?: string
          status?: string
          tenant_id?: string
          trigger_event_id?: string | null
          updated_at?: string
          workflow_id?: string
          workflow_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "automation_workflows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_workflow_version_id_fkey"
            columns: ["workflow_version_id"]
            isOneToOne: false
            referencedRelation: "automation_workflow_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_step_runs: {
        Row: {
          action_type: string
          attempt_count: number
          automation_run_id: string
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          idempotency_key: string
          input: Json | null
          max_attempts: number
          node_id: string
          output: Json | null
          scheduled_for: string | null
          started_at: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          action_type: string
          attempt_count?: number
          automation_run_id: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          idempotency_key: string
          input?: Json | null
          max_attempts?: number
          node_id: string
          output?: Json | null
          scheduled_for?: string | null
          started_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          attempt_count?: number
          automation_run_id?: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          idempotency_key?: string
          input?: Json | null
          max_attempts?: number
          node_id?: string
          output?: Json | null
          scheduled_for?: string | null
          started_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_step_runs_automation_run_id_fkey"
            columns: ["automation_run_id"]
            isOneToOne: false
            referencedRelation: "automation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_step_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_workflow_versions: {
        Row: {
          created_at: string
          definition: Json
          id: string
          published_at: string | null
          published_by: string | null
          tenant_id: string
          trigger_type: string
          version_number: number
          workflow_id: string
        }
        Insert: {
          created_at?: string
          definition: Json
          id?: string
          published_at?: string | null
          published_by?: string | null
          tenant_id: string
          trigger_type: string
          version_number: number
          workflow_id: string
        }
        Update: {
          created_at?: string
          definition?: Json
          id?: string
          published_at?: string | null
          published_by?: string | null
          tenant_id?: string
          trigger_type?: string
          version_number?: number
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_workflow_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_workflow_versions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "automation_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_workflows: {
        Row: {
          active_version: number | null
          archived_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_template: boolean
          name: string
          published_at: string | null
          status: string
          tenant_id: string
          test_mode: boolean
          trigger_configuration: Json
          trigger_type: string
          updated_at: string
        }
        Insert: {
          active_version?: number | null
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_template?: boolean
          name: string
          published_at?: string | null
          status?: string
          tenant_id: string
          test_mode?: boolean
          trigger_configuration?: Json
          trigger_type: string
          updated_at?: string
        }
        Update: {
          active_version?: number | null
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_template?: boolean
          name?: string
          published_at?: string | null
          status?: string
          tenant_id?: string
          test_mode?: boolean
          trigger_configuration?: Json
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_workflows_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_access_tokens: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          reservation_id: string
          token_hash: string
          used_at: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          reservation_id: string
          token_hash: string
          used_at?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          reservation_id?: string
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_access_tokens_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          balance_due: number | null
          captain_id: string | null
          created_at: string | null
          customer_email: string
          customer_name: string
          customer_phone: string | null
          deposit_amount: number | null
          deposit_paid: boolean | null
          duration_hours: number | null
          end_time: string | null
          ghl_booking_id: string
          ghl_contact_id: string | null
          ghl_opportunity_id: string | null
          id: string
          rental_date: string
          start_time: string | null
          status: string | null
          tenant_id: string | null
          total_amount: number | null
          vessel_id: string | null
          vessel_name: string | null
        }
        Insert: {
          balance_due?: number | null
          captain_id?: string | null
          created_at?: string | null
          customer_email: string
          customer_name: string
          customer_phone?: string | null
          deposit_amount?: number | null
          deposit_paid?: boolean | null
          duration_hours?: number | null
          end_time?: string | null
          ghl_booking_id: string
          ghl_contact_id?: string | null
          ghl_opportunity_id?: string | null
          id?: string
          rental_date: string
          start_time?: string | null
          status?: string | null
          tenant_id?: string | null
          total_amount?: number | null
          vessel_id?: string | null
          vessel_name?: string | null
        }
        Update: {
          balance_due?: number | null
          captain_id?: string | null
          created_at?: string | null
          customer_email?: string
          customer_name?: string
          customer_phone?: string | null
          deposit_amount?: number | null
          deposit_paid?: boolean | null
          duration_hours?: number | null
          end_time?: string | null
          ghl_booking_id?: string
          ghl_contact_id?: string | null
          ghl_opportunity_id?: string | null
          id?: string
          rental_date?: string
          start_time?: string | null
          status?: string | null
          tenant_id?: string | null
          total_amount?: number | null
          vessel_id?: string | null
          vessel_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_captain_id_fkey"
            columns: ["captain_id"]
            isOneToOne: false
            referencedRelation: "captains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      captain_checklists: {
        Row: {
          all_waivers_signed: boolean | null
          balance_collected: boolean | null
          booking_id: string | null
          captain_id: string | null
          charter_ended_at: string | null
          charter_started_at: string | null
          contract_signed: boolean | null
          created_at: string | null
          fuel_checked: boolean | null
          id: string
          life_jackets_checked: boolean | null
          notes: string | null
          safety_briefing_done: boolean | null
          status: string | null
          tenant_id: string | null
          vessel_inspected: boolean | null
        }
        Insert: {
          all_waivers_signed?: boolean | null
          balance_collected?: boolean | null
          booking_id?: string | null
          captain_id?: string | null
          charter_ended_at?: string | null
          charter_started_at?: string | null
          contract_signed?: boolean | null
          created_at?: string | null
          fuel_checked?: boolean | null
          id?: string
          life_jackets_checked?: boolean | null
          notes?: string | null
          safety_briefing_done?: boolean | null
          status?: string | null
          tenant_id?: string | null
          vessel_inspected?: boolean | null
        }
        Update: {
          all_waivers_signed?: boolean | null
          balance_collected?: boolean | null
          booking_id?: string | null
          captain_id?: string | null
          charter_ended_at?: string | null
          charter_started_at?: string | null
          contract_signed?: boolean | null
          created_at?: string | null
          fuel_checked?: boolean | null
          id?: string
          life_jackets_checked?: boolean | null
          notes?: string | null
          safety_briefing_done?: boolean | null
          status?: string | null
          tenant_id?: string | null
          vessel_inspected?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "captain_checklists_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captain_checklists_captain_id_fkey"
            columns: ["captain_id"]
            isOneToOne: false
            referencedRelation: "captains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captain_checklists_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      captains: {
        Row: {
          active: boolean | null
          created_at: string | null
          email: string | null
          full_name: string
          id: string
          phone: string | null
          tenant_id: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          phone?: string | null
          tenant_id?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "captains_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_messages: {
        Row: {
          accepted_at: string | null
          bounced_at: string | null
          channel: string
          complained_at: string | null
          created_at: string
          customer_id: string | null
          delivered_at: string | null
          email_domain_id: string | null
          email_sender_id: string | null
          failed_at: string | null
          failure_code: string | null
          failure_reason: string | null
          from_email: string | null
          id: string
          idempotency_key: string
          integration_id: string | null
          last_provider_event_at: string | null
          metadata: Json
          opportunity_id: string | null
          provider: string
          provider_environment: string | null
          provider_event_count: number
          provider_message_id: string | null
          provider_ready: boolean | null
          provider_status: string | null
          queued_at: string
          recipient: string
          rendered_body: string
          rendered_subject: string | null
          reply_to_email: string | null
          reservation_id: string | null
          scheduled_for: string | null
          sender_name: string | null
          sent_at: string | null
          source: string
          status: string
          template_id: string | null
          tenant_id: string
          updated_at: string
          workflow_id: string | null
          workflow_run_id: string | null
          workflow_step_run_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          bounced_at?: string | null
          channel: string
          complained_at?: string | null
          created_at?: string
          customer_id?: string | null
          delivered_at?: string | null
          email_domain_id?: string | null
          email_sender_id?: string | null
          failed_at?: string | null
          failure_code?: string | null
          failure_reason?: string | null
          from_email?: string | null
          id?: string
          idempotency_key: string
          integration_id?: string | null
          last_provider_event_at?: string | null
          metadata?: Json
          opportunity_id?: string | null
          provider?: string
          provider_environment?: string | null
          provider_event_count?: number
          provider_message_id?: string | null
          provider_ready?: boolean | null
          provider_status?: string | null
          queued_at?: string
          recipient: string
          rendered_body: string
          rendered_subject?: string | null
          reply_to_email?: string | null
          reservation_id?: string | null
          scheduled_for?: string | null
          sender_name?: string | null
          sent_at?: string | null
          source?: string
          status?: string
          template_id?: string | null
          tenant_id: string
          updated_at?: string
          workflow_id?: string | null
          workflow_run_id?: string | null
          workflow_step_run_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          bounced_at?: string | null
          channel?: string
          complained_at?: string | null
          created_at?: string
          customer_id?: string | null
          delivered_at?: string | null
          email_domain_id?: string | null
          email_sender_id?: string | null
          failed_at?: string | null
          failure_code?: string | null
          failure_reason?: string | null
          from_email?: string | null
          id?: string
          idempotency_key?: string
          integration_id?: string | null
          last_provider_event_at?: string | null
          metadata?: Json
          opportunity_id?: string | null
          provider?: string
          provider_environment?: string | null
          provider_event_count?: number
          provider_message_id?: string | null
          provider_ready?: boolean | null
          provider_status?: string | null
          queued_at?: string
          recipient?: string
          rendered_body?: string
          rendered_subject?: string | null
          reply_to_email?: string | null
          reservation_id?: string | null
          scheduled_for?: string | null
          sender_name?: string | null
          sent_at?: string | null
          source?: string
          status?: string
          template_id?: string | null
          tenant_id?: string
          updated_at?: string
          workflow_id?: string | null
          workflow_run_id?: string | null
          workflow_step_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_messages_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_messages_email_domain_id_fkey"
            columns: ["email_domain_id"]
            isOneToOne: false
            referencedRelation: "tenant_email_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_messages_email_sender_id_fkey"
            columns: ["email_sender_id"]
            isOneToOne: false
            referencedRelation: "tenant_email_senders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_messages_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_messages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "communication_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_templates: {
        Row: {
          archived_at: string | null
          body: string
          category: string
          channel: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_system_template: boolean
          language: string
          name: string
          sample_data: Json
          subject: string | null
          tenant_id: string
          updated_at: string
          variables_schema: Json
          version: number
        }
        Insert: {
          archived_at?: string | null
          body: string
          category?: string
          channel: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system_template?: boolean
          language?: string
          name: string
          sample_data?: Json
          subject?: string | null
          tenant_id: string
          updated_at?: string
          variables_schema?: Json
          version?: number
        }
        Update: {
          archived_at?: string | null
          body?: string
          category?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system_template?: boolean
          language?: string
          name?: string
          sample_data?: Json
          subject?: string | null
          tenant_id?: string
          updated_at?: string
          variables_schema?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "communication_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          source: string | null
          tags: Json | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          source?: string | null
          tags?: Json | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          source?: string | null
          tags?: Json | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      event_outbox: {
        Row: {
          attempt_count: number
          created_at: string
          customer_id: string | null
          entity_id: string | null
          entity_type: string
          error_message: string | null
          event_type: string
          id: string
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_retry_at: string | null
          payload: Json
          processed_at: string | null
          reservation_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          customer_id?: string | null
          entity_id?: string | null
          entity_type: string
          error_message?: string | null
          event_type: string
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          payload?: Json
          processed_at?: string | null
          reservation_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          customer_id?: string | null
          entity_id?: string | null
          entity_type?: string
          error_message?: string | null
          event_type?: string
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          payload?: Json
          processed_at?: string | null
          reservation_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_outbox_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      guests: {
        Row: {
          booking_id: string | null
          created_at: string | null
          email: string
          first_name: string
          ghl_contact_id: string | null
          id: string
          is_owner: boolean | null
          last_name: string
          phone: string | null
          tenant_id: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string | null
          email: string
          first_name: string
          ghl_contact_id?: string | null
          id?: string
          is_owner?: boolean | null
          last_name: string
          phone?: string | null
          tenant_id?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string | null
          email?: string
          first_name?: string
          ghl_contact_id?: string | null
          id?: string
          is_owner?: boolean | null
          last_name?: string
          phone?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_activity_logs: {
        Row: {
          action: string
          category: string
          created_at: string
          id: string
          integration_id: string | null
          message: string | null
          metadata: Json | null
          provider: string
          status: string
          tenant_id: string
        }
        Insert: {
          action: string
          category: string
          created_at?: string
          id?: string
          integration_id?: string | null
          message?: string | null
          metadata?: Json | null
          provider: string
          status: string
          tenant_id: string
        }
        Update: {
          action?: string
          category?: string
          created_at?: string
          id?: string
          integration_id?: string | null
          message?: string | null
          metadata?: Json | null
          provider?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_activity_logs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "tenant_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_activity_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_catalog: {
        Row: {
          category: string
          connection_scope: string
          created_at: string | null
          description: string | null
          display_name: string
          icon: string
          id: string
          is_active: boolean
          is_coming_soon: boolean
          provider: string
          sort_order: number
          tenant_configuration_mode: string
        }
        Insert: {
          category: string
          connection_scope?: string
          created_at?: string | null
          description?: string | null
          display_name: string
          icon?: string
          id?: string
          is_active?: boolean
          is_coming_soon?: boolean
          provider: string
          sort_order?: number
          tenant_configuration_mode?: string
        }
        Update: {
          category?: string
          connection_scope?: string
          created_at?: string | null
          description?: string | null
          display_name?: string
          icon?: string
          id?: string
          is_active?: boolean
          is_coming_soon?: boolean
          provider?: string
          sort_order?: number
          tenant_configuration_mode?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          due_date: string
          id: string
          paid_at: string | null
          status: string
          stripe_invoice_id: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          due_date: string
          id?: string
          paid_at?: string | null
          status?: string
          stripe_invoice_id?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          due_date?: string
          id?: string
          paid_at?: string | null
          status?: string
          stripe_invoice_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_availability_blocks: {
        Row: {
          created_at: string
          end_at: string
          external_source_url: string | null
          external_uid: string | null
          id: string
          is_all_day: boolean | null
          listing_id: string
          raw_data: Json | null
          source_id: string | null
          source_type: string
          start_at: string
          status: string | null
          tenant_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_at: string
          external_source_url?: string | null
          external_uid?: string | null
          id?: string
          is_all_day?: boolean | null
          listing_id: string
          raw_data?: Json | null
          source_id?: string | null
          source_type: string
          start_at: string
          status?: string | null
          tenant_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_at?: string
          external_source_url?: string | null
          external_uid?: string | null
          id?: string
          is_all_day?: boolean | null
          listing_id?: string
          raw_data?: Json | null
          source_id?: string | null
          source_type?: string
          start_at?: string
          status?: string | null
          tenant_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_availability_blocks_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_availability_blocks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_blocks: {
        Row: {
          block_type: string
          created_at: string
          end_at: string
          id: string
          listing_id: string
          notes: string | null
          reason: string | null
          start_at: string
        }
        Insert: {
          block_type?: string
          created_at?: string
          end_at: string
          id?: string
          listing_id: string
          notes?: string | null
          reason?: string | null
          start_at: string
        }
        Update: {
          block_type?: string
          created_at?: string
          end_at?: string
          id?: string
          listing_id?: string
          notes?: string | null
          reason?: string | null
          start_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_blocks_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_fixed_start_times: {
        Row: {
          created_at: string
          day_of_week: number
          id: string
          is_active: boolean
          listing_id: string
          pricing_option_id: string | null
          sort_order: number
          start_time: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          id?: string
          is_active?: boolean
          listing_id: string
          pricing_option_id?: string | null
          sort_order?: number
          start_time: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          id?: string
          is_active?: boolean
          listing_id?: string
          pricing_option_id?: string | null
          sort_order?: number
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_fixed_start_times_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_fixed_start_times_pricing_option_id_fkey"
            columns: ["pricing_option_id"]
            isOneToOne: false
            referencedRelation: "listing_pricing_options"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_operating_hours: {
        Row: {
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean
          listing_id: string
          start_time: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_time?: string
          id?: string
          is_active?: boolean
          listing_id: string
          start_time?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean
          listing_id?: string
          start_time?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_operating_hours_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_pricing_options: {
        Row: {
          base_price: number
          created_at: string
          duration_minutes: number
          end_time_restriction: string | null
          id: string
          included_guests: number | null
          is_active: boolean
          listing_id: string
          maximum_guests: number | null
          minimum_guests: number | null
          name: string
          price_per_additional_guest: number | null
          pricing_type: string
          sort_order: number
          start_time_restriction: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          base_price?: number
          created_at?: string
          duration_minutes: number
          end_time_restriction?: string | null
          id?: string
          included_guests?: number | null
          is_active?: boolean
          listing_id: string
          maximum_guests?: number | null
          minimum_guests?: number | null
          name: string
          price_per_additional_guest?: number | null
          pricing_type?: string
          sort_order?: number
          start_time_restriction?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          base_price?: number
          created_at?: string
          duration_minutes?: number
          end_time_restriction?: string | null
          id?: string
          included_guests?: number | null
          is_active?: boolean
          listing_id?: string
          maximum_guests?: number | null
          minimum_guests?: number | null
          name?: string
          price_per_additional_guest?: number | null
          pricing_type?: string
          sort_order?: number
          start_time_restriction?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_pricing_options_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_pricing_options_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          amenities: string[] | null
          boat_type: string | null
          booking_durations: number[] | null
          buffer_after_minutes: number
          buffer_before_minutes: number
          cancellation_policy_text: string | null
          capacity: number | null
          created_at: string | null
          currency: string
          customer_instructions: string | null
          deposit_amount: number | null
          deposit_fixed_amount: number
          deposit_percentage: number
          deposit_type: string
          description: string | null
          full_description: string | null
          ghl_booking_url: string | null
          hold_duration_minutes: number
          id: string
          instant_booking: boolean
          is_active: boolean | null
          length_ft: number | null
          listing_type: string
          location: string | null
          maximum_advance_days: number
          meeting_instructions: string | null
          meeting_point: string | null
          minimum_guests: number
          minimum_notice_hours: number
          name: string
          online_booking_enabled: boolean
          payment_mode: string
          photos: string[] | null
          price_full_day: number | null
          price_half_day: number | null
          price_per_hour: number | null
          request_blocks_availability: boolean
          request_expiration_hours: number
          request_to_book_enabled: boolean
          requires_approval: boolean
          service_fee_fixed_amount: number
          service_fee_percentage: number
          service_fee_type: string
          short_description: string | null
          slot_interval_minutes: number
          slot_mode: string
          slug: string
          sort_order: number | null
          tax_percentage: number
          tenant_id: string | null
          terms_summary: string | null
          timezone: string
          updated_at: string | null
          year: number | null
        }
        Insert: {
          amenities?: string[] | null
          boat_type?: string | null
          booking_durations?: number[] | null
          buffer_after_minutes?: number
          buffer_before_minutes?: number
          cancellation_policy_text?: string | null
          capacity?: number | null
          created_at?: string | null
          currency?: string
          customer_instructions?: string | null
          deposit_amount?: number | null
          deposit_fixed_amount?: number
          deposit_percentage?: number
          deposit_type?: string
          description?: string | null
          full_description?: string | null
          ghl_booking_url?: string | null
          hold_duration_minutes?: number
          id?: string
          instant_booking?: boolean
          is_active?: boolean | null
          length_ft?: number | null
          listing_type?: string
          location?: string | null
          maximum_advance_days?: number
          meeting_instructions?: string | null
          meeting_point?: string | null
          minimum_guests?: number
          minimum_notice_hours?: number
          name: string
          online_booking_enabled?: boolean
          payment_mode?: string
          photos?: string[] | null
          price_full_day?: number | null
          price_half_day?: number | null
          price_per_hour?: number | null
          request_blocks_availability?: boolean
          request_expiration_hours?: number
          request_to_book_enabled?: boolean
          requires_approval?: boolean
          service_fee_fixed_amount?: number
          service_fee_percentage?: number
          service_fee_type?: string
          short_description?: string | null
          slot_interval_minutes?: number
          slot_mode?: string
          slug: string
          sort_order?: number | null
          tax_percentage?: number
          tenant_id?: string | null
          terms_summary?: string | null
          timezone?: string
          updated_at?: string | null
          year?: number | null
        }
        Update: {
          amenities?: string[] | null
          boat_type?: string | null
          booking_durations?: number[] | null
          buffer_after_minutes?: number
          buffer_before_minutes?: number
          cancellation_policy_text?: string | null
          capacity?: number | null
          created_at?: string | null
          currency?: string
          customer_instructions?: string | null
          deposit_amount?: number | null
          deposit_fixed_amount?: number
          deposit_percentage?: number
          deposit_type?: string
          description?: string | null
          full_description?: string | null
          ghl_booking_url?: string | null
          hold_duration_minutes?: number
          id?: string
          instant_booking?: boolean
          is_active?: boolean | null
          length_ft?: number | null
          listing_type?: string
          location?: string | null
          maximum_advance_days?: number
          meeting_instructions?: string | null
          meeting_point?: string | null
          minimum_guests?: number
          minimum_notice_hours?: number
          name?: string
          online_booking_enabled?: boolean
          payment_mode?: string
          photos?: string[] | null
          price_full_day?: number | null
          price_half_day?: number | null
          price_per_hour?: number | null
          request_blocks_availability?: boolean
          request_expiration_hours?: number
          request_to_book_enabled?: boolean
          requires_approval?: boolean
          service_fee_fixed_amount?: number
          service_fee_percentage?: number
          service_fee_type?: string
          short_description?: string | null
          slot_interval_minutes?: number
          slot_mode?: string
          slug?: string
          sort_order?: number | null
          tax_percentage?: number
          tenant_id?: string | null
          terms_summary?: string | null
          timezone?: string
          updated_at?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          message: string | null
          priority: string | null
          read: boolean | null
          read_at: string | null
          tenant_id: string
          title: string
          type: string
        }
        Insert: {
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          message?: string | null
          priority?: string | null
          read?: boolean | null
          read_at?: string | null
          tenant_id: string
          title: string
          type: string
        }
        Update: {
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          message?: string | null
          priority?: string | null
          read?: boolean | null
          read_at?: string | null
          tenant_id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          created_at: string | null
          currency: string | null
          customer_id: string | null
          id: string
          notes: string | null
          pipeline_id: string | null
          source: string | null
          stage_id: string | null
          status: string | null
          tenant_id: string
          title: string
          updated_at: string | null
          value: number | null
        }
        Insert: {
          created_at?: string | null
          currency?: string | null
          customer_id?: string | null
          id?: string
          notes?: string | null
          pipeline_id?: string | null
          source?: string | null
          stage_id?: string | null
          status?: string | null
          tenant_id: string
          title: string
          updated_at?: string | null
          value?: number | null
        }
        Update: {
          created_at?: string | null
          currency?: string | null
          customer_id?: string | null
          id?: string
          notes?: string | null
          pipeline_id?: string | null
          source?: string | null
          stage_id?: string | null
          status?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_notes_native: {
        Row: {
          author_name: string
          author_user_id: string | null
          body: string
          created_at: string
          id: string
          opportunity_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          author_name?: string
          author_user_id?: string | null
          body: string
          created_at?: string
          id?: string
          opportunity_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          author_name?: string
          author_user_id?: string | null
          body?: string
          created_at?: string
          id?: string
          opportunity_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_notes_native_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_notes_native_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string | null
          currency: string
          environment: string
          failed_at: string | null
          failure_code: string | null
          failure_reason: string | null
          id: string
          idempotency_key: string | null
          integration_id: string | null
          metadata: Json | null
          paid_at: string | null
          payment_type: string
          platform_fee_amount: number | null
          provider: string
          provider_charge_id: string | null
          provider_checkout_session_id: string | null
          provider_payment_id: string | null
          provider_refund_id: string | null
          refunded_amount: number | null
          refunded_at: string | null
          reservation_id: string
          status: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          amount?: number
          created_at?: string | null
          currency?: string
          environment?: string
          failed_at?: string | null
          failure_code?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          integration_id?: string | null
          metadata?: Json | null
          paid_at?: string | null
          payment_type?: string
          platform_fee_amount?: number | null
          provider?: string
          provider_charge_id?: string | null
          provider_checkout_session_id?: string | null
          provider_payment_id?: string | null
          provider_refund_id?: string | null
          refunded_amount?: number | null
          refunded_at?: string | null
          reservation_id: string
          status?: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string
          environment?: string
          failed_at?: string | null
          failure_code?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          integration_id?: string | null
          metadata?: Json | null
          paid_at?: string | null
          payment_type?: string
          platform_fee_amount?: number | null
          provider?: string
          provider_charge_id?: string | null
          provider_checkout_session_id?: string | null
          provider_payment_id?: string | null
          provider_refund_id?: string | null
          refunded_amount?: number | null
          refunded_at?: string | null
          reservation_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "tenant_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          archived_at: string | null
          color: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          pipeline_id: string | null
          stage_order: number
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          archived_at?: string | null
          color?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          pipeline_id?: string | null
          stage_order?: number
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          archived_at?: string | null
          color?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          pipeline_id?: string | null
          stage_order?: number
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          name: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipelines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_pricing: {
        Row: {
          created_at: string | null
          features: Json
          id: string
          plan: string
          price: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          features?: Json
          id?: string
          plan: string
          price?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          features?: Json
          id?: string
          plan?: string
          price?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      platform_fee_config: {
        Row: {
          created_at: string | null
          fee_fixed_amount: number | null
          fee_percentage: number | null
          fee_type: string
          id: string
          is_active: boolean | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          fee_fixed_amount?: number | null
          fee_percentage?: number | null
          fee_type?: string
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          fee_fixed_amount?: number | null
          fee_percentage?: number | null
          fee_type?: string
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      platform_integrations: {
        Row: {
          capabilities: Json
          category: string
          connected_at: string | null
          connection_status: string
          created_at: string
          environment: string
          external_account_id: string | null
          id: string
          last_synced_at: string | null
          metadata: Json
          provider: string
          updated_at: string
          webhook_last_event_at: string | null
          webhook_status: string
        }
        Insert: {
          capabilities?: Json
          category: string
          connected_at?: string | null
          connection_status?: string
          created_at?: string
          environment?: string
          external_account_id?: string | null
          id?: string
          last_synced_at?: string | null
          metadata?: Json
          provider: string
          updated_at?: string
          webhook_last_event_at?: string | null
          webhook_status?: string
        }
        Update: {
          capabilities?: Json
          category?: string
          connected_at?: string | null
          connection_status?: string
          created_at?: string
          environment?: string
          external_account_id?: string | null
          id?: string
          last_synced_at?: string | null
          metadata?: Json
          provider?: string
          updated_at?: string
          webhook_last_event_at?: string | null
          webhook_status?: string
        }
        Relationships: []
      }
      platform_provider_secrets: {
        Row: {
          created_at: string | null
          encrypted_value: string
          environment: string
          id: string
          is_configured: boolean
          provider_key: string
          secret_name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          encrypted_value: string
          environment?: string
          id?: string
          is_configured?: boolean
          provider_key: string
          secret_name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          encrypted_value?: string
          environment?: string
          id?: string
          is_configured?: boolean
          provider_key?: string
          secret_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      platform_secret_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          detail: string | null
          environment: string | null
          id: string
          provider_key: string
          result: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          detail?: string | null
          environment?: string | null
          id?: string
          provider_key: string
          result?: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          detail?: string | null
          environment?: string | null
          id?: string
          provider_key?: string
          result?: string
        }
        Relationships: []
      }
      provider_events: {
        Row: {
          communication_message_id: string | null
          created_at: string
          environment: string | null
          event_type: string
          id: string
          message_id: string | null
          processed: boolean
          processed_at: string | null
          provider: string
          provider_event_id: string
          raw_payload: Json
          tenant_id: string | null
        }
        Insert: {
          communication_message_id?: string | null
          created_at?: string
          environment?: string | null
          event_type: string
          id?: string
          message_id?: string | null
          processed?: boolean
          processed_at?: string | null
          provider: string
          provider_event_id: string
          raw_payload?: Json
          tenant_id?: string | null
        }
        Update: {
          communication_message_id?: string | null
          created_at?: string
          environment?: string | null
          event_type?: string
          id?: string
          message_id?: string | null
          processed?: boolean
          processed_at?: string | null
          provider?: string
          provider_event_id?: string
          raw_payload?: Json
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_events_communication_message_id_fkey"
            columns: ["communication_message_id"]
            isOneToOne: false
            referencedRelation: "communication_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_log: {
        Row: {
          created_at: string | null
          endpoint: string
          id: string
          identifier: string
        }
        Insert: {
          created_at?: string | null
          endpoint: string
          id?: string
          identifier: string
        }
        Update: {
          created_at?: string | null
          endpoint?: string
          id?: string
          identifier?: string
        }
        Relationships: []
      }
      reservation_status_labels: {
        Row: {
          color: string
          created_at: string
          description: string | null
          display_label: string
          id: string
          is_visible_to_customer: boolean
          sort_order: number
          status_key: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          display_label: string
          id?: string
          is_visible_to_customer?: boolean
          sort_order?: number
          status_key: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          display_label?: string
          id?: string
          is_visible_to_customer?: boolean
          sort_order?: number
          status_key?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_status_labels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          amount_paid: number | null
          balance_due: number | null
          booking_reference: string | null
          booking_status: string
          cancellation_reason: string | null
          cancelled_at: string | null
          charter_date: string | null
          charter_end: string | null
          client_email: string | null
          client_name: string
          client_phone: string | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string | null
          currency: string | null
          customer_id: string | null
          deposit_amount: number | null
          duration_minutes: number | null
          end_at: string | null
          expires_at: string | null
          ghl_contact_id: string | null
          ghl_opportunity_id: string | null
          ghl_stage_id: string | null
          google_calendar_event_id: string | null
          guest_count: number | null
          id: string
          listing_id: string | null
          monetary_value: number | null
          notes: string | null
          opportunity_id: string | null
          payment_status: string | null
          source: string
          start_at: string | null
          status: string | null
          tenant_id: string
          timezone: string | null
          title: string | null
          total_amount: number | null
          updated_at: string | null
          vessel: string | null
        }
        Insert: {
          amount_paid?: number | null
          balance_due?: number | null
          booking_reference?: string | null
          booking_status?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          charter_date?: string | null
          charter_end?: string | null
          client_email?: string | null
          client_name?: string
          client_phone?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          currency?: string | null
          customer_id?: string | null
          deposit_amount?: number | null
          duration_minutes?: number | null
          end_at?: string | null
          expires_at?: string | null
          ghl_contact_id?: string | null
          ghl_opportunity_id?: string | null
          ghl_stage_id?: string | null
          google_calendar_event_id?: string | null
          guest_count?: number | null
          id?: string
          listing_id?: string | null
          monetary_value?: number | null
          notes?: string | null
          opportunity_id?: string | null
          payment_status?: string | null
          source?: string
          start_at?: string | null
          status?: string | null
          tenant_id: string
          timezone?: string | null
          title?: string | null
          total_amount?: number | null
          updated_at?: string | null
          vessel?: string | null
        }
        Update: {
          amount_paid?: number | null
          balance_due?: number | null
          booking_reference?: string | null
          booking_status?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          charter_date?: string | null
          charter_end?: string | null
          client_email?: string | null
          client_name?: string
          client_phone?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          currency?: string | null
          customer_id?: string | null
          deposit_amount?: number | null
          duration_minutes?: number | null
          end_at?: string | null
          expires_at?: string | null
          ghl_contact_id?: string | null
          ghl_opportunity_id?: string | null
          ghl_stage_id?: string | null
          google_calendar_event_id?: string | null
          guest_count?: number | null
          id?: string
          listing_id?: string | null
          monetary_value?: number | null
          notes?: string | null
          opportunity_id?: string | null
          payment_status?: string | null
          source?: string
          start_at?: string | null
          status?: string | null
          tenant_id?: string
          timezone?: string | null
          title?: string | null
          total_amount?: number | null
          updated_at?: string | null
          vessel?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_api_keys: {
        Row: {
          created_at: string
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          scopes: string[]
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          scopes?: string[]
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          scopes?: string[]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_api_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_calendar_connections: {
        Row: {
          block_availability_from_external: boolean | null
          calendar_name: string | null
          calendar_timezone: string | null
          cancel_on_reservation_cancel: boolean | null
          conflict_handling: string | null
          connection_status: string | null
          create_on_confirm: boolean | null
          created_at: string
          encrypted_credentials: string | null
          event_description_template: string | null
          event_title_template: string | null
          granted_scopes: string[] | null
          id: string
          include_customer_details: boolean | null
          include_meeting_point: boolean | null
          last_sync_at: string | null
          provider: string
          provider_account_id: string | null
          selected_calendar_id: string | null
          sync_direction: string | null
          tenant_id: string
          token_expires_at: string | null
          update_on_change: boolean | null
          updated_at: string
        }
        Insert: {
          block_availability_from_external?: boolean | null
          calendar_name?: string | null
          calendar_timezone?: string | null
          cancel_on_reservation_cancel?: boolean | null
          conflict_handling?: string | null
          connection_status?: string | null
          create_on_confirm?: boolean | null
          created_at?: string
          encrypted_credentials?: string | null
          event_description_template?: string | null
          event_title_template?: string | null
          granted_scopes?: string[] | null
          id?: string
          include_customer_details?: boolean | null
          include_meeting_point?: boolean | null
          last_sync_at?: string | null
          provider?: string
          provider_account_id?: string | null
          selected_calendar_id?: string | null
          sync_direction?: string | null
          tenant_id: string
          token_expires_at?: string | null
          update_on_change?: boolean | null
          updated_at?: string
        }
        Update: {
          block_availability_from_external?: boolean | null
          calendar_name?: string | null
          calendar_timezone?: string | null
          cancel_on_reservation_cancel?: boolean | null
          conflict_handling?: string | null
          connection_status?: string | null
          create_on_confirm?: boolean | null
          created_at?: string
          encrypted_credentials?: string | null
          event_description_template?: string | null
          event_title_template?: string | null
          granted_scopes?: string[] | null
          id?: string
          include_customer_details?: boolean | null
          include_meeting_point?: boolean | null
          last_sync_at?: string | null
          provider?: string
          provider_account_id?: string | null
          selected_calendar_id?: string | null
          sync_direction?: string | null
          tenant_id?: string
          token_expires_at?: string | null
          update_on_change?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_calendar_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_communication_settings: {
        Row: {
          business_timezone: string
          created_at: string
          default_email_provider: string | null
          default_language: string
          default_sms_provider: string | null
          default_whatsapp_provider: string | null
          from_email: string | null
          id: string
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          reply_to_email: string | null
          sender_name: string | null
          sms_sender: string | null
          tenant_id: string
          test_recipient_email: string | null
          test_recipient_phone: string | null
          updated_at: string
          whatsapp_business_number: string | null
        }
        Insert: {
          business_timezone?: string
          created_at?: string
          default_email_provider?: string | null
          default_language?: string
          default_sms_provider?: string | null
          default_whatsapp_provider?: string | null
          from_email?: string | null
          id?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          reply_to_email?: string | null
          sender_name?: string | null
          sms_sender?: string | null
          tenant_id: string
          test_recipient_email?: string | null
          test_recipient_phone?: string | null
          updated_at?: string
          whatsapp_business_number?: string | null
        }
        Update: {
          business_timezone?: string
          created_at?: string
          default_email_provider?: string | null
          default_language?: string
          default_sms_provider?: string | null
          default_whatsapp_provider?: string | null
          from_email?: string | null
          id?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          reply_to_email?: string | null
          sender_name?: string | null
          sms_sender?: string | null
          tenant_id?: string
          test_recipient_email?: string | null
          test_recipient_phone?: string | null
          updated_at?: string
          whatsapp_business_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_communication_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_email_domains: {
        Row: {
          created_at: string
          created_by: string | null
          dns_records: Json
          domain: string
          id: string
          is_default: boolean
          last_checked_at: string | null
          provider: string
          provider_domain_id: string | null
          provider_metadata: Json
          receiving_enabled: boolean
          region: string | null
          sending_enabled: boolean
          status: string
          subdomain: string | null
          suspended_at: string | null
          suspension_reason: string | null
          tenant_id: string
          updated_at: string
          verification_status: string | null
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dns_records?: Json
          domain: string
          id?: string
          is_default?: boolean
          last_checked_at?: string | null
          provider?: string
          provider_domain_id?: string | null
          provider_metadata?: Json
          receiving_enabled?: boolean
          region?: string | null
          sending_enabled?: boolean
          status?: string
          subdomain?: string | null
          suspended_at?: string | null
          suspension_reason?: string | null
          tenant_id: string
          updated_at?: string
          verification_status?: string | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dns_records?: Json
          domain?: string
          id?: string
          is_default?: boolean
          last_checked_at?: string | null
          provider?: string
          provider_domain_id?: string | null
          provider_metadata?: Json
          receiving_enabled?: boolean
          region?: string | null
          sending_enabled?: boolean
          status?: string
          subdomain?: string | null
          suspended_at?: string | null
          suspension_reason?: string | null
          tenant_id?: string
          updated_at?: string
          verification_status?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_email_domains_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_email_senders: {
        Row: {
          archived_at: string | null
          created_at: string
          email_domain_id: string
          from_email: string
          id: string
          is_active: boolean
          is_default: boolean
          reply_to_email: string | null
          sender_name: string
          tenant_id: string
          updated_at: string
          verification_status: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          email_domain_id: string
          from_email: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          reply_to_email?: string | null
          sender_name: string
          tenant_id: string
          updated_at?: string
          verification_status?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          email_domain_id?: string
          from_email?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          reply_to_email?: string | null
          sender_name?: string
          tenant_id?: string
          updated_at?: string
          verification_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_email_senders_email_domain_id_fkey"
            columns: ["email_domain_id"]
            isOneToOne: false
            referencedRelation: "tenant_email_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_email_senders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_ical_feeds: {
        Row: {
          assigned_listing_ids: string[] | null
          conflict_handling: string | null
          created_at: string
          external_uids: Json | null
          feed_token: string | null
          feed_type: string
          id: string
          include_cancelled: boolean | null
          include_customer_info: boolean | null
          last_error: string | null
          last_sync_at: string | null
          name: string
          selected_listing_ids: string[] | null
          source_url: string | null
          status: string | null
          sync_frequency: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assigned_listing_ids?: string[] | null
          conflict_handling?: string | null
          created_at?: string
          external_uids?: Json | null
          feed_token?: string | null
          feed_type: string
          id?: string
          include_cancelled?: boolean | null
          include_customer_info?: boolean | null
          last_error?: string | null
          last_sync_at?: string | null
          name?: string
          selected_listing_ids?: string[] | null
          source_url?: string | null
          status?: string | null
          sync_frequency?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assigned_listing_ids?: string[] | null
          conflict_handling?: string | null
          created_at?: string
          external_uids?: Json | null
          feed_token?: string | null
          feed_type?: string
          id?: string
          include_cancelled?: boolean | null
          include_customer_info?: boolean | null
          last_error?: string | null
          last_sync_at?: string | null
          name?: string
          selected_listing_ids?: string[] | null
          source_url?: string | null
          status?: string | null
          sync_frequency?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_ical_feeds_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_integrations: {
        Row: {
          capabilities: Json | null
          category: string
          configuration: Json | null
          connected_at: string | null
          connection_mode: string | null
          connection_status: string
          created_at: string | null
          credentials: Json | null
          disconnected_at: string | null
          display_name: string | null
          enabled: boolean
          environment: string
          external_account_id: string | null
          id: string
          is_default: boolean
          last_error_at: string | null
          last_error_code: string | null
          last_error_message: string | null
          last_success_at: string | null
          last_synced_at: string | null
          last_tested_at: string | null
          provider: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          capabilities?: Json | null
          category: string
          configuration?: Json | null
          connected_at?: string | null
          connection_mode?: string | null
          connection_status?: string
          created_at?: string | null
          credentials?: Json | null
          disconnected_at?: string | null
          display_name?: string | null
          enabled?: boolean
          environment?: string
          external_account_id?: string | null
          id?: string
          is_default?: boolean
          last_error_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          last_success_at?: string | null
          last_synced_at?: string | null
          last_tested_at?: string | null
          provider: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          capabilities?: Json | null
          category?: string
          configuration?: Json | null
          connected_at?: string | null
          connection_mode?: string | null
          connection_status?: string
          created_at?: string | null
          credentials?: Json | null
          disconnected_at?: string | null
          display_name?: string | null
          enabled?: boolean
          environment?: string
          external_account_id?: string | null
          id?: string
          is_default?: boolean
          last_error_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          last_success_at?: string | null
          last_synced_at?: string | null
          last_tested_at?: string | null
          provider?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_integrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_users: {
        Row: {
          created_at: string | null
          id: string
          role: string
          tenant_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: string
          tenant_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: string
          tenant_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_webhook_deliveries: {
        Row: {
          attempt_count: number
          created_at: string
          delivered_at: string | null
          endpoint_id: string
          error_message: string | null
          event_type: string
          id: string
          max_attempts: number
          next_retry_at: string | null
          payload: Json
          response_body: string | null
          response_code: number | null
          status: string
          tenant_id: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          delivered_at?: string | null
          endpoint_id: string
          error_message?: string | null
          event_type: string
          id?: string
          max_attempts?: number
          next_retry_at?: string | null
          payload?: Json
          response_body?: string | null
          response_code?: number | null
          status?: string
          tenant_id: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          delivered_at?: string | null
          endpoint_id?: string
          error_message?: string | null
          event_type?: string
          id?: string
          max_attempts?: number
          next_retry_at?: string | null
          payload?: Json
          response_body?: string | null
          response_code?: number | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_webhook_deliveries_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "tenant_webhook_endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_webhook_deliveries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_webhook_endpoints: {
        Row: {
          created_at: string
          events: string[]
          id: string
          is_active: boolean | null
          last_delivery_at: string | null
          last_delivery_status: string | null
          name: string
          signing_secret: string
          tenant_id: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          events?: string[]
          id?: string
          is_active?: boolean | null
          last_delivery_at?: string | null
          last_delivery_status?: string | null
          name: string
          signing_secret: string
          tenant_id: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          events?: string[]
          id?: string
          is_active?: boolean | null
          last_delivery_at?: string | null
          last_delivery_status?: string | null
          name?: string
          signing_secret?: string
          tenant_id?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_webhook_endpoints_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string | null
          domain: string | null
          email: string | null
          ghl_location_id: string | null
          hero_image_url: string | null
          hero_subtitle: string | null
          hero_title: string | null
          id: string
          instagram: string | null
          integration_type: string | null
          is_active: boolean
          landing_page_url: string | null
          last_payment_at: string | null
          logo_url: string | null
          monthly_amount: number
          name: string
          next_renewal_at: string | null
          phone: string | null
          plan: string
          primary_color: string | null
          secondary_color: string | null
          slug: string
          status: string
          stripe_account_id: string | null
          suspended_at: string | null
          template: string | null
          trial_ends_at: string | null
        }
        Insert: {
          created_at?: string | null
          domain?: string | null
          email?: string | null
          ghl_location_id?: string | null
          hero_image_url?: string | null
          hero_subtitle?: string | null
          hero_title?: string | null
          id?: string
          instagram?: string | null
          integration_type?: string | null
          is_active?: boolean
          landing_page_url?: string | null
          last_payment_at?: string | null
          logo_url?: string | null
          monthly_amount?: number
          name: string
          next_renewal_at?: string | null
          phone?: string | null
          plan?: string
          primary_color?: string | null
          secondary_color?: string | null
          slug: string
          status?: string
          stripe_account_id?: string | null
          suspended_at?: string | null
          template?: string | null
          trial_ends_at?: string | null
        }
        Update: {
          created_at?: string | null
          domain?: string | null
          email?: string | null
          ghl_location_id?: string | null
          hero_image_url?: string | null
          hero_subtitle?: string | null
          hero_title?: string | null
          id?: string
          instagram?: string | null
          integration_type?: string | null
          is_active?: boolean
          landing_page_url?: string | null
          last_payment_at?: string | null
          logo_url?: string | null
          monthly_amount?: number
          name?: string
          next_renewal_at?: string | null
          phone?: string | null
          plan?: string
          primary_color?: string | null
          secondary_color?: string | null
          slug?: string
          status?: string
          stripe_account_id?: string | null
          suspended_at?: string | null
          template?: string | null
          trial_ends_at?: string | null
        }
        Relationships: []
      }
      vessels: {
        Row: {
          active: boolean | null
          capacity: number | null
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          name: string
          size_ft: number | null
          tenant_id: string | null
        }
        Insert: {
          active?: boolean | null
          capacity?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          size_ft?: number | null
          tenant_id?: string | null
        }
        Update: {
          active?: boolean | null
          capacity?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          size_ft?: number | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vessels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      waiver_templates: {
        Row: {
          created_at: string | null
          form_fields: Json | null
          html_content: string
          id: string
          is_active: boolean
          listing_id: string | null
          slug: string
          tenant_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          form_fields?: Json | null
          html_content: string
          id?: string
          is_active?: boolean
          listing_id?: string | null
          slug: string
          tenant_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          form_fields?: Json | null
          html_content?: string
          id?: string
          is_active?: boolean
          listing_id?: string | null
          slug?: string
          tenant_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waiver_templates_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiver_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      waivers: {
        Row: {
          booking_id: string | null
          guest_id: string | null
          id: string
          ip_address: string | null
          page_url: string | null
          pdf_url: string | null
          photo_consent: boolean | null
          signature_url: string | null
          signed_at: string | null
          tenant_id: string | null
        }
        Insert: {
          booking_id?: string | null
          guest_id?: string | null
          id?: string
          ip_address?: string | null
          page_url?: string | null
          pdf_url?: string | null
          photo_consent?: boolean | null
          signature_url?: string | null
          signed_at?: string | null
          tenant_id?: string | null
        }
        Update: {
          booking_id?: string | null
          guest_id?: string | null
          id?: string
          ip_address?: string | null
          page_url?: string | null
          pdf_url?: string | null
          photo_consent?: boolean | null
          signature_url?: string | null
          signed_at?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waivers_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waivers_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waivers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          created_at: string | null
          environment: string
          error_message: string | null
          event_type: string
          id: string
          processed_at: string | null
          processing_status: string
          provider: string
          provider_event_id: string
          safe_metadata: Json | null
        }
        Insert: {
          created_at?: string | null
          environment?: string
          error_message?: string | null
          event_type: string
          id?: string
          processed_at?: string | null
          processing_status?: string
          provider: string
          provider_event_id: string
          safe_metadata?: Json | null
        }
        Update: {
          created_at?: string | null
          environment?: string
          error_message?: string | null
          event_type?: string
          id?: string
          processed_at?: string | null
          processing_status?: string
          provider?: string
          provider_event_id?: string
          safe_metadata?: Json | null
        }
        Relationships: []
      }
      webhook_outbox: {
        Row: {
          attempt_count: number
          created_at: string
          delivered_at: string | null
          domain_event_type: string
          endpoint_id: string
          entity_id: string | null
          error_message: string | null
          id: string
          idempotency_key: string
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_retry_at: string | null
          payload: Json
          response_body: string | null
          response_code: number | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          delivered_at?: string | null
          domain_event_type: string
          endpoint_id: string
          entity_id?: string | null
          error_message?: string | null
          id?: string
          idempotency_key: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          payload?: Json
          response_body?: string | null
          response_code?: number | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          delivered_at?: string | null
          domain_event_type?: string
          endpoint_id?: string
          entity_id?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          payload?: Json
          response_body?: string | null
          response_code?: number | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_outbox_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "tenant_webhook_endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_outbox_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_health_log: {
        Row: {
          created_at: string
          dead_letter_count: number
          duration_ms: number | null
          error_message: string | null
          failed_count: number
          id: string
          invoked_at: string
          processed_count: number
          success: boolean
          worker_name: string
        }
        Insert: {
          created_at?: string
          dead_letter_count?: number
          duration_ms?: number | null
          error_message?: string | null
          failed_count?: number
          id?: string
          invoked_at?: string
          processed_count?: number
          success: boolean
          worker_name: string
        }
        Update: {
          created_at?: string
          dead_letter_count?: number
          duration_ms?: number | null
          error_message?: string | null
          failed_count?: number
          id?: string
          invoked_at?: string
          processed_count?: number
          success?: boolean
          worker_name?: string
        }
        Relationships: []
      }
    }
    Views: {
      tenant_members: {
        Row: {
          created_at: string | null
          id: string | null
          role: string | null
          tenant_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          role?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          role?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      authenticate_api_key: {
        Args: { p_key: string }
        Returns: {
          is_valid: boolean
          key_id: string
          key_name: string
          scopes: string[]
          tenant_id: string
          tenant_name: string
          tenant_slug: string
        }[]
      }
      auto_register_tenant: { Args: never; Returns: Json }
      calculate_booking_price: {
        Args: {
          p_guest_count?: number
          p_listing_id: string
          p_pricing_option_id: string
        }
        Returns: Json
      }
      check_listing_availability_with_blocks: {
        Args: {
          p_end_at: string
          p_listing_id: string
          p_reservation_id?: string
          p_start_at: string
        }
        Returns: {
          available: boolean
          conflict_id: string
          conflict_reference: string
          conflict_type: string
        }[]
      }
      check_rate_limit: {
        Args: {
          p_endpoint: string
          p_identifier: string
          p_max_requests?: number
          p_window_minutes?: number
        }
        Returns: Json
      }
      confirm_payment_from_webhook: {
        Args: {
          p_amount?: number
          p_currency?: string
          p_environment: string
          p_metadata?: Json
          p_payment_type?: string
          p_provider: string
          p_provider_charge_id?: string
          p_provider_checkout_id: string
          p_provider_event_id: string
          p_provider_payment_id?: string
        }
        Returns: Json
      }
      create_booking_access_token: {
        Args: { p_reservation_id: string }
        Returns: Json
      }
      create_booking_checkout: {
        Args: {
          p_amount: number
          p_currency: string
          p_environment: string
          p_idempotency_key: string
          p_integration_id: string
          p_metadata?: Json
          p_payment_type: string
          p_platform_fee_amount?: number
          p_provider: string
          p_reservation_id: string
        }
        Returns: Json
      }
      create_public_booking_hold: {
        Args: {
          p_client_email?: string
          p_client_name: string
          p_client_phone?: string
          p_guest_count?: number
          p_listing_id: string
          p_notes?: string
          p_pricing_option_id: string
          p_start_at: string
          p_tenant_id: string
        }
        Returns: Json
      }
      create_webhook_deliveries_for_event: {
        Args: {
          p_entity_id?: string
          p_event_type: string
          p_payload?: Json
          p_tenant_id: string
        }
        Returns: number
      }
      emit_customer_event: {
        Args: {
          p_customer_id: string
          p_event_type: string
          p_payload?: Json
          p_tenant_id: string
        }
        Returns: string
      }
      emit_domain_event: {
        Args: {
          p_customer_id?: string
          p_entity_id: string
          p_entity_type: string
          p_event_type: string
          p_payload?: Json
          p_reservation_id?: string
          p_tenant_id: string
        }
        Returns: string
      }
      emit_payment_event: {
        Args: {
          p_event_type: string
          p_payload?: Json
          p_payment_id: string
          p_reservation_id?: string
          p_tenant_id: string
        }
        Returns: string
      }
      emit_reservation_event: {
        Args: {
          p_customer_id?: string
          p_event_type: string
          p_payload?: Json
          p_reservation_id: string
          p_tenant_id: string
        }
        Returns: string
      }
      emit_waiver_event: {
        Args: {
          p_customer_id?: string
          p_event_type: string
          p_payload?: Json
          p_reservation_id?: string
          p_tenant_id: string
          p_waiver_id: string
        }
        Returns: string
      }
      emit_workflow_event: {
        Args: {
          p_event_type: string
          p_payload?: Json
          p_tenant_id: string
          p_workflow_run_id: string
        }
        Returns: string
      }
      ensure_tenant_membership: {
        Args: { p_tenant_id: string; p_user_id: string }
        Returns: undefined
      }
      expire_checkout_session: {
        Args: { p_provider?: string; p_provider_checkout_id: string }
        Returns: Json
      }
      expire_stale_holds: { Args: never; Returns: Json }
      generate_ical_feed_token: { Args: never; Returns: string }
      generate_webhook_signing_secret: { Args: never; Returns: string }
      get_automation_metrics: { Args: { p_tenant_id: string }; Returns: Json }
      get_dashboard_metrics: { Args: { p_tenant_id: string }; Returns: Json }
      get_public_availability: {
        Args: {
          p_date: string
          p_listing_slug: string
          p_pricing_option_id: string
          p_tenant_slug: string
        }
        Returns: Json
      }
      is_super_admin: { Args: never; Returns: boolean }
      is_tenant_member: { Args: { p_tenant_id: string }; Returns: boolean }
      log_integration_activity: {
        Args: {
          p_action: string
          p_category: string
          p_integration_id?: string
          p_message?: string
          p_metadata?: Json
          p_provider: string
          p_status: string
          p_tenant_id: string
        }
        Returns: string
      }
      log_worker_invocation: {
        Args: {
          p_dead_letter_count?: number
          p_duration_ms?: number
          p_error_message?: string
          p_failed_count?: number
          p_processed_count?: number
          p_success: boolean
          p_worker_name: string
        }
        Returns: string
      }
      mark_webhook_processed: {
        Args: {
          p_environment: string
          p_error_message?: string
          p_provider: string
          p_provider_event_id: string
          p_success?: boolean
        }
        Returns: undefined
      }
      process_refund: {
        Args: {
          p_actor_name?: string
          p_payment_id: string
          p_provider_refund_id?: string
          p_reason?: string
          p_refunded_amount: number
        }
        Returns: Json
      }
      record_payment_failure: {
        Args: {
          p_environment: string
          p_failure_code?: string
          p_failure_reason?: string
          p_metadata?: Json
          p_provider: string
          p_provider_checkout_id: string
          p_provider_event_id: string
          p_provider_payment_id?: string
        }
        Returns: Json
      }
      record_webhook_event: {
        Args: {
          p_environment: string
          p_event_type: string
          p_provider: string
          p_provider_event_id: string
          p_safe_metadata?: Json
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
