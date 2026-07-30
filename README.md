# Aurora — Enterprise Admin Dashboard

A polished, production-grade admin dashboard + authentication experience built to
feel like a 2026 SaaS platform (Stripe / Linear / Notion / Vercel / Clerk energy).
Collapsible sidebar, floating glass topbar, ⌘K command palette, animated charts,
a premium data table, full dark mode, and a matching split-screen login page.

## Stack

- **React 18 + TypeScript + Vite**
- **Tailwind CSS** with an HSL design-token layer (light + dark) in `src/index.css`
- **shadcn/ui-style primitives** built on **Radix UI**
- **React Router** for navigation
- **TanStack Table** for the data grid
- **Recharts** for animated charts
- **React Hook Form + Zod** available for forms
- **Framer Motion** for entrance, page, and micro-interactions
- **cmdk** for the command palette · **lucide-react** icons · **Inter** typeface

## ⚠️ Important: the project path contains `#`

Vite cannot serve or build from a directory whose path contains `#`
(`...\Downloads\c#\hris`) — it parses `#` as a URL fragment and silently skips its
transform pipeline. This repo is the **source of truth**, but run the app from a
`#`-free copy:

```
C:\Users\Administrator\Downloads\aurora-app
```

```bash
cd C:\Users\Administrator\Downloads\aurora-app
npm install
npm run dev
```

(To iterate: edit files under `c#\hris`, then re-sync with
`robocopy "c#\hris" aurora-app /MIR /XD node_modules dist .git .vite`.)

## Routes

| Path          | Screen                                            |
| ------------- | ------------------------------------------------- |
| `/`           | Executive dashboard — KPIs, charts, activity      |
| `/analytics`  | Analytics — growth, payroll, attendance, logins   |
| `/employees`  | Premium data table (the flagship screen)          |
| `/login`      | Split-screen authentication page                  |
| `/users` …    | Styled "coming soon" surfaces for remaining nav   |

## Highlights

- **App shell** — collapsible sidebar (grouped nav + tooltips when collapsed),
  sticky glass topbar with global search, notification center, theme toggle, and
  a profile dropdown. Mobile uses a slide-in drawer.
- **Command palette** — press **⌘K / Ctrl+K** anywhere to search and jump.
- **Dashboard** — 6 KPI cards with count-up numbers, sparklines, and trend chips;
  animated area / bar / donut charts; quick-action cards; activity timeline; an
  AI-insight hero card.
- **Employees table** — search, multi-select status filter, column visibility,
  sortable columns, sticky header, alternating rows, bulk-action bar, row actions,
  pagination, loading skeletons, and an empty state.
- **Dark mode** — full token-based theming, persisted to `localStorage`.
- **Accessibility** — keyboard nav, visible focus rings, ARIA labels,
  `prefers-reduced-motion` support.

## Scripts

| Command           | Description                    |
| ----------------- | ------------------------------ |
| `npm run dev`     | Start the dev server           |
| `npm run build`   | Type-check + production build  |
| `npm run preview` | Preview the production build   |
| `npm run lint`    | Type-check only                |

## Structure

```
src/
├─ App.tsx                 # Providers + router
├─ index.css               # Design tokens (light/dark) + base styles
├─ config/nav.ts           # Sidebar navigation model
├─ lib/                    # utils, validation, mock data
├─ hooks/                  # useCountUp, useMediaQuery
├─ pages/                  # Dashboard, Analytics, Employees, Placeholder
└─ components/
   ├─ ui/                  # Reusable primitives (card, badge, dialog, drawer, …)
   ├─ layout/              # Sidebar, Topbar, CommandPalette, Breadcrumbs, …
   ├─ dashboard/           # KpiCard, charts, timeline, quick actions
   ├─ table/               # DataTable columns + pagination
   ├─ auth/                # Login page + form
   └─ providers/           # ThemeProvider
```

## Login demo credentials

`founder@aurora.app` / `aurora2026` — any other combination shakes + errors.
