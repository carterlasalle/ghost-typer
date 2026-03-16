/* ========================================
   Ghost Typer — Popup Controller
   ======================================== */

document.addEventListener('DOMContentLoaded', () => {
  // ── DOM Elements ──
  const textInput = document.getElementById('textInput');
  const charCount = document.getElementById('charCount');
  const wordCount = document.getElementById('wordCount');

  const speedSlider = document.getElementById('speedSlider');
  const speedValue = document.getElementById('speedValue');
  const variationSlider = document.getElementById('variationSlider');
  const variationValue = document.getElementById('variationValue');
  const mistakeSlider = document.getElementById('mistakeSlider');
  const mistakeValue = document.getElementById('mistakeValue');
  const punctSlider = document.getElementById('punctSlider');
  const punctValue = document.getElementById('punctValue');
  const paraSlider = document.getElementById('paraSlider');
  const paraValue = document.getElementById('paraValue');
  const thinkToggle = document.getElementById('thinkToggle');
  const thinkValue = document.getElementById('thinkValue');

  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const stopBtn = document.getElementById('stopBtn');

  const statusBadge = document.getElementById('statusBadge');
  const progressSection = document.getElementById('progressSection');
  const progressFill = document.getElementById('progressFill');
  const progressPercent = document.getElementById('progressPercent');
  const progressChars = document.getElementById('progressChars');
  const progressEta = document.getElementById('progressEta');

  let currentState = 'idle'; // idle | typing | paused | done | error

  // ── Load Saved Settings ──
  chrome.storage.local.get([
    'text', 'speed', 'variation', 'mistakes', 'punctDelay',
    'paraDelay', 'thinkingPauses'
  ], (data) => {
    if (data.text) textInput.value = data.text;
    if (data.speed !== undefined) speedSlider.value = data.speed;
    if (data.variation !== undefined) variationSlider.value = data.variation;
    if (data.mistakes !== undefined) mistakeSlider.value = data.mistakes;
    if (data.punctDelay !== undefined) punctSlider.value = data.punctDelay;
    if (data.paraDelay !== undefined) paraSlider.value = data.paraDelay;
    if (data.thinkingPauses !== undefined) thinkToggle.checked = data.thinkingPauses;
    updateAllDisplays();
  });

  // ── Text Counter ──
  textInput.addEventListener('input', () => {
    const text = textInput.value;
    charCount.textContent = text.length;
    wordCount.textContent = text.trim() ? text.trim().split(/\s+/).length : 0;
    chrome.storage.local.set({ text });
  });

  // ── Slider Updates ──
  function updateAllDisplays() {
    const text = textInput.value;
    charCount.textContent = text.length;
    wordCount.textContent = text.trim() ? text.trim().split(/\s+/).length : 0;
    speedValue.textContent = `${speedSlider.value} WPM`;
    variationValue.textContent = `${variationSlider.value}%`;
    mistakeValue.textContent = `${mistakeSlider.value}%`;
    punctValue.textContent = `${punctSlider.value}ms`;
    paraValue.textContent = `${(paraSlider.value / 1000).toFixed(1)}s`;
    thinkValue.textContent = thinkToggle.checked ? 'On' : 'Off';
  }

  speedSlider.addEventListener('input', () => {
    speedValue.textContent = `${speedSlider.value} WPM`;
    saveSettings();
  });

  variationSlider.addEventListener('input', () => {
    variationValue.textContent = `${variationSlider.value}%`;
    saveSettings();
  });

  mistakeSlider.addEventListener('input', () => {
    mistakeValue.textContent = `${mistakeSlider.value}%`;
    saveSettings();
  });

  punctSlider.addEventListener('input', () => {
    punctValue.textContent = `${punctSlider.value}ms`;
    saveSettings();
  });

  paraSlider.addEventListener('input', () => {
    paraValue.textContent = `${(paraSlider.value / 1000).toFixed(1)}s`;
    saveSettings();
  });

  thinkToggle.addEventListener('change', () => {
    thinkValue.textContent = thinkToggle.checked ? 'On' : 'Off';
    saveSettings();
  });

  function saveSettings() {
    chrome.storage.local.set({
      speed: parseInt(speedSlider.value),
      variation: parseInt(variationSlider.value),
      mistakes: parseInt(mistakeSlider.value),
      punctDelay: parseInt(punctSlider.value),
      paraDelay: parseInt(paraSlider.value),
      thinkingPauses: thinkToggle.checked,
    });
  }

  function getConfig() {
    return {
      text: textInput.value,
      speed: parseInt(speedSlider.value),
      variation: parseInt(variationSlider.value),
      mistakes: parseInt(mistakeSlider.value),
      punctDelay: parseInt(punctSlider.value),
      paraDelay: parseInt(paraSlider.value),
      thinkingPauses: thinkToggle.checked,
    };
  }

  // ── State & UI Management ──
  function setState(state, statusText) {
    currentState = state;
    const badge = statusBadge;
    const dot = badge.querySelector('.status-dot');
    const text = badge.querySelector('.status-text');

    badge.setAttribute('data-status', state);
    text.textContent = statusText || state.charAt(0).toUpperCase() + state.slice(1);

    startBtn.disabled = state === 'typing';
    pauseBtn.disabled = state !== 'typing' && state !== 'paused';
    stopBtn.disabled = state === 'idle' || state === 'done';

    if (state === 'typing' || state === 'paused') {
      progressSection.style.display = 'block';
    }

    if (state === 'idle') {
      progressSection.style.display = 'none';
      progressFill.style.width = '0%';
      progressPercent.textContent = '0%';
    }

    // Update pause button text
    if (state === 'paused') {
      pauseBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Resume
      `;
    } else {
      pauseBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        Pause
      `;
    }

    // Update start button when done
    if (state === 'done') {
      startBtn.disabled = false;
      startBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Start Again
      `;
    } else if (state === 'idle') {
      startBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Start Typing
      `;
    }
  }

  function updateProgress(current, total) {
    const percent = Math.round((current / total) * 100);
    progressFill.style.width = `${percent}%`;
    progressPercent.textContent = `${percent}%`;
    progressChars.textContent = `${current} / ${total} chars`;

    const config = getConfig();
    const avgMsPerChar = (60 * 1000) / (config.speed * 5);
    const remaining = total - current;
    const etaSeconds = Math.round((remaining * avgMsPerChar) / 1000);
    if (etaSeconds > 60) {
      progressEta.textContent = `~${Math.round(etaSeconds / 60)}m remaining`;
    } else {
      progressEta.textContent = `~${etaSeconds}s remaining`;
    }
  }

  // ── Communication with Content Script ──
  async function sendToContentScript(message) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        setState('error', 'No tab');
        return;
      }

      if (!tab.url || !tab.url.includes('docs.google.com/document')) {
        setState('error', 'Not Google Docs');
        return;
      }

      chrome.tabs.sendMessage(tab.id, message, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Message error:', chrome.runtime.lastError.message);
          setState('error', 'Connection Error');
        }
      });
    } catch (err) {
      console.error('Failed to send message:', err);
      setState('error', 'Error');
    }
  }

  // ── Button Handlers ──
  startBtn.addEventListener('click', () => {
    const config = getConfig();
    if (!config.text.trim()) {
      textInput.focus();
      textInput.style.borderColor = 'rgba(239, 68, 68, 0.5)';
      setTimeout(() => {
        textInput.style.borderColor = '';
      }, 1500);
      return;
    }

    setState('typing', 'Typing...');
    updateProgress(0, config.text.length);

    sendToContentScript({
      action: 'START_TYPING',
      config
    });
  });

  pauseBtn.addEventListener('click', () => {
    if (currentState === 'typing') {
      setState('paused', 'Paused');
      sendToContentScript({ action: 'PAUSE_TYPING' });
    } else if (currentState === 'paused') {
      setState('typing', 'Typing...');
      sendToContentScript({ action: 'RESUME_TYPING' });
    }
  });

  stopBtn.addEventListener('click', () => {
    setState('idle', 'Idle');
    sendToContentScript({ action: 'STOP_TYPING' });
  });

  // ── Listen for Progress Updates ──
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case 'PROGRESS_UPDATE':
        updateProgress(message.current, message.total);
        break;

      case 'TYPING_COMPLETE':
        setState('done', 'Complete ✓');
        updateProgress(message.total, message.total);
        break;

      case 'TYPING_ERROR':
        setState('error', 'Error');
        console.error('Typing error:', message.error);
        break;
    }
  });

  // ── Check current state on popup open ──
  chrome.runtime.sendMessage({ action: 'GET_STATE' }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response && response.state) {
      if (response.state === 'typing') {
        setState('typing', 'Typing...');
        if (response.current && response.total) {
          updateProgress(response.current, response.total);
        }
      } else if (response.state === 'paused') {
        setState('paused', 'Paused');
        if (response.current && response.total) {
          updateProgress(response.current, response.total);
        }
      }
    }
  });
});
