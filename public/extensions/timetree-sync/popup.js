async function getActiveTimeTreeTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (tab && tab.url && tab.url.includes('timetreeapp.com/calendars/')) return tab;
  const allTabs = await chrome.tabs.query({ url: 'https://timetreeapp.com/calendars/*' });
  return allTabs[0] || null;
}

async function updateStatus() {
  const tab = await getActiveTimeTreeTab();
  const statusEl = document.getElementById('status');
  const calendarEl = document.getElementById('calendar');
  const eventsEl = document.getElementById('events');
  const lastSyncEl = document.getElementById('lastSync');
  const syncBtn = document.getElementById('syncBtn');

  if (!tab) {
    statusEl.textContent = 'No TimeTree tab';
    statusEl.className = 'badge badge-red';
    calendarEl.textContent = '-';
    eventsEl.textContent = '-';
    syncBtn.disabled = true;
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_STATUS' });
    if (response) {
      statusEl.textContent = response.autoSyncActive ? 'Active' : 'Idle';
      statusEl.className = response.autoSyncActive ? 'badge badge-green' : 'badge badge-yellow';
      calendarEl.textContent = response.calendarUrl ? response.calendarUrl.split('/').pop() : '-';
      eventsEl.textContent = response.eventCount || '0';
      if (response.lastSync) {
        const d = new Date(response.lastSync);
        lastSyncEl.textContent = d.toLocaleTimeString();
      }
      syncBtn.disabled = false;
    }
  } catch {
    statusEl.textContent = 'Loading...';
    statusEl.className = 'badge badge-yellow';
    syncBtn.disabled = true;
  }
}

document.getElementById('syncBtn').addEventListener('click', async () => {
  const btn = document.getElementById('syncBtn');
  const resultEl = document.getElementById('result');
  btn.disabled = true;
  btn.textContent = 'Syncing...';

  const tab = await getActiveTimeTreeTab();
  if (!tab) {
    resultEl.style.display = 'block';
    resultEl.className = 'result error';
    resultEl.textContent = 'No TimeTree tab found. Open a TimeTree calendar first.';
    btn.disabled = false;
    btn.textContent = 'Sync Now';
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'MANUAL_SYNC' });
    await new Promise(r => setTimeout(r, 2000));

    const lastResult = await chrome.runtime.sendMessage({ type: 'GET_LAST_RESULT' });
    resultEl.style.display = 'block';
    if (lastResult && lastResult.success) {
      resultEl.className = 'result';
      resultEl.textContent = `Synced to "${lastResult.listing_name}": ${lastResult.inserted} new, ${lastResult.updated} updated`;
    } else if (lastResult && lastResult.error) {
      resultEl.className = 'result error';
      resultEl.textContent = lastResult.error;
    } else {
      resultEl.className = 'result';
      resultEl.textContent = `Sent ${lastResult?.eventCount || 0} events`;
    }
  } catch (err) {
    resultEl.style.display = 'block';
    resultEl.className = 'result error';
    resultEl.textContent = 'Sync failed: ' + err.message;
  }

  btn.disabled = false;
  btn.textContent = 'Sync Now';
  updateStatus();
});

updateStatus();
