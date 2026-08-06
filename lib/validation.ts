import { z } from 'zod';

export const cancelReservationSchema = z.object({
  reservation_id: z.string().uuid(),
  cancellation_reason: z.string().max(500).optional().nullable(),
  target_cancelled_stage_id: z.string().uuid().optional().nullable(),
});

export const reactivateReservationSchema = z.object({
  reservation_id: z.string().uuid(),
  target_stage_id: z.string().uuid().optional().nullable(),
});

export const checkAvailabilitySchema = z.object({
  listing_id: z.string().uuid(),
  start_at: z.string().datetime(),
  end_at: z.string().datetime(),
  reservation_id_to_exclude: z.string().uuid().optional().nullable(),
});

export const createReservationSchema = z.object({
  listing_id: z.string().uuid(),
  customer_id: z.string().uuid().optional().nullable(),
  start_at: z.string().datetime(),
  end_at: z.string().datetime(),
  client_name: z.string().min(1).max(200),
  client_email: z.string().email().optional().nullable(),
  client_phone: z.string().max(30).optional().nullable(),
  guest_count: z.number().int().min(1).max(500).optional().nullable(),
  total_amount: z.number().min(0).optional().default(0),
  deposit_amount: z.number().min(0).optional().default(0),
  source: z.string().max(50).optional().default('manual'),
  notes: z.string().max(5000).optional().nullable(),
});

export const updateReservationSchema = z.object({
  id: z.string().uuid(),
  start_at: z.string().datetime().optional(),
  end_at: z.string().datetime().optional(),
  booking_status: z.enum([
    'inquiry', 'pending', 'awaiting_payment', 'confirmed',
    'in_progress', 'completed', 'cancelled', 'expired', 'no_show',
  ]).optional(),
  client_name: z.string().min(1).max(200).optional(),
  client_email: z.string().email().optional().nullable(),
  client_phone: z.string().max(30).optional().nullable(),
  guest_count: z.number().int().min(1).max(500).optional().nullable(),
  total_amount: z.number().min(0).optional(),
  notes: z.string().max(5000).optional().nullable(),
});

export const createOpportunitySchema = z.object({
  name: z.string().min(1).max(300),
  pipeline_id: z.string().uuid(),
  stage_id: z.string().uuid(),
  customer_id: z.string().uuid().optional().nullable(),
  listing_id: z.string().uuid().optional().nullable(),
  monetary_value: z.number().min(0).optional().default(0),
  source: z.string().max(50).optional().default('manual'),
  expected_service_date: z.string().datetime().optional().nullable(),
});

export const moveOpportunityStageSchema = z.object({
  opportunity_id: z.string().uuid(),
  new_stage_id: z.string().uuid(),
});

export const createCustomerSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().max(100).optional().default(''),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  company_name: z.string().max(200).optional().nullable(),
  tags: z.array(z.string().max(50)).optional().default([]),
  notes: z.string().max(5000).optional().nullable(),
  source: z.string().max(50).optional().default('manual'),
});

export const updateCustomerSchema = z.object({
  id: z.string().uuid(),
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().max(100).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  company_name: z.string().max(200).optional().nullable(),
  tags: z.array(z.string().max(50)).optional(),
  notes: z.string().max(5000).optional().nullable(),
});

export const createPipelineSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
});

export const createPipelineStageSchema = z.object({
  pipeline_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  stage_type: z.enum([
    'open', 'ready', 'in_progress', 'completed',
    'cancelled', 'won', 'lost', 'custom',
  ]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default('#6b7280'),
  stage_order: z.number().int().min(0).optional(),
});

export const waiverSubmissionSchema = z.object({
  tenant_id: z.string().uuid(),
  template_id: z.string().uuid(),
  signer_name: z.string().min(1).max(200),
  signer_email: z.string().email().optional().nullable(),
  signature_data_url: z.string().max(500000),
  html_snapshot: z.string().max(500000),
  reservation_id: z.string().uuid().optional().nullable(),
  listing_id: z.string().uuid().optional().nullable(),
  _hp: z.string().max(0).optional(),
});
