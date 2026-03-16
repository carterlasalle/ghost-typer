/* ========================================
   Ghost Typer — Content Script (Core Engine)
   
   Simulates human-like typing in Google Docs
   by inserting characters one-by-one with
   realistic timing, mistakes, and corrections.
   ======================================== */

(() => {
  'use strict';

  // ── QWERTY Adjacent Key Map ──
  const ADJACENT_KEYS = {
    'q': ['w', 'a'],       'w': ['q', 'e', 'a', 's'],
    'e': ['w', 'r', 's', 'd'], 'r': ['e', 't', 'd', 'f'],
    't': ['r', 'y', 'f', 'g'], 'y': ['t', 'u', 'g', 'h'],
    'u': ['y', 'i', 'h', 'j'], 'i': ['u', 'o', 'j', 'k'],
    'o': ['i', 'p', 'k', 'l'], 'p': ['o', 'l'],
    'a': ['q', 'w', 's', 'z'], 's': ['w', 'e', 'a', 'd', 'z', 'x'],
    'd': ['e', 'r', 's', 'f', 'x', 'c'], 'f': ['r', 't', 'd', 'g', 'c', 'v'],
    'g': ['t', 'y', 'f', 'h', 'v', 'b'], 'h': ['y', 'u', 'g', 'j', 'b', 'n'],
    'j': ['u', 'i', 'h', 'k', 'n', 'm'], 'k': ['i', 'o', 'j', 'l', 'm'],
    'l': ['o', 'p', 'k'],
    'z': ['a', 's', 'x'], 'x': ['s', 'd', 'z', 'c'],
    'c': ['d', 'f', 'x', 'v'], 'v': ['f', 'g', 'c', 'b'],
    'b': ['g', 'h', 'v', 'n'], 'n': ['h', 'j', 'b', 'm'],
    'm': ['j', 'k', 'n'],
  };

  // ── State ──
  let state = 'idle';
  let textToType = '';
  let position = 0;
  let config = {};
  let pauseResolver = null;

  // ── Utilities ──

  function gaussRandom(mean, stddev) {
    let u1 = Math.random();
    let u2 = Math.random();
    while (u1 === 0) u1 = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z * stddev;
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      if (state === 'stopped') { resolve(); return; }
      setTimeout(() => {
        if (state === 'paused') {
          pauseResolver = resolve;
        } else {
          resolve();
        }
      }, ms);
    });
  }

  function waitIfPaused() {
    return new Promise((resolve) => {
      if (state !== 'paused') { resolve(); return; }
      pauseResolver = resolve;
    });
  }

  function getCharDelay() {
    const charsPerMinute = config.speed * 5;
    const baseMs = (60 * 1000) / charsPerMinute;
    const variation = config.variation / 100;
    const stddev = baseMs * variation;
    const delay = gaussRandom(baseMs, stddev);
    return Math.max(20, Math.min(delay, baseMs * 4));
  }

  function getPunctuationDelay(char) {
    if (!config.punctDelay) return 0;
    const base = config.punctDelay;
    if ('.!?'.includes(char)) return gaussRandom(base, base * 0.3);
    if (char === ',') return gaussRandom(base * 0.5, base * 0.15);
    if (':;'.includes(char)) return gaussRandom(base * 0.6, base * 0.2);
    return 0;
  }

  function shouldThinkingPause(char, nextChar) {
    if (!config.thinkingPauses) return false;
    if ('.!?'.includes(char) && nextChar === ' ') return Math.random() < 0.3;
    return false;
  }

  function getAdjacentKey(char) {
    const lower = char.toLowerCase();
    const adjacents = ADJACENT_KEYS[lower];
    if (!adjacents || adjacents.length === 0) return char;
    const adj = adjacents[Math.floor(Math.random() * adjacents.length)];
    return char === char.toUpperCase() ? adj.toUpperCase() : adj;
  }

  function shouldMakeTypo(char) {
    if (config.mistakes <= 0) return false;
    if (!/[a-zA-Z]/.test(char)) return false;
    return Math.random() < (config.mistakes / 100);
  }

  // ── Google Docs Interaction (Robust Multi-Strategy) ──

  /**
   * Click the Google Docs editor canvas area to ensure
   * the document has focus (critical after popup closes)
   */
  function clickEditorArea() {
    // The main editor canvas
    const canvas = document.querySelector('.kix-appview-editor');
    if (canvas) {
      canvas.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 300, clientY: 300 }));
      canvas.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 300, clientY: 300 }));
      canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 300, clientY: 300 }));
      return true;
    }
    
    // Try the page content area
    const page = document.querySelector('.kix-page-content-wrapper');
    if (page) {
      page.click();
      return true;
    }

    return false;
  }

  /**
   * Get the Google Docs text event target iframe
   * This is where Google Docs captures keyboard input
   */
  function getTextEventTarget() {
    const iframe = document.querySelector('.docs-texteventtarget-iframe');
    if (iframe) {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        const el = iframeDoc.querySelector('[contenteditable="true"]');
        if (el) return { doc: iframeDoc, element: el, iframe };
      } catch (e) { /* cross-origin */ }
    }
    return null;
  }

  /**
   * Focus the Google Docs editor — tries multiple strategies
   */
  function focusEditor() {
    const target = getTextEventTarget();
    if (target) {
      target.element.focus();
      return target;
    }
    return null;
  }

  /**
   * Insert a character using multiple strategies.
   * Strategy 1: execCommand on the iframe document
   * Strategy 2: InputEvent dispatch
   * Strategy 3: Keyboard event simulation
   */
  function insertCharacter(char) {
    const target = getTextEventTarget();
    if (!target) {
      console.warn('Ghost Typer: Could not find text event target');
      return false;
    }

    const { doc, element } = target;
    element.focus();

    if (char === '\n') {
      // Enter key — dispatch full keyboard event sequence
      const props = {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
        bubbles: true, cancelable: true,
      };
      element.dispatchEvent(new KeyboardEvent('keydown', props));
      element.dispatchEvent(new KeyboardEvent('keypress', props));
      element.dispatchEvent(new InputEvent('beforeinput', {
        inputType: 'insertParagraph', bubbles: true, cancelable: true, composed: true,
      }));
      element.dispatchEvent(new InputEvent('input', {
        inputType: 'insertParagraph', bubbles: true, cancelable: false, composed: true,
      }));
      element.dispatchEvent(new KeyboardEvent('keyup', props));
      return true;
    }

    // Strategy 1: execCommand (most reliable for Google Docs)
    const success = doc.execCommand('insertText', false, char);
    
    if (!success) {
      // Strategy 2: InputEvent dispatch
      element.dispatchEvent(new InputEvent('beforeinput', {
        inputType: 'insertText', data: char,
        bubbles: true, cancelable: true, composed: true,
      }));
      element.dispatchEvent(new InputEvent('input', {
        inputType: 'insertText', data: char,
        bubbles: true, cancelable: false, composed: true,
      }));
    }

    // Also dispatch keyboard events to make it look more real
    const keyCode = char.charCodeAt(0);
    element.dispatchEvent(new KeyboardEvent('keydown', {
      key: char, code: `Key${char.toUpperCase()}`,
      keyCode, which: keyCode, bubbles: true, cancelable: true,
    }));
    element.dispatchEvent(new KeyboardEvent('keyup', {
      key: char, code: `Key${char.toUpperCase()}`,
      keyCode, which: keyCode, bubbles: true, cancelable: true,
    }));

    return true;
  }

  /**
   * Press backspace to delete a character
   */
  function pressBackspace() {
    const target = getTextEventTarget();
    if (!target) return false;

    const { doc, element } = target;
    element.focus();

    // Keyboard events for backspace
    const props = {
      key: 'Backspace', code: 'Backspace', keyCode: 8, which: 8,
      bubbles: true, cancelable: true,
    };
    element.dispatchEvent(new KeyboardEvent('keydown', props));

    // InputEvent for deletion
    element.dispatchEvent(new InputEvent('beforeinput', {
      inputType: 'deleteContentBackward',
      bubbles: true, cancelable: true, composed: true,
    }));

    // execCommand as the actual deletion mechanism
    doc.execCommand('delete', false, null);

    element.dispatchEvent(new InputEvent('input', {
      inputType: 'deleteContentBackward',
      bubbles: true, cancelable: false, composed: true,
    }));

    element.dispatchEvent(new KeyboardEvent('keyup', props));

    return true;
  }

  // ── Typing Engine ──

  async function typeCharacter(char, nextChar) {
    if (state === 'stopped') return;
    if (state === 'paused') await waitIfPaused();
    if (state === 'stopped') return;

    const willTypo = shouldMakeTypo(char);

    if (willTypo) {
      // 1. Type the wrong character
      const wrongChar = getAdjacentKey(char);
      insertCharacter(wrongChar);
      
      // 2. Brief pause (realizing the mistake)
      await sleep(Math.max(50, gaussRandom(200, 80)));
      if (state === 'stopped') return;

      // 3. Sometimes type 1-2 more characters before noticing
      const extraChars = Math.random() < 0.3 ? Math.floor(Math.random() * 2) + 1 : 0;
      for (let i = 0; i < extraChars; i++) {
        if (position + i + 1 < textToType.length) {
          insertCharacter(textToType[position + i + 1]);
          await sleep(getCharDelay());
          if (state === 'stopped') return;
        }
      }

      // 4. Backspace to erase the mistake(s)
      for (let i = 0; i < extraChars + 1; i++) {
        await sleep(gaussRandom(80, 20));
        pressBackspace();
        if (state === 'stopped') return;
      }

      // 5. Small pause before correction
      await sleep(gaussRandom(100, 30));
      if (state === 'stopped') return;

      // 6. Type the correct character
      insertCharacter(char);
    } else {
      insertCharacter(char);
    }

    // ── Post-character delays ──
    let delay = getCharDelay();
    delay += getPunctuationDelay(char);

    if (char === '\n' && nextChar === '\n') {
      delay += gaussRandom(config.paraDelay, config.paraDelay * 0.3);
    } else if (char === '\n') {
      delay += gaussRandom(config.paraDelay * 0.5, config.paraDelay * 0.15);
    }

    if (shouldThinkingPause(char, nextChar)) {
      delay += Math.max(500, gaussRandom(config.paraDelay * 0.7, config.paraDelay * 0.2));
    }

    await sleep(delay);
  }

  /**
   * Main typing loop
   */
  async function startTyping(text, cfg) {
    textToType = text;
    config = cfg;
    position = 0;
    state = 'typing';

    console.log('👻 Ghost Typer: Starting to type', text.length, 'characters');

    // Step 1: Click the editor area to restore focus
    // (The popup takes focus away from Google Docs)
    clickEditorArea();
    await sleep(300);

    // Step 2: Verify we can access the text event target
    const target = getTextEventTarget();
    if (!target) {
      console.error('👻 Ghost Typer: Could not find the Google Docs editor iframe!');
      console.log('👻 Looking for .docs-texteventtarget-iframe...');
      console.log('👻 Found iframes:', document.querySelectorAll('iframe').length);
      document.querySelectorAll('iframe').forEach((f, i) => {
        console.log(`  iframe[${i}]:`, f.className, f.src);
      });

      chrome.runtime.sendMessage({
        action: 'TYPING_ERROR',
        error: 'Could not find Google Docs editor. Click inside your document first, then try again.',
      });
      state = 'idle';
      return;
    }

    // Step 3: Focus the editable element
    target.element.focus();
    console.log('👻 Ghost Typer: Editor found, starting typing...');

    // Small initial delay
    await sleep(gaussRandom(400, 100));

    try {
      for (position = 0; position < textToType.length; position++) {
        if (state === 'stopped') break;
        if (state === 'paused') await waitIfPaused();
        if (state === 'stopped') break;

        const char = textToType[position];
        const nextChar = position + 1 < textToType.length ? textToType[position + 1] : '';

        await typeCharacter(char, nextChar);

        // Report progress every 3 characters
        if (position % 3 === 0) {
          chrome.runtime.sendMessage({
            action: 'PROGRESS_UPDATE',
            current: position + 1,
            total: textToType.length,
          });
        }
      }

      if (state !== 'stopped') {
        state = 'idle';
        console.log('👻 Ghost Typer: Typing complete!');
        chrome.runtime.sendMessage({
          action: 'TYPING_COMPLETE',
          total: textToType.length,
        });
      }
    } catch (err) {
      console.error('👻 Ghost Typer error:', err);
      chrome.runtime.sendMessage({
        action: 'TYPING_ERROR',
        error: err.message,
      });
      state = 'idle';
    }
  }

  // ── Message Listener ──
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case 'START_TYPING':
        if (state === 'typing') {
          state = 'stopped';
          setTimeout(() => startTyping(message.config.text, message.config), 200);
        } else {
          startTyping(message.config.text, message.config);
        }
        sendResponse({ success: true });
        break;

      case 'PAUSE_TYPING':
        state = 'paused';
        sendResponse({ success: true });
        break;

      case 'RESUME_TYPING':
        state = 'typing';
        if (pauseResolver) { pauseResolver(); pauseResolver = null; }
        sendResponse({ success: true });
        break;

      case 'STOP_TYPING':
        state = 'stopped';
        if (pauseResolver) { pauseResolver(); pauseResolver = null; }
        sendResponse({ success: true });
        break;
    }
    return true;
  });

  console.log('👻 Ghost Typer loaded on Google Docs');
})();
