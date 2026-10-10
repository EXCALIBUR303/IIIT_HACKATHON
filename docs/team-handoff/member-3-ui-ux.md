# Member 3 · UI/UX Design System

**Branch:** `feature/ui-ux`

## Responsibilities
Design system, visual identity, typography, layout refinement, component styling, micro-animations, usability and accessibility.

## Owned files
`frontend/src/index.css` (tokens) · `frontend/src/components/ui/**` · `frontend/src/components/brand/**` · `frontend/src/components/common/**` · `frontend/src/components/layout/**` · `frontend/public/**` · UI copy in `frontend/src/lib/i18n/**`

## Current state
- Tokens in `index.css` `@theme`: indigo primary `#4338CA`, emerald accent (fills `#10B981`, text `#047857` for AA contrast), pillar colours (budgeting indigo, saving emerald, investing cyan, safety amber).
- Plus Jakarta Sans (self-hosted via Fontsource). shadcn-style primitives on Radix (`Button`, `Card`, `Field`, `Badge`, `Tabs`, `Switch`, `Sheet`, `ProgressBar/Ring`).
- Logo: rupee glyph whose top stroke rises into an arrow (`components/brand/Logo.tsx`, `public/favicon.svg`).
- Accessibility preferences: `html.pref-large-text`, `.pref-high-contrast`, `.pref-reduced-motion`.

## Tasks (priority order)
1. **Persona illustrations:** simple SVG avatars for Meera, Lakshmi, Arjun, Imran (respectful, non-stereotyped) to replace initial letters.
2. **Outcome moments:** subtle Motion transitions when results appear (score ring fill, badge unlock), respecting reduced motion.
3. **Contrast audit:** check every text/background pair (WCAG AA), especially muted text on `canvas`, badges and charts; fix in tokens.
4. **Hindi/Telugu typography:** verify Plus Jakarta Sans fallback for Devanagari/Telugu; add Noto Sans Devanagari/Telugu via Fontsource if glyphs look inconsistent; review translations with native speakers.
5. **Mobile pass:** simulators and educator table at 375 px; sticky "Lock in" bar on mobile budget screen.
6. **Empty states & microcopy** consistency across pages.

## Dependencies
Member 2 for behaviour changes in features; coordinate before changing component props used across features.

## Acceptance criteria
- No regressions in `npm test`; visual changes shown with before/after screenshots in the PR.
- No heavy gradients, glassmorphism or neon; keep the calm, trustworthy style.
- All interactive elements keyboard reachable with visible focus.
