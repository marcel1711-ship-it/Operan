/**
 * @deprecated This module is retained ONLY for migration verification.
 * The application no longer calls GHL at runtime. Do not import from
 * active components. All native data access goes through lib/services/*.
 */

import type {
  LegacyGhlContact,
  LegacyGhlOpportunity,
  LegacyGhlPipeline,
  LegacyGhlStage,
} from './ghl';

const PROXY_URL = process.env.GHL_PROXY_URL;
const PROXY_ANON_KEY = process.env.GHL_PROXY_ANON_KEY;
const PIPELINE_ID = process.env.GHL_PIPELINE_ID || 'LJRdYcKYMRpdENWIEjwU';
const PIPELINE_NAME = process.env.GHL_PIPELINE_NAME || 'Sales Pipeline';

function assertEnv() {
  if (!PROXY_URL || !PROXY_ANON_KEY) {
    throw new Error(
      'GHL_PROXY_URL and GHL_PROXY_ANON_KEY must be configured to reach the GHL proxy edge function.',
    );
  }
}

function authHeaders() {
  return {
    Authorization: `Bearer ${PROXY_ANON_KEY}`,
    Accept: 'application/json',
  };
}

type ProxyContact = {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  fullNameLowerCase?: string;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  tags?: string[];
  dateAdded?: string;
  lastActivityDate?: string | null;
};

type ProxyOpportunity = {
  id: string;
  name: string;
  monetaryValue?: number;
  pipelineId: string;
  pipelineStageId: string;
  status: string;
  assignedTo?: string | null;
  lastStatusChangeAt?: string | null;
  createdAt: string;
  updatedAt: string;
  contactId: string;
  contact?: Partial<ProxyContact>;
  relations?: Array<{
    contactName?: string;
    email?: string | null;
    phone?: string | null;
    companyName?: string | null;
    tags?: string[];
  }>;
};

type OpportunitiesResponse = {
  opportunities: ProxyOpportunity[];
  meta?: {
    total?: number;
    nextPage?: string;
    startAfterId?: string;
  };
};

type ContactResponse = {
  contact: ProxyContact;
};

type ProxyStage = {
  id: string;
  name: string;
  order?: number;
  pipelineId?: string;
};

type PipelineResponse = {
  id: string;
  name: string;
  stages: ProxyStage[];
};

