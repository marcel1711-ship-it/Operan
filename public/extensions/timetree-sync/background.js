let lastSyncResult = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SYNC_RESULT') {
    lastSyncResult = msg.data;
  }
  if (msg.type === 'GET_LAST_RESULT') {
    sendResponse(lastSyncResult);
    return true;
  }
});
