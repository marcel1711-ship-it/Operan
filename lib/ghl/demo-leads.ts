const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';
const GHL_TIMEOUT_MS = 15_000;

const GHL_CONFIG = {
  locationId: '6iOjyjWVtQbodqnFu7pp',
  pipelineId: 'lZ28JMZ7JBiC0fxGX5le',
  stageId: '3d0cbe02-ab8a-4fe4-aff8-21822c259e5a',
  calendarId: '4U9zYraJKM0GV1zLZEQs',
  customFields: {
    fleetSize: 'bXVgY6LDxNrQlDuHbB9e',
    multiOwnerFleet: 'ENRJe7Ng5qAAunRVUsLB',
    bookingManagement: 'ieUoqkFr3KsNeNZJFT0n',
    biggestChallenge: 'fvZIxR2bqa7DVBQ2ocRS',
    leadSource: '6p2zHAn8WAZhZWIyeh5w',
  },
} as const;

export type DemoLeadPayload = {
  firstName: string;
  companyName: string;
  email: string;
  phone: string;
  fleetSize: string;
  multiOwnerFleet: string;
  bookingManagement: string[];
  biggestChallenge: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  source: string | null;
  pageUrl: string | null;
  submittedAt: string;
};

export type GHLResult = {
  success: boolean;
  contactId?: string;
  opportunityId?: string;
  existingOpportunity?: boolean;
  error?: string;
};

function getToken(): string {
  const token = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
  if (!token) throw new Error('GHL_PRIVATE_INTEGRATION_TOKEN is not configured');
  return token;
}

async function ghlFetch(path: string, options: { method: string; body?: Record<string, unknown> }): Promise<Response> {
  const token = getToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GHL_TIMEOUT_MS);

  try {
    const res = await fetch(`${GHL_BASE}${path}`, {
      method: options.method,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Version: GHL_API_VERSION,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

async function upsertContact(lead: DemoLeadPayload): Promise<string> {
  const resolvedSource = lead.source || 'Website Demo';
  const tags = ['operan-demo'];
  if (lead.source === 'founding-operator') tags.push('operan-founding-operator');

  const customFields: Array<{ id: string; value: string | string[] }> = [
    { id: GHL_CONFIG.customFields.fleetSize, value: lead.fleetSize },
    { id: GHL_CONFIG.customFields.multiOwnerFleet, value: lead.multiOwnerFleet },
    { id: GHL_CONFIG.customFields.bookingManagement, value: lead.bookingManagement },
    { id: GHL_CONFIG.customFields.leadSource, value: resolvedSource },
  ];
  if (lead.biggestChallenge) {
    customFields.push({ id: GHL_CONFIG.customFields.biggestChallenge, value: lead.biggestChallenge });
  }

  const contactBody: Record<string, unknown> = {
    locationId: GHL_CONFIG.locationId,
    firstName: lead.firstName,
    companyName: lead.companyName,
    email: lead.email,
    phone: lead.phone,
    tags,
    customFields,
    source: resolvedSource,
  };

  const res = await ghlFetch('/contacts/upsert', { method: 'POST', body: contactBody });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error('[ghl] Contact upsert failed:', res.status, errBody);
    throw new Error(`GHL contact upsert failed (${res.status})`);
  }

  const data = await res.json();
  const contactId = data?.contact?.id;
  if (!contactId) {
    console.error('[ghl] No contactId in upsert response');
    throw new Error('GHL contact upsert returned no contactId');
  }

  console.log('[ghl] Contact upserted:', contactId);
  return contactId;
}

async function findExistingOpportunity(contactId: string): Promise<{ id: string; stageId: string } | null> {
  const params = new URLSearchParams({
    location_id: GHL_CONFIG.locationId,
    contact_id: contactId,
    pipeline_id: GHL_CONFIG.pipelineId,
    status: 'open',
  });

  const res = await ghlFetch(`/opportunities/search?${params}`, { method: 'GET' });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error('[ghl] Opportunity search failed:', res.status, errBody);
    return null;
  }

  const data = await res.json();
  const opportunities = data?.opportunities;
  if (Array.isArray(opportunities) && opportunities.length > 0) {
    return { id: opportunities[0].id, stageId: opportunities[0].pipelineStageId };
  }
  return null;
}

async function createOpportunity(contactId: string, lead: DemoLeadPayload): Promise<string> {
  const oppName = `${lead.firstName} — ${lead.companyName} — OPERAN Demo`;

  const oppBody = {
    locationId: GHL_CONFIG.locationId,
    pipelineId: GHL_CONFIG.pipelineId,
    pipelineStageId: GHL_CONFIG.stageId,
    contactId,
    name: oppName,
    status: 'open',
    monetaryValue: 0,
  };

  const res = await ghlFetch('/opportunities/', { method: 'POST', body: oppBody });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error('[ghl] Opportunity creation failed:', res.status, errBody);
    throw new Error(`GHL opportunity creation failed (${res.status})`);
  }

  const data = await res.json();
  const oppId = data?.opportunity?.id;
  if (!oppId) {
    console.error('[ghl] No opportunityId in creation response');
    throw new Error('GHL opportunity creation returned no ID');
  }

  console.log('[ghl] Opportunity created:', oppId);
  return oppId;
}

export async function submitDemoLead(lead: DemoLeadPayload): Promise<GHLResult> {
  const contactId = await upsertContact(lead);

  let opportunityId: string | undefined;
  let existingOpportunity = false;

  try {
    const existing = await findExistingOpportunity(contactId);

    if (existing) {
      console.log('[ghl] Existing open opportunity found:', existing.id, 'stage:', existing.stageId);
      opportunityId = existing.id;
      existingOpportunity = true;
    } else {
      opportunityId = await createOpportunity(contactId, lead);
    }
  } catch (oppErr) {
    console.error('[ghl] Opportunity step failed (contact was created):', oppErr instanceof Error ? oppErr.message : oppErr);
    return { success: true, contactId, error: 'Contact created but opportunity step failed' };
  }

  return { success: true, contactId, opportunityId, existingOpportunity };
}
