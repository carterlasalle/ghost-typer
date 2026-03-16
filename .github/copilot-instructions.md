This repository is a Manifest V3 browser extension for Google Docs.

## Scope and style
- Keep changes small and focused on the reported issue.
- Do not add new dependencies unless absolutely necessary.
- Preserve existing plain JavaScript style and naming.

## Repository structure
- `background.js`: background controller and typing engine selection.
- `content.js`: bridge between extension runtime messages and page context.
- `injected.js`: main-world Google Docs typing logic.
- `popup.js`, `popup.html`, `popup.css`: popup UI and controls.

## Validation
- There is no automated lint/build/test toolchain in this repo.
- Validate changes manually by loading the extension and testing in Google Docs.
- Confirm Chrome behavior is unchanged when fixing Firefox behavior.

## Browser behavior
- Chrome can use debugger-driven typing when available.
- Firefox uses the content/injected bridge path and must remain supported.
