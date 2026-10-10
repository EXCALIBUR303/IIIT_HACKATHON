# RupeeRise frontend

React 19 + TypeScript + Vite, Tailwind CSS v4 tokens, shadcn-style components on Radix primitives, Motion, Recharts, React Router.

```bash
npm install
npm run dev          # http://localhost:5173 (proxies /api to http://localhost:8000)
npm test             # Vitest + React Testing Library
npm run test:e2e     # Playwright (starts API on :8001 and Vite on :5174)
npm run build        # type-check + production build
```

Structure: `src/features/<screen>` (pages and flows), `src/components/{ui,common,brand,layout}` (design system), `src/lib/api` (typed client mirroring the backend contract), `src/lib/i18n` (en/hi/te).

See the root [README](../README.md) and [docs](../docs/).
