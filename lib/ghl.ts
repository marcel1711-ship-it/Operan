/**
 * DEPRECATED — Legacy GoHighLevel types.
 *
 * These types are retained ONLY for migration verification and deprecated
 * sync code. Native application code must import from lib/types.ts.
 *
 * Do not import Reservation or DashboardData from this file in active
 * components — they conflict with the native types in lib/types.ts.
 */

export type LegacyGhlStage = {
  id: string;
  name: string;
  order: number;
  pipelineId: string;
};

export type LegacyGhlOpportunity = {
  id: string;
  name: string;
  pipelineId: string;
  stageId: string;
  status: 'open' | 'won' | 'lost' | 'abandoned';
  contactId: string;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  contactCompany: string | null;
  contactTags: string[];
  monetaryValue: number;
  assignedTo: string | null;
  lastStatusChangeAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LegacyGhlContact = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  tags: string[];
  dateAdded: string;
  lastActivityDate: string | null;
};

export type LegacyGhlPipeline = {
  id: string;
  name: string;
  stages: LegacyGhlStage[];
};

export type LegacyGhlReservation = {
  id: string;
  ghl_opportunity_id: string | null;
  ghl_stage_id: string | null;
  title: string;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  vessel: string | null;
  charter_date: string;
  charter_end: string | null;
  monetary_value: number;
  status: string;
  notes: string | null;
};

export type LegacyGhlDashboardData = {
  pipeline: LegacyGhlPipeline;
  opportunities: LegacyGhlOpportunity[];
  contacts: LegacyGhlContact[];
  reservations: LegacyGhlReservation[];
};
