import { supabaseAdmin } from '@/lib/supabase-server';
import { decrypt } from './crypto';
import { resolveCredential, hasCredential } from './credential-resolver';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

export async function getGoogleClientIdAsync(tenantId?: string): Promise<string | null> {
  if (tenantId) {
    const tenantCreds = await getTenantGoogleCredentials(tenantId);
    if (tenantCreds?.client_id) return tenantCreds.client_id;
  }
  return await resolveCredential('google_calendar', 'GOOGLE_CLIENT_ID', 'production');
}

export async function getGoogleClientSecretAsync(tenantId?: string): Promise<string | null> {
  if (tenantId) {
    const tenantCreds = await getTenantGoogleCredentials(tenantId);
    if (tenantCreds?.client_secret) return tenantCreds.client_secret;
  }
  return await resolveCredential('google_calendar', 'GOOGLE_CLIENT_SECRET', 'production');
}

export async function isGoogleCalendarConfiguredAsync(tenantId?: string): Promise<boolean> {
  if (tenantId) {
    const tenantCreds = await getTenantGoogleCredentials(tenantId);
    if (tenantCreds?.client_id && tenantCreds?.client_secret) return true;
  }
  return await hasCredential('google_calendar', 'GOOGLE_CLIENT_ID', 'production') &&
         await hasCredential('google_calendar', 'GOOGLE_CLIENT_SECRET', 'production');
}

async function getTenantGoogleCredentials(tenantId: string): Promise<{ client_id: string; client_secret: string } | null> {
  try {
    const { data } = await supabaseAdmin
      .from('tenant_integrations')
      .select('credentials')
      .eq('tenant_id', tenantId)
      .eq('category', 'calendar')
      .eq('provider', 'google_calendar')
      .maybeSingle();
    if (data?.credentials) {
      const creds = data.credentials as Record<string, string>;
      if (creds.google_client_id && creds.google_client_secret) {
        return { client_id: creds.google_client_id, client_secret: creds.google_client_secret };
      }
    }
  } catch {}
  return null;
}

type CalendarConnection = {
  id: string;
  tenant_id: string;
  encrypted_credentials: Buffer;
  selected_calendar_id: string | null;
  calendar_name: string | null;
  event_title_template: string | null;
  event_description_template: string | null;
  include_customer_details: boolean;
  include_meeting_point: boolean;
  create_on_confirm: boolean;
  update_on_change: boolean;
  cancel_on_reservation_cancel: boolean;
  block_availability_from_external: boolean;
  token_expires_at: string | null;
  connection_status: string;
};

type DecryptedTokens = {
  access_token: string;
  refresh_token: string | null;
  expiry_date: number | null;
};

async function getDecryptedTokens(connection: CalendarConnection): Promise<DecryptedTokens | null> {
  try {
    const decrypted = decrypt(connection.encrypted_credentials);
    return JSON.parse(decrypted) as DecryptedTokens;
  } catch (err) {
    console.error('[google-calendar] Failed to decrypt tokens:', err);
    return null;
  }
}

async function refreshAccessToken(connection: CalendarConnection, tokens: DecryptedTokens): Promise<DecryptedTokens | null> {
  if (!tokens.refresh_token) return null;

  const clientId = await getGoogleClientIdAsync(connection.tenant_id);
  const clientSecret = await getGoogleClientSecretAsync(connection.tenant_id);
  if (!clientId || !clientSecret) return null;

  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokens.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      console.error('[google-calendar] Token refresh failed:', response.status);
      return null;
    }

    const data = await response.json();
    const newTokens: DecryptedTokens = {
      access_token: data.access_token,
      refresh_token: tokens.refresh_token, // refresh token stays the same
      expiry_date: data.expires_in ? Date.now() + data.expires_in * 1000 : null,
    };

    // Store the refreshed tokens
    const newCredentialsJson = JSON.stringify(newTokens);
    const { encrypt } = await import('./crypto');
    const encrypted = encrypt(newCredentialsJson);

    await supabaseAdmin
      .from('tenant_calendar_connections')
      .update({
        encrypted_credentials: encrypted,
        token_expires_at: newTokens.expiry_date ? new Date(newTokens.expiry_date).toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id);

    return newTokens;
  } catch (err) {
    console.error('[google-calendar] Token refresh error:', err);
    return null;
  }
}

