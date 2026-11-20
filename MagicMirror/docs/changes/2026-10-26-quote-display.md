# Local quote display

- Added `MMM-QuoteDisplay` with a configurable local list of short classical quotations, a 90-second cyclic rotation, text-only rendering, and timer cleanup.
- Positioned the quote in `lower_third`, leaving the viewport center available to the AI assistant button. The old poem module remains installed but is disabled in the local config.
- Seed quotations are from the *Analects* and *Dao De Jing*, including passages in *Wei Zheng*, *Wei Ling Gong*, and the *Dao De Jing* text.
- Focused module tests pass (4/4), as do module/test ESLint, Prettier, and `config:check`. Browser viewport 1281×812 showed the quote card in the lower center. 1024×768 was not available for visual verification.
- Module code and local configuration are in Git-ignored paths; no dependencies or lockfiles changed.
