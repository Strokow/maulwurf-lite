# Maulwurf Lite

A minimal, local-first desktop app for tracking **recurring financial obligations** — subscriptions, contracts, installment plans and one-time payments — month by month.

Maulwurf Lite is the lightweight sibling of the [Maulwurf personal finance tracker](https://github.com/Strokow/Maulwurf-Personal-Finance-Tracker). It keeps exactly one thing: the obligations board. No transaction import, no dashboards, no AI — just a clear answer to *"What do I still have to pay this month?"*

- **Interface languages: English, French, German and Russian** — chosen on first run, switchable anytime in Settings.
- **Your own banks** — nothing is hard-coded. Add any bank or payment service (name + color) and assign it to obligations.
- **100% local** — all data stays on your machine (`electron-store` JSON + automatic local backups). No accounts, no cloud, no telemetry.
- **PIN protection** — optional 6-digit PIN with lockout after 3 failed attempts (SHA-256 hash only, never plaintext).

## Features

### One main page
A single obligations board with a **month switcher** (unlimited past, up to 3 months ahead for planning). Each obligation is a card with a click-to-toggle status: **Paid / Unpaid / Unknown / Hidden**.

### Obligation types
- **Monthly** — regular subscriptions and bills. Without an explicit record they count as *unpaid* (an active subscription awaiting confirmation).
- **Quarterly** — due every three months. Paying them marks a 3-month coverage window ("Paid until June 2026"), after which they become due again.
- **Yearly** — due once a year (optionally in a specific month). Paying them marks a 12-month coverage window ("Paid until March 2027").
- **One-time** — visible only in the month they belong to.
- **Installment plans** — generic plans with progress tracking (`4/12 payments`, progress bar, original debt). Works with **any** bank, not a specific provider. A completed plan stays visible as history but no longer counts toward the month's totals.

### Debt carry-over
An unpaid obligation can be **carried to any future month**. The source card is dimmed with a note, the target month shows the carried debt separately from the month's own charge, with *"Pay all"* / *"Settle debt"* buttons and a late-fee warning. Carrying is fully reversible.

### More
- **Effective-dated price changes** — "the subscription costs X starting from this month"; past months keep the old price.
- **Linked obligations** — drag a card onto another to link it as a child; paying the parent pays the children.
- **Custom sections** — create your own groups and organize cards via drag & drop.
- **Search, filters, sorting** — by name, amount, day, status, frequency.
- **Undo / Redo** — up to 10 steps, persisted across restarts, plus a change history log.
- **Backups** — automatic every 30 minutes (last 10 kept), manual create/restore, export/import to a JSON file.
- **Export** — the current month as **Markdown** or **PDF**, in the current interface language.
- **Currency** — display currency is configurable (EUR by default).

## First run

1. **Choose your language** (English / Français / Deutsch / Русский).
2. **Set a 6-digit PIN** — or skip and enable it later in Settings.
3. Add your banks in **Settings → Banks** and start adding obligations.

The app starts completely empty — no sample data, no assumptions about your banks.

## Install

Download the latest `Maulwurf-Lite-X.Y.Z-setup.exe` from the [Releases](https://github.com/Strokow/maulwurf-lite/releases) page and run it (Windows).

> **Windows SmartScreen note:** the installer is not code-signed (signing certificates are paid), so on first run Windows may show *"Windows protected your PC"*. Click **More info → Run anyway** to proceed. The app is open source — you can inspect the code in this repository or build the installer yourself with `npm run build:win`.

## Development

```bash
npm install
npm run dev        # start in development mode
npm test           # run the vitest suite
npm run typecheck  # TypeScript checks (main/preload + renderer)
npm run build:win  # build the Windows installer (dist/Maulwurf-Lite-X.Y.Z-setup.exe)
```

Tech stack: **Electron + electron-vite + React 19 + TypeScript + Tailwind CSS**, with `electron-store` for persistence, `framer-motion` for animations and `lucide-react` for icons.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the process model, data model and core invariants.

## Data & privacy

All data lives in your OS user-data directory (`%APPDATA%/maulwurf-lite` on Windows):
- `config.json` — obligations, month statuses, banks, sections, settings, PIN hash.
- `backups/` — automatic and manual JSON backups.

Nothing ever leaves your machine.

## License

[Apache License 2.0](LICENSE) — the same license as the main [Maulwurf](https://github.com/Strokow/Maulwurf-Personal-Finance-Tracker) project.