async function getValidAccessToken(connection: CalendarConnection): Promise<string | null> {
  const tokens = await getDecryptedTokens(connection);
  if (!tokens) return null;

  // Check if token is expired (or will expire in the next 60 seconds)
  const isExpired = !tokens.expiry_date || tokens.expiry_date <= Date.now() + 60000;

  if (isExpired && tokens.refresh_token) {
    const refreshed = await refreshAccessToken(connection, tokens);
    return refreshed?.access_token || null;
  }

  return tokens.access_token;
}

export async function getCalendarList(tenantId: string): Promise<{ calendars: Array<{ id: string; name: string; timeZone: string }> | null; error: string | null }> {
  const { data: connection } = await supabaseAdmin
    .from('tenant_calendar_connections')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('provider', 'google_calendar')
    .neq('connection_status', 'disconnected')
    .maybeSingle() as { data: CalendarConnection | null };

  if (!connection) return { calendars: null, error: 'Google Calendar is not connected' };

  const accessToken = await getValidAccessToken(connection);
  if (!accessToken) {
    await markConnectionError(tenantId, 'Authorization expired. Please reconnect your Google account.');
    return { calendars: null, error: 'Authorization expired. Please reconnect.' };
  }

  try {
    const response = await fetch(`${GOOGLE_CALENDAR_API}/users/me/calendarList?maxResults=100`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.status === 401) {
      await markConnectionError(tenantId, 'Google authorization was revoked. Please reconnect.');
      return { calendars: null, error: 'Authorization revoked. Please reconnect.' };
    }

    if (!response.ok) {
      return { calendars: null, error: 'Failed to retrieve calendar list' };
    }

    const data = await response.json();
    const calendars = (data.items || []).map((c: { id: string; summary: string; timeZone?: string }) => ({
      id: c.id,
      name: c.summary,
      timeZone: c.timeZone || 'UTC',
    }));

    return { calendars, error: null };
  } catch (err) {
    console.error('[google-calendar] getCalendarList error:', err);
    return { calendars: null, error: 'Failed to retrieve calendars' };
  }
}

