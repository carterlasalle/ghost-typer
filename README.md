# 👻 Ghost Typer

**Simulate realistic human typing in Google Docs (Chrome + Firefox 148+).**

Ghost Typer is an open-source browser extension that takes your pasted text and types it character-by-character into Google Docs — with natural speed variations, intentional typos and corrections, punctuation pauses, and thinking breaks. The result looks like genuinely hand-typed text in Google Docs' revision history.

![Ghost Typer Screenshot](https://raw.githubusercontent.com/user/ghost-typer/main/screenshots/popup.png)

---

## ✨ Features

| Feature | Description |
|---|---|
| 🎯 **Human-Like Speed** | Gaussian-distributed typing speed that varies naturally, not robotic |
| ✍️ **Typo Simulation** | Makes realistic mistakes using adjacent QWERTY keys, then corrects them |
| ⏸️ **Thinking Pauses** | Random pauses between sentences, like a real person thinking |
| 📝 **Punctuation Delays** | Natural hesitation after periods, commas, and other punctuation |
| 🎛️ **Highly Configurable** | 9 tunable parameters — speed, mistakes, pauses, and more |
| ⏯️ **Full Controls** | Start, pause, resume, and stop at any time |
| 📊 **Live Progress** | Real-time progress bar with ETA |
| 💾 **Persistent Settings** | Your configuration saves automatically |
| 🌙 **Premium Dark UI** | Sleek glassmorphic popup design |

---

## 🚀 Installation

### From Source (Developer Mode)

1. **Download** or clone this repository:
   ```bash
   git clone https://github.com/user/ghost-typer.git
   ```

2. Load the extension in your target browser:

   **Chrome**
   1. Open `chrome://extensions`
   2. Enable **Developer mode** (top-right toggle)
   3. Click **Load unpacked** and select the `ghost-typer` folder

   **Firefox 148+**
   1. Open `about:debugging#/runtime/this-firefox`
   2. Click **Load Temporary Add-on...**
   3. Select the `manifest.json` file in your local `ghost-typer` folder

3. The Ghost Typer icon 👻 should appear in your browser toolbar

### Browser Compatibility Notes

- **Chrome path:** uses the content/injected script bridge by default in this source manifest; debugger-driven typing is only used in builds that include the `debugger` permission.
- **Firefox 148+ path:** automatically falls back to the content/injected script bridge (`content.js` + `injected.js`) and uses Google Docs-compatible insertion with `insertText`, `insertHTML`, and textarea `input`-event fallback when Docs exposes a textarea target.
- **Firefox background note:** this MV3 manifest uses `background.service_worker` for both Chrome and Firefox 148+.
- The extension keeps the same popup controls and saved settings in both browsers.
- No browser switching is required by users — engine selection is automatic at runtime.

---

## 📖 Usage

1. Open a **Google Docs** document
2. Place your **cursor** where you want the text to appear
3. Click the **Ghost Typer** extension icon
4. **Paste your text** into the text area
5. Adjust the **configuration sliders** to your preference
6. Click **Start Typing** and watch the magic happen ✨

---

## ⚙️ Configuration

| Parameter | Range | Default | Description |
|---|---|---|---|
| Typing Speed | 30 – 200 WPM | 80 WPM | Base words per minute |
| Speed Variation | 0 – 50% | 25% | How much speed fluctuates naturally |
| Mistake Rate | 0 – 15% | 3% | Chance of making a typo per character |
| Punctuation Delay | 0 – 2000ms | 400ms | Extra pause after . , ! ? |
| Paragraph Pause | 0.5 – 10s | 3.0s | Delay when hitting Enter |
| Thinking Pauses | On / Off | On | Random pauses between sentences |

### Tips for Realistic Results

- **Speed**: 60–100 WPM is typical for students typing essays
- **Mistakes**: 2–5% feels natural; above 8% looks sloppy
- **Variation**: 20–35% gives the most human-like inconsistency
- **Pauses**: Keep thinking pauses ON for longer documents

---

## 🏗️ How It Works

Ghost Typer uses three core systems:

### 1. Google Docs Connector
Locates the Docs text target in either the classic `docs-texteventtarget-iframe` flow or directly in the page when Docs exposes a textarea/contenteditable target outside that iframe. It uses `document.execCommand('insertText')` first, then `document.execCommand('insertHTML')` for contenteditable fallback, and emits textarea `input` events when Docs exposes a textarea target. If Docs is in canvas mode and no editable target is exposed, Ghost Typer now reports a specific error instead of failing silently.

### 2. Human Typing Simulator
Uses **Gaussian (normal) distribution** for timing, not uniform randomness. This creates the natural "burst and hesitate" pattern that real humans exhibit while typing.

### 3. Typo Engine
When a typo triggers, it:
1. Types a wrong key (QWERTY-adjacent)
2. Optionally continues 1–2 more characters
3. Pauses (like noticing the error)
4. Backspaces to delete the mistake
5. Types the correct character

---

## 🛡️ Privacy

Ghost Typer:
- ❌ Does **NOT** send your text anywhere
- ❌ Does **NOT** collect any analytics
- ❌ Does **NOT** require any login or account
- ✅ Runs **100% locally** in your browser
- ✅ Is **fully open source** — inspect every line of code

---

## 📋 Roadmap

- [x] Core typing simulation
- [x] Typo engine with adjacent-key errors
- [x] Configurable speed, mistakes, and pauses
- [x] Pause / resume / stop controls
- [ ] AI Detection Analyzer — check if text "reads like AI"
- [ ] Text Humanizer — rewrite AI-generated text to sound human
- [ ] Google Slides support
- [ ] Typing profiles (save different configurations)

---

## 🤝 Contributing

Contributions are welcome! Feel free to:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

## ⚠️ Disclaimer

This tool is provided for educational and productivity purposes. Users are responsible for complying with their institution's policies regarding document creation. The authors are not responsible for any misuse of this software.

---

<p align="center">
  Made with 💜 by the Ghost Typer community
</p>
