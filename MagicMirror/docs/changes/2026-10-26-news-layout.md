# News card placement and motion

- Moved the technology newsfeed from `bottom_bar` to the right-center card layout and made its headline a keyboard-focusable link.
- Added a clipped horizontal headline animation. Hover and keyboard focus pause it; `prefers-reduced-motion` disables the animation and allows wrapping.
- Kept the existing feed and dependencies. The newsfeed is currently limited to one item and rotates every 20 seconds.
- `config:check` passed. Browser check at 1281×812 showed the live headline card centered vertically on the right (360px wide); the visible headline was moving across the card. The page loaded the configured feed.
- The local `css/custom.css` and `config/config.js` are ignored by Git and remain local working configuration.
