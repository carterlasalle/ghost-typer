/* =================================================
   Ghost Typer v1.7 — Background Service Worker
   
   Chrome DevTools Protocol typing engine.
   
   v1.7 changes:
   - Drastically reduced mistake frequency
   - Natural single-char typos only (no word scrambling)
   - Realistic "go back and edit" behavior
   - Very long pauses (20s-60s "bathroom/phone breaks")
   - Better overlay blocking (covers iframes too)
   - Keyboard event blocking during typing
   ================================================= */

// ── QWERTY adjacency for typos ──
const ADJ = {
  q:'wa',w:'qeas',e:'wrsd',r:'etdf',t:'ryfg',y:'tugh',u:'yihj',i:'uojk',o:'ipkl',p:'ol',
  a:'qwsz',s:'weadzx',d:'ersfxc',f:'rtdgcv',g:'tyfhvb',h:'yugjbn',j:'uihknm',k:'iojlm',l:'opk',
  z:'asx',x:'sdzc',c:'dfxv',v:'fgcb',b:'ghvn',n:'hjbm',m:'jkn',
};

// ── Key code mapping for ALL special characters ──
const SPECIAL_KEYS = {
  ' ':  { code: 'Space', keyCode: 32 },
  '!':  { code: 'Digit1', keyCode: 49, shift: true },
  '@':  { code: 'Digit2', keyCode: 50, shift: true },
  '#':  { code: 'Digit3', keyCode: 51, shift: true },
  '$':  { code: 'Digit4', keyCode: 52, shift: true },
  '%':  { code: 'Digit5', keyCode: 53, shift: true },
  '^':  { code: 'Digit6', keyCode: 54, shift: true },
  '&':  { code: 'Digit7', keyCode: 55, shift: true },
  '*':  { code: 'Digit8', keyCode: 56, shift: true },
  '(':  { code: 'Digit9', keyCode: 57, shift: true },
  ')':  { code: 'Digit0', keyCode: 48, shift: true },
  '-':  { code: 'Minus', keyCode: 189 },
  '_':  { code: 'Minus', keyCode: 189, shift: true },
  '=':  { code: 'Equal', keyCode: 187 },
  '+':  { code: 'Equal', keyCode: 187, shift: true },
  '[':  { code: 'BracketLeft', keyCode: 219 },
  ']':  { code: 'BracketRight', keyCode: 221 },
  '{':  { code: 'BracketLeft', keyCode: 219, shift: true },
  '}':  { code: 'BracketRight', keyCode: 221, shift: true },
  '\\': { code: 'Backslash', keyCode: 220 },
  '|':  { code: 'Backslash', keyCode: 220, shift: true },
  ';':  { code: 'Semicolon', keyCode: 186 },
  ':':  { code: 'Semicolon', keyCode: 186, shift: true },
  "'":  { code: 'Quote', keyCode: 222 },
  '"':  { code: 'Quote', keyCode: 222, shift: true },
  ',':  { code: 'Comma', keyCode: 188 },
  '<':  { code: 'Comma', keyCode: 188, shift: true },
  '.':  { code: 'Period', keyCode: 190 },
  '>':  { code: 'Period', keyCode: 190, shift: true },
  '/':  { code: 'Slash', keyCode: 191 },
  '?':  { code: 'Slash', keyCode: 191, shift: true },
  '`':  { code: 'Backquote', keyCode: 192 },
  '~':  { code: 'Backquote', keyCode: 192, shift: true },
  '\t': { code: 'Tab', keyCode: 9 },
};

// ── State ──
let state = 'idle';
let tabId = null;
let debuggerAttached = false;
let pauseResolve = null;

// ── Utilities ──
function gauss(m, s) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function sleep(ms) {
  return new Promise(r => {
    if (state === 'stopped') return r();
    setTimeout(() => state === 'paused' ? (pauseResolve = r) : r(), Math.max(0, ms));
  });
}

function waitPause() {
  if (state !== 'paused') return Promise.resolve();
  return new Promise(r => { pauseResolve = r; });
}

// ── CDP helpers ──
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
}

async function attachDebugger(tid) {
  tabId = tid;
  return new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, '1.3', () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        debuggerAttached = true;
        resolve();
      }
    });
  });
}

async function detachDebugger() {
  if (!debuggerAttached) return;
  return new Promise((resolve) => {
    chrome.debugger.detach({ tabId }, () => {
      debuggerAttached = false;
      resolve();
    });
  });
}

