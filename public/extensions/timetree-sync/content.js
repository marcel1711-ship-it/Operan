const SUPABASE_URL = 'https://zxflexiywouechzvapbi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4ZmxleGl5d291ZWNoenZhcGJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2MTg0NzIsImV4cCI6MjEwMTE5NDQ3Mn0.S_3qRYtN_xK4sRVZUcEUdCgIlcZQ-8Zq3t9NVJUwVU0';
const SYNC_INTERVAL_MS = 5 * 60 * 1000;
const CHARTER_TIMEZONE = 'America/New_York';

function toCharterTimezoneISO(year, month, day, hours, minutes) {
  const pad = (n) => String(n).padStart(2, '0');
  const naive = `${year}-${pad(month + 1)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:00`;
  const d = new Date(naive + 'Z');
  const inTZ = new Date(d.toLocaleString('en-US', { timeZone: CHARTER_TIMEZONE }));
  const offsetMs = d.getTime() - inTZ.getTime();
  const totalMin = Math.round(offsetMs / 60000);
  const sign = totalMin >= 0 ? '+' : '-';
  const absMin = Math.abs(totalMin);
  const offH = Math.floor(absMin / 60);
  const offM = absMin % 60;
  return `${naive}${sign}${pad(offH)}:${pad(offM)}`;
}

let syncTimer = null;
let lastSyncTime = null;
let isSyncing = false;

