export type PipelineStageType =
  | 'open'
  | 'ready'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'won'
  | 'lost'
  | 'custom';

export type BookingStatus =
  | 'inquiry'
  | 'pending'
  | 'awaiting_payment'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'no_show';

export type PaymentStatus =
  | 'unpaid'
  | 'processing'
  | 'deposit_paid'
  | 'partially_paid'
  | 'paid_in_full'
  | 'failed'
  | 'partially_refunded'
  | 'refunded';

export type Opportunity = {
  id: string;
  tenant_id: string;
  pipeline_id: string | null;
  stage_id: string | null;
  customer_id: string | null;
  listing_id: string | null;
  reservation_id: string | null;
  name: string;
  monetary_value: number;
  currency: string;
  status: 'open' | 'won' | 'lost' | 'abandoned';
  assigned_to: string | null;
  source: string;
  expected_service_date: string | null;
  last_status_change_at: string | null;
  legacy_ghl_opportunity_id: string | null;
  created_at: string;
  updated_at: string;
  customer?: Customer | null;
  stage?: PipelineStage | null;
};

export type PipelineStage = {
  id: string;
  tenant_id: string;
  pipeline_id: string;
  name: string;
  system_key: string;
  stage_type: PipelineStageType;
  stage_order: number;
  color: string;
  is_active: boolean;
  archived_at: string | null;
  behavior_configuration: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type Pipeline = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  stages?: PipelineStage[];
};

export type Customer = {
  id: string;
  tenant_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string | null;
  normalized_email: string | null;
  phone: string | null;
  normalized_phone: string | null;
  company_name: string | null;
  tags: string[];
  source: string;
  notes: string | null;
  preferred_language: string;
  marketing_consent: boolean;
  sms_consent: boolean;
  whatsapp_consent: boolean;
  last_activity_at: string | null;
  legacy_ghl_contact_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Reservation = {
  id: string;
  tenant_id: string;
  listing_id: string | null;
  customer_id: string | null;
  opportunity_id: string | null;
  booking_reference: string | null;
  source: string;
  title: string | null;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  start_at: string | null;
  end_at: string | null;
  timezone: string;
  duration_minutes: number | null;
  guest_count: number | null;
  total_amount: number;
  deposit_amount: number;
  amount_paid: number;
  balance_due: number;
  currency: string;
  booking_status: BookingStatus;
  payment_status: PaymentStatus;
  expires_at: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  completed_at: string | null;
  actual_started_at: string | null;
  actual_ended_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  legacy_ghl_opportunity_id: string | null;
  vessel: string | null;
  charter_date: string | null;
  charter_end: string | null;
  monetary_value: number;
  status: string;
  notes: string | null;
  listing?: Listing | null;
  customer?: Customer | null;
};

export type Listing = {
  id: string;
  tenant_id: string;
  name: string;
  slug: string | null;
  description: string | null;
  photos: string[] | null;
  listing_type: string;
  boat_type: string | null;
  capacity: number | null;
  length_ft: number | null;
  year: number | null;
  location: string | null;
  meeting_point: string | null;
  amenities: string[] | null;
  price_per_hour: number | null;
  price_half_day: number | null;
  price_full_day: number | null;
  deposit_amount: number | null;
  deposit_percentage: number | null;
  booking_durations: string[] | null;
  currency: string;
  timezone: string;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  minimum_notice_hours: number;
  maximum_advance_days: number;
  instant_booking: boolean;
  requires_approval: boolean;
  is_active: boolean;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
};

export type OpportunityNote = {
  id: string;
  tenant_id: string;
  opportunity_id: string;
  body: string;
  author_user_id: string | null;
  author_name: string;
  created_at: string;
  updated_at: string;
};

export type ActivityLogEntry = {
  id: string;
  tenant_id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  actor_user_id: string | null;
  actor_name: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type Notification = {
  id: string;
  tenant_id: string;
  user_id: string | null;
  type: string;
  title: string;
  message: string | null;
  entity_type: string | null;
  entity_id: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  read_at: string | null;
  created_at: string;
};

export type DashboardData = {
  pipeline: Pipeline | null;
  stages: PipelineStage[];
  opportunities: Opportunity[];
  customers: Customer[];
  reservations: Reservation[];
};