async function proxyFetch<T>(action: string, params?: Record<string, string>): Promise<T> {
  assertEnv();
  const url = new URL(PROXY_URL!);
  url.searchParams.set('action', action);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString(), {
    headers: authHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Proxy ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

function splitName(full?: string): { firstName: string; lastName: string } {
  if (!full) return { firstName: '', lastName: '' };
  const parts = full.trim().split(/\s+/);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || '',
  };
}

export async function getOpportunities(): Promise<LegacyGhlOpportunity[]> {
  const data = await proxyFetch<OpportunitiesResponse>('opportunities', {
    pipeline_id: PIPELINE_ID,
  });
  const rows = data.opportunities || [];
  return rows.map((o) => {
    const rel = o.relations?.[0];
    const c = o.contact || {};
    const contactName = c.name || rel?.contactName || o.name;
    const { firstName, lastName } = splitName(contactName);
    return {
      id: o.id,
      name: o.name,
      pipelineId: o.pipelineId,
      stageId: o.pipelineStageId,
      status: (o.status as LegacyGhlOpportunity['status']) || 'open',
      contactId: o.contactId,
      contactName: contactName,
      contactEmail: c.email ?? rel?.email ?? null,
      contactPhone: c.phone ?? rel?.phone ?? null,
      contactCompany: c.companyName ?? rel?.companyName ?? null,
      contactTags: c.tags ?? rel?.tags ?? [],
      monetaryValue: o.monetaryValue || 0,
      assignedTo: o.assignedTo ?? null,
      lastStatusChangeAt: o.lastStatusChangeAt ?? null,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    };
  });
}

export async function getPipeline(opps: LegacyGhlOpportunity[]): Promise<LegacyGhlPipeline> {
  // Known BBR Boat Rentals pipeline stages in order
  const knownStages: LegacyGhlStage[] = [
    { id: 'stage-new-booking', name: 'New Booking', order: 0, pipelineId: PIPELINE_ID },
    { id: 'stage-captain-review', name: 'Captain Review', order: 1, pipelineId: PIPELINE_ID },
    { id: 'stage-charter-in-progress', name: 'Charter in Progress', order: 2, pipelineId: PIPELINE_ID },
    { id: 'stage-charter-complete', name: 'Charter Complete', order: 3, pipelineId: PIPELINE_ID },
    { id: 'stage-cancelled', name: 'Cancelled', order: 4, pipelineId: PIPELINE_ID },
  ];

  try {
    const data = await proxyFetch<PipelineResponse>('pipeline', {
      pipeline_id: PIPELINE_ID,
    });
    if (data.stages && data.stages.length > 0) {
      const stages: LegacyGhlStage[] = data.stages.map((s, i) => ({
        id: s.id,
        name: s.name,
        order: s.order ?? i,
        pipelineId: PIPELINE_ID,
      }));
      return { id: data.id || PIPELINE_ID, name: data.name || PIPELINE_NAME, stages };
    }
  } catch {
    // fall through to fallback
  }

  // Fallback: use known stages, but replace with real stage IDs from opportunities
  const stageIdsFromOpps = Array.from(new Set(opps.map((o) => o.stageId)));
  if (stageIdsFromOpps.length === 1) {
    // All opps in one stage — map that real ID to the first known stage
    return {
      id: PIPELINE_ID,
      name: PIPELINE_NAME,
      stages: knownStages.map((s, i) =>
        i === 0 ? { ...s, id: stageIdsFromOpps[0] } : s,
      ),
    };
  }

  // Multiple stage IDs from opps — build stages from them, preserving known names where possible
  if (stageIdsFromOpps.length > 1) {
    return {
      id: PIPELINE_ID,
      name: PIPELINE_NAME,
      stages: stageIdsFromOpps.map((id, i) => ({
        id,
        name: knownStages[i]?.name || `Stage ${i + 1}`,
        order: i,
        pipelineId: PIPELINE_ID,
      })),
    };
  }

  return { id: PIPELINE_ID, name: PIPELINE_NAME, stages: knownStages };
}

export async function getContacts(
  opps: LegacyGhlOpportunity[],
): Promise<LegacyGhlContact[]> {
  const seen = new Set<string>();
  const contacts: LegacyGhlContact[] = [];
  for (const o of opps) {
    if (!o.contactId || seen.has(o.contactId)) continue;
    seen.add(o.contactId);
    const { firstName, lastName } = splitName(o.contactName);
    contacts.push({
      id: o.contactId,
      firstName,
      lastName,
      email: o.contactEmail,
      phone: o.contactPhone,
      companyName: o.contactCompany,
      tags: o.contactTags,
      dateAdded: o.createdAt,
      lastActivityDate: o.updatedAt,
    });
  }
  return contacts;
}

export async function getContactDetail(contactId: string): Promise<LegacyGhlContact | null> {
  try {
    const data = await proxyFetch<ContactResponse>('contact', {
      contact_id: contactId,
    });
    const c = data.contact;
    const { firstName, lastName } = splitName(c.name);
    return {
      id: c.id,
      firstName: c.firstName || firstName,
      lastName: c.lastName || lastName,
      email: c.email ?? null,
      phone: c.phone ?? null,
      companyName: c.companyName ?? null,
      tags: c.tags ?? [],
      dateAdded: c.dateAdded ?? new Date().toISOString(),
      lastActivityDate: c.lastActivityDate ?? null,
    };
  } catch {
    return null;
  }
}