// ── Overlay — blocks mouse AND keyboard from user ──
async function injectOverlay() {
  try {
    await cdp('Runtime.evaluate', {
      expression: `(function(){
        if(document.getElementById('gt-shield'))return;

        // Full-screen click blocker
        var s=document.createElement('div');
        s.id='gt-shield';
        s.style.cssText='position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647;background:transparent;cursor:not-allowed;';
        document.documentElement.appendChild(s);

        // Also add shields over any Google Docs iframes
        document.querySelectorAll('iframe').forEach(function(f){
          var c=document.createElement('div');
          c.className='gt-iframe-shield';
          c.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;z-index:2147483647;pointer-events:auto;cursor:not-allowed;';
          if(f.parentElement){f.parentElement.style.position=f.parentElement.style.position||'relative';f.parentElement.appendChild(c);}
        });

        // Block keyboard events from user (CDP events bypass this)
        window.__gtKeyBlock=function(e){
          if(!e.isTrusted)return; // Let programmatic events through
          // Block all user keyboard input
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        };
        document.addEventListener('keydown',window.__gtKeyBlock,true);
        document.addEventListener('keypress',window.__gtKeyBlock,true);
        document.addEventListener('keyup',window.__gtKeyBlock,true);

        // Status badge
        var b=document.createElement('div');
        b.id='gt-badge';
        b.style.cssText='position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#1d1d1f;color:#f5f5f7;padding:8px 20px;border-radius:24px;font:500 13px/1.3 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;z-index:2147483647;pointer-events:none;box-shadow:0 2px 12px rgba(0,0,0,0.3);letter-spacing:0.01em;';
        b.textContent='Ghost Typer is typing...';
        document.documentElement.appendChild(b);
      })()`
    });
  } catch (e) { /* ignore */ }
}

async function removeOverlay() {
  try {
    await cdp('Runtime.evaluate', {
      expression: `(function(){
        var s=document.getElementById('gt-shield');if(s)s.remove();
        var b=document.getElementById('gt-badge');if(b)b.remove();
        document.querySelectorAll('.gt-iframe-shield').forEach(function(e){e.remove();});
        if(window.__gtKeyBlock){
          document.removeEventListener('keydown',window.__gtKeyBlock,true);
          document.removeEventListener('keypress',window.__gtKeyBlock,true);
          document.removeEventListener('keyup',window.__gtKeyBlock,true);
          delete window.__gtKeyBlock;
        }
      })()`
    });
  } catch (e) { /* ignore */ }
}

// ── Key press via CDP ──
function getKeyInfo(char) {
  if (SPECIAL_KEYS[char]) {
    return { key: char, ...SPECIAL_KEYS[char] };
  }
  if (/[a-zA-Z]/.test(char)) {
    const upper = char === char.toUpperCase() && char !== char.toLowerCase();
    return { key: char, code: `Key${char.toUpperCase()}`, keyCode: char.toUpperCase().charCodeAt(0), shift: upper };
  }
  if (/[0-9]/.test(char)) {
    return { key: char, code: `Digit${char}`, keyCode: char.charCodeAt(0) };
  }
  return { key: char, code: '', keyCode: 0 };
}

async function pressKey(char) {
  if (char === '\n') {
    await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    await cdp('Input.dispatchKeyEvent', { type: 'char', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    return;
  }
  const info = getKeyInfo(char);
  const mod = info.shift ? 8 : 0;
  const kc = info.keyCode || char.charCodeAt(0);

  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: info.key, code: info.code, windowsVirtualKeyCode: kc, nativeVirtualKeyCode: kc, modifiers: mod });
  await cdp('Input.dispatchKeyEvent', { type: 'char', key: info.key, code: info.code, text: char, unmodifiedText: char, windowsVirtualKeyCode: char.charCodeAt(0), nativeVirtualKeyCode: char.charCodeAt(0), modifiers: mod });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: info.key, code: info.code, windowsVirtualKeyCode: kc, nativeVirtualKeyCode: kc, modifiers: 0 });
}

async function pressBackspace() {
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 });
}

async function pressCtrl(key) {
  const code = `Key${key.toUpperCase()}`;
  const kc = key.toUpperCase().charCodeAt(0);
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: kc, nativeVirtualKeyCode: kc, modifiers: 2 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: kc, nativeVirtualKeyCode: kc, modifiers: 0 });
}

// ── Timing — all based on config ──
function charDelay(cfg) {
  const base = 60000 / (cfg.speed * 5);
  const vary = cfg.variation / 100;
  return Math.max(20, Math.min(gauss(base, base * vary), base * 3));
}