export async function selectCalendar(tenantId: string, calendarId: string, calendarName: string, calendarTimezone?: string): Promise<{ success: boolean; error: string | null }> {
  const { error } = await supabaseAdmin
    .from('tenant_calendar_connections')
    .update({
      selected_calendar_id: calendarId,
      calendar_name: calendarName,
      calendar_timezone: calendarTimezone || null,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('provider', 'google_calendar');

  if (error) return { success: false, error: 'Failed to select calendar' };

  await supabaseAdmin.rpc('log_integration_activity', {
    p_tenant_id: tenantId,
    p_category: 'calendar',
    p_provider: 'google_calendar',
    p_action: 'calendar_selected',
    p_status: 'success',
    p_message: `Selected calendar: ${calendarName}`,
  });

  return { success: true, error: null };
}

export async function syncReservationToCalendar(
  tenantId: string,
  reservationId: string,
  action: 'create' | 'update' | 'cancel'
): Promise<{ success: boolean; error: string | null }> {
  const { data: connection } = await supabaseAdmin
    .from('tenant_calendar_connections')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('provider', 'google_calendar')
    .eq('connection_status', 'connected')
    .maybeSingle() as { data: CalendarConnection | null };

  if (!connection) return { success: false, error: 'Google Calendar is not connected' };
  if (!connection.selected_calendar_id) return { success: false, error: 'No calendar selected' };

  const accessToken = await getValidAccessToken(connection);
  if (!accessToken) {
    await markConnectionError(tenantId, 'Authorization expired. Please reconnect.');
    return { success: false, error: 'Authorization expired' };
  }

  // Fetch reservation details
  const { data: reservation } = await supabaseAdmin
    .from('reservations')
    .select(`
      id, booking_reference, status, start_date, end_date,
      customer_id, customers(full_name, email, phone),
      listing_id, listings(name, meeting_point),
      total_amount, currency
    `)
    .eq('id', reservationId)
    .maybeSingle() as { data: Record<string, unknown> | null };

  if (!reservation) return { success: false, error: 'Reservation not found' };

  const customer = reservation.customers as { full_name?: string; email?: string; phone?: string } | null;
  const listing = reservation.listings as { name?: string; meeting_point?: string } | null;
  const customerName = customer?.full_name || 'Guest';
  const listingName = listing?.name || 'Booking';

  // Build event from template
  const titleTemplate = connection.event_title_template || 'Booking: {{customer_name}}';
  const title = titleTemplate
    .replace('{{customer_name}}', customerName)
    .replace('{{listing_name}}', listingName)
    .replace('{{booking_reference}}', reservation.booking_reference as string || '');

  let description = '';
  if (connection.event_description_template) {
    description = connection.event_description_template
      .replace('{{customer_name}}', customerName)
      .replace('{{listing_name}}', listingName)
      .replace('{{booking_reference}}', reservation.booking_reference as string || '');
  } else if (connection.include_customer_details) {
    description = `Booking Ref: ${reservation.booking_reference}\nCustomer: ${customerName}`;
    if (customer?.email) description += `\nEmail: ${customer.email}`;
    if (customer?.phone) description += `\nPhone: ${customer.phone}`;
  }
  if (connection.include_meeting_point && listing?.meeting_point) {
    description += `\nMeeting Point: ${listing.meeting_point}`;
  }

  const startDate = reservation.start_date as string;
  const endDate = reservation.end_date as string;
  const calendarId = connection.selected_calendar_id;

  try {
    if (action === 'create') {
      // Check if event already exists
      const { data: existing } = await supabaseAdmin
        .from('reservations')
        .select('google_calendar_event_id')
        .eq('id', reservationId)
        .maybeSingle();

      if (existing?.google_calendar_event_id) {
        // Event already created, do update instead
        return syncReservationToCalendar(tenantId, reservationId, 'update');
      }

      const event = {
        summary: title,
        description,
        start: { date: startDate?.replace(/-/g, '') },
        end: { date: endDate ? new Date(new Date(endDate).getTime() + 86400000).toISOString().split('T')[0].replace(/-/g, '') : startDate?.replace(/-/g, '') },
        extendedProperties: {
          private: {
            reservationId: reservationId,
            tenantId: tenantId,
            bookingReference: reservation.booking_reference as string,
          },
        },
      };

      const response = await fetch(`${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });

      if (response.status === 401) {
        await markConnectionError(tenantId, 'Authorization revoked. Please reconnect.');
        return { success: false, error: 'Authorization revoked' };
      }

      if (!response.ok) {
        const errBody = await response.text();
        console.error('[google-calendar] Create event failed:', response.status, errBody);
        return { success: false, error: `Failed to create event (${response.status})` };
      }

      const createdEvent = await response.json();

      // Save the event ID
      await supabaseAdmin
        .from('reservations')
        .update({ google_calendar_event_id: createdEvent.id })
        .eq('id', reservationId);

      await supabaseAdmin.rpc('log_integration_activity', {
        p_tenant_id: tenantId,
        p_category: 'calendar',
        p_provider: 'google_calendar',
        p_action: 'event_created',
        p_status: 'success',
        p_message: `Created calendar event for booking ${reservation.booking_reference}`,
        p_metadata: { reservation_id: reservationId, event_id: createdEvent.id },
      });

      return { success: true, error: null };
    }

    if (action === 'update') {
      const { data: res } = await supabaseAdmin
        .from('reservations')
        .select('google_calendar_event_id')
        .eq('id', reservationId)
        .maybeSingle();

      const eventId = res?.google_calendar_event_id;
      if (!eventId) {
        // No event to update, create instead
        return syncReservationToCalendar(tenantId, reservationId, 'create');
      }

      const event = {
        summary: title,
        description,
        start: { date: startDate?.replace(/-/g, '') },
        end: { date: endDate ? new Date(new Date(endDate).getTime() + 86400000).toISOString().split('T')[0].replace(/-/g, '') : startDate?.replace(/-/g, '') },
      };

      const response = await fetch(`${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });

      if (response.status === 401) {
        await markConnectionError(tenantId, 'Authorization revoked. Please reconnect.');
        return { success: false, error: 'Authorization revoked' };
      }

      if (!response.ok) {
        console.error('[google-calendar] Update event failed:', response.status);
        return { success: false, error: `Failed to update event (${response.status})` };
      }

      await supabaseAdmin.rpc('log_integration_activity', {
        p_tenant_id: tenantId,
        p_category: 'calendar',
        p_provider: 'google_calendar',
        p_action: 'event_updated',
        p_status: 'success',
        p_message: `Updated calendar event for booking ${reservation.booking_reference}`,
        p_metadata: { reservation_id: reservationId, event_id: eventId },
      });

      return { success: true, error: null };
    }

    if (action === 'cancel') {
      const { data: res } = await supabaseAdmin
        .from('reservations')
        .select('google_calendar_event_id')
        .eq('id', reservationId)
        .maybeSingle();

      const eventId = res?.google_calendar_event_id;
      if (!eventId) return { success: true, error: null }; // No event to cancel

      const response = await fetch(`${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (response.status === 401) {
        await markConnectionError(tenantId, 'Authorization revoked. Please reconnect.');
        return { success: false, error: 'Authorization revoked' };
      }

      // 404 means already deleted — that's fine
      if (!response.ok && response.status !== 404) {
        console.error('[google-calendar] Cancel event failed:', response.status);
        return { success: false, error: `Failed to cancel event (${response.status})` };
      }

      // Clear the event ID
      await supabaseAdmin
        .from('reservations')
        .update({ google_calendar_event_id: null })
        .eq('id', reservationId);

      await supabaseAdmin.rpc('log_integration_activity', {
        p_tenant_id: tenantId,
        p_category: 'calendar',
        p_provider: 'google_calendar',
        p_action: 'event_cancelled',
        p_status: 'success',
        p_message: `Cancelled calendar event for booking ${reservation.booking_reference}`,
        p_metadata: { reservation_id: reservationId, event_id: eventId },
      });

      return { success: true, error: null };
    }

    return { success: false, error: 'Unknown action' };
  } catch (err) {
    console.error('[google-calendar] syncReservationToCalendar error:', err);
    return { success: false, error: 'Failed to sync with Google Calendar' };
  }
}

export async function syncExternalBusyBlocks(tenantId: string): Promise<{ success: boolean; blocksCreated: number; error: string | null }> {
  const { data: connection } = await supabaseAdmin
    .from('tenant_calendar_connections')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('provider', 'google_calendar')
    .eq('connection_status', 'connected')
    .maybeSingle() as { data: CalendarConnection | null };

  if (!connection) return { success: false, blocksCreated: 0, error: 'Not connected' };
  if (!connection.block_availability_from_external) return { success: true, blocksCreated: 0, error: null };
  if (!connection.selected_calendar_id) return { success: false, blocksCreated: 0, error: 'No calendar selected' };

  const accessToken = await getValidAccessToken(connection);
  if (!accessToken) return { success: false, blocksCreated: 0, error: 'Authorization expired' };

  // Get the tenant's listings
  const { data: listings } = await supabaseAdmin
    .from('listings')
    .select('id')
    .eq('tenant_id', tenantId);

  if (!listings || listings.length === 0) return { success: true, blocksCreated: 0, error: null };

  // Query busy periods from Google Calendar for the next 90 days
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const response = await fetch(`${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(connection.selected_calendar_id)}/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&maxResults=250`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) return { success: false, blocksCreated: 0, error: 'Failed to fetch calendar events' };

    const data = await response.json();
    const events = (data.items || []).filter((e: { start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }) => 
      e.start?.dateTime || e.start?.date
    );

    let blocksCreated = 0;

    for (const event of events) {
      // Skip events that are our own (created by OPERAN)
      if (event.extendedProperties?.private?.reservationId) continue;

      const externalUid = event.id;
      const startAt = event.start?.dateTime || event.start?.date;
      const endAt = event.end?.dateTime || event.end?.date;
      const isAllDay = !event.start?.dateTime;

      // Create blocks on all listings for this tenant
      for (const listing of listings) {
        const { error: blockError } = await supabaseAdmin
          .from('listing_availability_blocks')
          .upsert({
            tenant_id: tenantId,
            listing_id: listing.id,
            source_type: 'google_calendar',
            source_id: connection.id,
            external_uid: externalUid,
            title: event.summary || 'Busy (External)',
            start_at: startAt,
            end_at: endAt,
            is_all_day: isAllDay,
            status: 'active',
            raw_data: { source: 'google_calendar', event_id: externalUid },
          }, { onConflict: 'tenant_id,listing_id,external_uid' });

        if (!blockError) blocksCreated++;
      }
    }

    await supabaseAdmin
      .from('tenant_calendar_connections')
      .update({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', connection.id);

    await supabaseAdmin.rpc('log_integration_activity', {
      p_tenant_id: tenantId,
      p_category: 'calendar',
      p_provider: 'google_calendar',
      p_action: 'busy_blocks_synced',
      p_status: 'success',
      p_message: `Synced ${blocksCreated} external busy blocks`,
      p_metadata: { events_count: events.length, blocks_created: blocksCreated },
    });

    return { success: true, blocksCreated, error: null };
  } catch (err) {
    console.error('[google-calendar] syncExternalBusyBlocks error:', err);
    return { success: false, blocksCreated: 0, error: 'Failed to sync busy blocks' };
  }
}

export async function disconnectCalendar(tenantId: string): Promise<{ success: boolean; error: string | null }> {
  const { error } = await supabaseAdmin
    .from('tenant_calendar_connections')
    .update({ connection_status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('provider', 'google_calendar');

  if (error) return { success: false, error: 'Failed to disconnect' };

  await supabaseAdmin
    .from('tenant_integrations')
    .update({ connection_status: 'disconnected', enabled: false, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('category', 'calendar')
    .eq('provider', 'google_calendar');

  // Remove external busy blocks from Google Calendar
  await supabaseAdmin
    .from('listing_availability_blocks')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('source_type', 'google_calendar')
    .eq('status', 'active');

  await supabaseAdmin.rpc('log_integration_activity', {
    p_tenant_id: tenantId,
    p_category: 'calendar',
    p_provider: 'google_calendar',
    p_action: 'disconnected',
    p_status: 'info',
    p_message: 'Google Calendar disconnected',
  });

  return { success: true, error: null };
}

async function markConnectionError(tenantId: string, message: string): Promise<void> {
  await supabaseAdmin
    .from('tenant_calendar_connections')
    .update({ connection_status: 'requires_action', updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('provider', 'google_calendar');

  await supabaseAdmin
    .from('tenant_integrations')
    .update({ connection_status: 'requires_action', updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('category', 'calendar')
    .eq('provider', 'google_calendar');

  await supabaseAdmin.rpc('log_integration_activity', {
    p_tenant_id: tenantId,
    p_category: 'calendar',
    p_provider: 'google_calendar',
    p_action: 'auth_error',
    p_status: 'failed',
    p_message: message,
  });
}