function getCalendarUrl() {
  const match = window.location.href.match(/timetreeapp\.com\/calendars\/([^/?#]+)/);
  return match ? `https://timetreeapp.com/calendars/${match[1]}` : null;
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function detectMonthYear() {
  const allEls = document.querySelectorAll('nav *, header *, [role="navigation"] *, span, div, p');
  for (const el of allEls) {
    const text = (el.innerText || el.textContent || '').trim();
    const match = text.match(/^(January|February|March|April|May|June|July|August|September|October|November|December),?\s*(\d{4})$/);
    if (match) {
      const months = { January: 0, February: 1, March: 2, April: 3, May: 4, June: 5, July: 6, August: 7, September: 8, October: 9, November: 10, December: 11 };
      return { month: months[match[1]], year: parseInt(match[2]) };
    }
  }
  return null;
}

function findEventButtons() {
  const timePattern = /\d{1,2}:\d{2}\s*(AM|PM)/i;
  const buttons = [];
  document.querySelectorAll('button').forEach(btn => {
    const spans = btn.querySelectorAll('span, div, p');
    const allText = Array.from(spans).map(t => t.textContent.trim()).filter(t => t.length > 0);
    const hasTime = allText.some(t => timePattern.test(t));
    if (hasTime && allText.length >= 2) {
      const title = allText.find(t => !timePattern.test(t)) || allText[0];
      buttons.push({ element: btn, title });
    }
  });
  return buttons;
}

function parseDetailPanel() {
  const allEls = document.querySelectorAll('*');
  for (const el of allEls) {
    const text = (el.innerText || el.textContent || '').trim();
    // Pattern: "Mon, Aug 4 20264:00PMMon, Aug 4 20268:00PM" or similar
    const match = text.match(
      /(\w+),\s+(\w+)\s+(\d{1,2})\s+(\d{4})\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*\w+,\s+\w+\s+\d{1,2}\s+\d{4}\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i
    );
    if (match) {
      const monthNames = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
      const month = monthNames[match[2].substring(0, 3)];
      const day = parseInt(match[3]);
      const year = parseInt(match[4]);

      let startH = parseInt(match[5]);
      const startM = parseInt(match[6]);
      const startAP = match[7].toUpperCase();
      if (startAP === 'PM' && startH !== 12) startH += 12;
      if (startAP === 'AM' && startH === 12) startH = 0;

      let endH = parseInt(match[8]);
      const endM = parseInt(match[9]);
      const endAP = match[10].toUpperCase();
      if (endAP === 'PM' && endH !== 12) endH += 12;
      if (endAP === 'AM' && endH === 12) endH = 0;

      const startISO = toCharterTimezoneISO(year, month, day, startH, startM);
      const startDate = new Date(startISO);
      let endISO = toCharterTimezoneISO(year, month, day, endH, endM);
      let endDate = new Date(endISO);
      if (endDate <= startDate) {
        endISO = toCharterTimezoneISO(year, month, day + 1, endH, endM);
        endDate = new Date(endISO);
      }

      return { startDate, endDate, startISO, endISO, month, day, year };
    }
  }
  return null;
}

function closeDetailPanel() {
  const closeButtons = document.querySelectorAll('button');
  for (const btn of closeButtons) {
    const ariaLabel = btn.getAttribute('aria-label') || '';
    const text = (btn.textContent || '').trim();
    if (ariaLabel === 'Close' || text === 'Close') {
      const rect = btn.getBoundingClientRect();
      if (rect.width > 0 && rect.width < 60) {
        btn.click();
        return true;
      }
    }
  }
  // Try pressing Escape
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return true;
}

async function extractEventsWithDetails() {
  const monthYear = detectMonthYear();
  if (!monthYear) {
    console.log('[OPERAN Sync] Could not detect month/year');
    return [];
  }
  console.log(`[OPERAN Sync] Detected month: ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][monthYear.month]} ${monthYear.year}`);

  const eventButtons = findEventButtons();
  console.log(`[OPERAN Sync] Found ${eventButtons.length} event buttons, reading details...`);

  const events = [];

  for (let i = 0; i < eventButtons.length; i++) {
    const { element, title } = eventButtons[i];

    // Click the event to open detail panel
    element.click();
    await wait(800);

    // Read the detail panel
    const detail = parseDetailPanel();

    if (detail) {
      const { startDate, endDate, startISO, endISO } = detail;
      const externalId = `tt_${startDate.getFullYear()}${String(startDate.getMonth() + 1).padStart(2, '0')}${String(startDate.getDate()).padStart(2, '0')}_${String(startDate.getHours()).padStart(2, '0')}${String(startDate.getMinutes()).padStart(2, '0')}_${title.replace(/\s+/g, '_').substring(0, 30)}`;

      const durationH = Math.round((endDate - startDate) / (1000 * 60 * 60) * 10) / 10;
      console.log(`[OPERAN Sync]   ${i + 1}/${eventButtons.length} "${title}" → ${startISO} - ${endISO} (${durationH}h)`);

      events.push({
        title,
        external_id: externalId,
        start_at: startISO,
        end_at: endISO
      });
    } else {
      console.log(`[OPERAN Sync]   ${i + 1}/${eventButtons.length} "${title}" → could not read details, using 4h default`);
      // Fallback: use position-based date with 4h default
      const rect = element.getBoundingClientRect();
      events.push({
        title,
        external_id: `tt_fallback_${i}_${title.replace(/\s+/g, '_').substring(0, 30)}`,
        start_at: new Date().toISOString(),
        end_at: new Date(Date.now() + 4 * 3600000).toISOString()
      });
    }

    // Close the detail panel
    closeDetailPanel();
    await wait(400);
  }

  return events;
}

async function syncToOperan(events) {
  const calendarUrl = getCalendarUrl();
  if (!calendarUrl || events.length === 0) return null;

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/sync_external_calendar_events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify({
      p_calendar_url: calendarUrl,
      p_events: events
    })
  });

  return response.json();
}

async function runSync() {
  if (isSyncing) {
    console.log('[OPERAN Sync] Already syncing, skipping...');
    return;
  }
  isSyncing = true;

  try {
    const events = await extractEventsWithDetails();
    if (events.length === 0) {
      console.log('[OPERAN Sync] No events found on page');
      isSyncing = false;
      return;
    }

    console.log(`[OPERAN Sync] Syncing ${events.length} events to OPERAN...`);
    const result = await syncToOperan(events);
    lastSyncTime = new Date();

    if (result && result.success) {
      console.log(`[OPERAN Sync] ✓ Success: ${result.inserted} new, ${result.updated} updated, ${result.skipped} skipped → ${result.listing_name}`);
    } else {
      console.log('[OPERAN Sync] Error:', result?.error || 'Unknown error');
    }

    chrome.runtime.sendMessage({
      type: 'SYNC_RESULT',
      data: { ...result, eventCount: events.length, syncTime: lastSyncTime.toISOString() }
    });
  } catch (err) {
    console.error('[OPERAN Sync] Failed:', err.message);
  }

  isSyncing = false;
}

function startAutoSync() {
  if (syncTimer) clearInterval(syncTimer);
  runSync();
  syncTimer = setInterval(runSync, SYNC_INTERVAL_MS);
  console.log(`[OPERAN Sync] Auto-sync started (every ${SYNC_INTERVAL_MS / 60000} min)`);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'MANUAL_SYNC') {
    runSync().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'GET_STATUS') {
    const calendarUrl = getCalendarUrl();
    sendResponse({
      calendarUrl,
      eventCount: findEventButtons().length,
      lastSync: lastSyncTime ? lastSyncTime.toISOString() : null,
      autoSyncActive: !!syncTimer,
      isSyncing
    });
    return true;
  }
});

setTimeout(startAutoSync, 3000);
