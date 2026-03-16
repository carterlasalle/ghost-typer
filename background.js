/* ========================================
   Ghost Typer — Background Service Worker
   Relays messages between popup <-> content
   ======================================== */

let typingState = {
  state: 'idle', // idle | typing | paused | done
  current: 0,
  total: 0,
  tabId: null,
};

// ── Message Handler ──
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'GET_STATE':
      sendResponse({
        state: typingState.state,
        current: typingState.current,
        total: typingState.total,
      });
      return true;

    case 'START_TYPING':
      typingState.state = 'typing';
      typingState.current = 0;
      typingState.total = message.config.text.length;
      // Forward to content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          typingState.tabId = tabs[0].id;
          chrome.tabs.sendMessage(tabs[0].id, message);
        }
      });
      break;

    case 'PAUSE_TYPING':
    case 'RESUME_TYPING':
    case 'STOP_TYPING':
      typingState.state = message.action === 'PAUSE_TYPING' ? 'paused' :
                          message.action === 'RESUME_TYPING' ? 'typing' : 'idle';
      if (typingState.tabId) {
        chrome.tabs.sendMessage(typingState.tabId, message);
      }
      break;

    case 'PROGRESS_UPDATE':
      typingState.state = 'typing';
      typingState.current = message.current;
      typingState.total = message.total;
      // Forward to popup
      chrome.runtime.sendMessage(message).catch(() => {});
      break;

    case 'TYPING_COMPLETE':
      typingState.state = 'done';
      typingState.current = message.total;
      chrome.runtime.sendMessage(message).catch(() => {});
      break;

    case 'TYPING_ERROR':
      typingState.state = 'idle';
      chrome.runtime.sendMessage(message).catch(() => {});
      break;
  }
});