function punctDelay(c, cfg) {
  if (!cfg.punctDelay) return 0;
  if ('.!?'.includes(c)) return gauss(cfg.punctDelay, cfg.punctDelay * 0.25);
  if (',;:'.includes(c)) return gauss(cfg.punctDelay * 0.4, cfg.punctDelay * 0.1);
  return 0;
}

function adjKey(c) {
  const row = ADJ[c.toLowerCase()];
  if (!row) return c;
  const r = row[Math.floor(Math.random() * row.length)];
  return c === c.toUpperCase() ? r.toUpperCase() : r;
}

// ── Markdown → formatting ──
function parseMarkdown(text) {
  const segments = [];
  let i = 0;
  while (i < text.length) {
    let m = text.slice(i).match(/^(\*\*|__)(.+?)\1/);
    if (m) { segments.push({ text: m[2], bold: true }); i += m[0].length; continue; }
    m = text.slice(i).match(/^(\*|_)(.+?)\1/);
    if (m) { segments.push({ text: m[2], italic: true }); i += m[0].length; continue; }
    m = text.slice(i).match(/^(#{1,6})\s+(.+?)(\n|$)/);
    if (m && (i === 0 || text[i - 1] === '\n')) { segments.push({ text: m[2], bold: true }); segments.push({ text: '\n' }); i += m[0].length; continue; }
    m = text.slice(i).match(/^[-*]\s+/);
    if (m && (i === 0 || text[i - 1] === '\n')) { segments.push({ text: '\u2022 ' }); i += m[0].length; continue; }
    segments.push({ text: text[i] });
    i++;
  }
  return segments;
}

// ==========================================
// MAIN TYPING ENGINE
// ==========================================
async function startTyping(tid, cfg) {
  state = 'typing';

  try {
    await attachDebugger(tid);
  } catch (e) {
    broadcast({ action: 'TYPING_ERROR', error: 'Could not attach debugger: ' + e.message });
    state = 'idle';
    return;
  }

  await injectOverlay();

  const segments = parseMarkdown(cfg.text);
  const totalChars = segments.reduce((a, s) => a + s.text.length, 0);
  let typed = 0;
  // Track recently typed chars for "go back and fix" behavior
  let recentlyTyped = [];

  // Mistake rate — scale down the slider value
  // Slider range 0-15. At 3% setting, actual typo chance = ~1.5%
  const typoRate = cfg.mistakes / 200; // 3% slider = 0.015 actual chance

  // Initial delay — settling in
  await sleep(gauss(800, 200));

  try {
    for (let si = 0; si < segments.length; si++) {
      if (state === 'stopped') break;

      const seg = segments[si];

      if (seg.bold) await pressCtrl('b');
      if (seg.italic) await pressCtrl('i');
      if (seg.bold || seg.italic) await sleep(gauss(60, 20));

      const chars = seg.text;

      for (let ci = 0; ci < chars.length; ci++) {
        if (state === 'stopped') break;
        if (state === 'paused') await waitPause();
        if (state === 'stopped') break;

        const c = chars[ci];
        const next = chars[ci + 1] || '';

        // ===========================================
        // BEHAVIOR 1: Simple single-character typo
        // Press wrong adjacent key, notice after 0-2 chars, fix
        // Chance: very low, only on letters
        // ===========================================
        const doTypo = typoRate > 0 && /[a-zA-Z]/.test(c) && Math.random() < typoRate;

        if (doTypo) {
          // Type the wrong key
          const wrongChar = adjKey(c);
          await pressKey(wrongChar);
          recentlyTyped.push(wrongChar);

          // How many extra chars before noticing? Usually 0, sometimes 1
          const extraBeforeNotice = Math.random() < 0.3 ? 1 : 0;
          for (let x = 0; x < extraBeforeNotice && ci + x + 1 < chars.length; x++) {
            await sleep(charDelay(cfg));
            await pressKey(chars[ci + x + 1]);
            recentlyTyped.push(chars[ci + x + 1]);
          }

          // Pause — human "noticing" the mistake
          await sleep(gauss(300, 100));

          // Delete back
          for (let x = 0; x < extraBeforeNotice + 1; x++) {
            await pressBackspace();
            recentlyTyped.pop();
            await sleep(gauss(60, 15));
          }
          await sleep(gauss(150, 40));
          if (state === 'stopped') break;
          // Fall through to type the correct char below
        }

        // ===========================================
        // BEHAVIOR 2: Go back & revise a recent section
        // Delete the last 3-8 chars, pause to "think", retype
        // Chance: very rare (~0.3% per char)
        // ===========================================
        if (cfg.mistakes > 0 && recentlyTyped.length > 6 && Math.random() < 0.003) {
          const deleteCount = rand(3, Math.min(8, recentlyTyped.length));
          const deleted = [];

          // Delete backwards
          for (let d = 0; d < deleteCount; d++) {
            await pressBackspace();
            deleted.unshift(recentlyTyped.pop());
            typed--;
            await sleep(gauss(50, 12));
          }

          // "Think" about the revision
          await sleep(gauss(2000, 600));

          // Retype the same text (as if reconsidering and keeping it)
          for (const ch of deleted) {
            if (state === 'stopped') break;
            await pressKey(ch);
            recentlyTyped.push(ch);
            typed++;
            await sleep(charDelay(cfg));
          }
          await sleep(gauss(200, 60));
        }

        // ===========================================
        // Type the correct character
        // ===========================================
        await pressKey(c);
        recentlyTyped.push(c);
        typed++;

        // Keep recentlyTyped buffer to last ~50 chars
        if (recentlyTyped.length > 50) recentlyTyped = recentlyTyped.slice(-50);

        // ===========================================
        // DELAYS — the core of natural feel
        // ===========================================
        let d = charDelay(cfg);

        // After punctuation
        d += punctDelay(c, cfg);

        // After newline / paragraph
        if (c === '\n') {
          d += gauss(cfg.paraDelay * 0.8, cfg.paraDelay * 0.2);
        }

        // After sentence end (.!?) — thinking about next sentence
        if (cfg.thinkingPauses && '.!?'.includes(c) && next === ' ') {
          if (Math.random() < 0.35) {
            d += gauss(cfg.paraDelay * 0.6, cfg.paraDelay * 0.2);
          }
        }

        // Random mid-sentence pause — picking the right word
        if (cfg.thinkingPauses && c === ' ' && Math.random() < 0.025) {
          d += gauss(2000, 700);
        }

        // Rare medium break — checking notes, re-reading (5-15 seconds)
        if (cfg.thinkingPauses && c === ' ' && Math.random() < 0.004) {
          const breakTime = rand(5000, 15000);
          d += breakTime;
        }

        // Very rare long break — bathroom, phone, distraction (20-60 seconds)
        if (cfg.thinkingPauses && c === ' ' && Math.random() < 0.001) {
          const longBreak = rand(20000, 60000);
          d += longBreak;
        }

        await sleep(d);

        // Progress update every ~8 chars
        if (typed % 8 === 0) {
          broadcast({ action: 'PROGRESS_UPDATE', current: typed, total: totalChars });
        }
      }

      // Turn off formatting
      if (seg.bold) { await pressCtrl('b'); await sleep(gauss(40, 12)); }
      if (seg.italic) { await pressCtrl('i'); await sleep(gauss(40, 12)); }
    }

    if (state !== 'stopped') {
      broadcast({ action: 'TYPING_COMPLETE', total: totalChars });
    }
  } catch (e) {
    broadcast({ action: 'TYPING_ERROR', error: e.message });
  } finally {
    state = 'idle';
    await removeOverlay();
    await detachDebugger();
  }
}

// ── Broadcast ──
function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

// ── Message handler ──
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.action) {
    case 'START_TYPING': {
      const cfg = msg.config;
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) { sendResponse({ success: false, error: 'No active tab' }); return; }
        if (!tabs[0].url?.includes('docs.google.com/document')) {
          sendResponse({ success: false, error: 'Not a Google Docs page' }); return;
        }
        if (state === 'typing') {
          state = 'stopped';
          setTimeout(() => startTyping(tabs[0].id, cfg), 300);
        } else {
          startTyping(tabs[0].id, cfg);
        }
        sendResponse({ success: true });
      });
      return true;
    }

    case 'PAUSE_TYPING':
      state = 'paused';
      sendResponse({ success: true });
      break;

    case 'RESUME_TYPING':
      state = 'typing';
      if (pauseResolve) { pauseResolve(); pauseResolve = null; }
      sendResponse({ success: true });
      break;

    case 'STOP_TYPING':
      state = 'stopped';
      if (pauseResolve) { pauseResolve(); pauseResolve = null; }
      removeOverlay();
      detachDebugger();
      sendResponse({ success: true });
      break;

    case 'GET_STATE':
      sendResponse({ state });
      break;
  }
  return true;
});

chrome.debugger.onDetach.addListener(() => {
  debuggerAttached = false;
  if (state === 'typing' || state === 'paused') {
    state = 'stopped';
    broadcast({ action: 'TYPING_ERROR', error: 'Debugger detached.' });
  }
});
