# AI assistant center card

- Added a compact, accessible AI assistant button with no input or hidden controls until opened. Opening focuses the composer; the close button returns focus to the compact toggle.
- Anchored both states to the viewport center from `fullscreen_above`. MagicMirror applies inline `position: static` to visible module roots, so the module's fixed-position rule overrides that inline style.
- Made the expanded panel a fixed-height flex column with an independently scrolling conversation and composer/actions pinned below it. Existing message, streaming, voice, and pet behavior remains in place.
- Validation on Node 22.20.0/npm 10.9.3: full unit suite 19/19 suites and 156/156 tests; AI module tests 18/18; JS lint, direct AI ESLint, Prettier, and `config:check` passed.
- Browser check at 1281×812 confirmed the compact button and 520×560 expanded card are centered, with messages in a separate scroll region and controls below. A 1024×768 browser viewport was unavailable for visual verification.
- Direct Stylelint on the legacy AI stylesheet still reports existing file-wide selector naming and formatting violations; Prettier passes. The full stylesheet was not rewritten as part of this change.
- Repository ignores `modules/`; the AI module edits are present in the local working files but do not appear in normal Git status. No API secrets, dependency files, or lockfiles were accessed or changed.
