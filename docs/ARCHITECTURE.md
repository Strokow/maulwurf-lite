# Maulwurf Lite — Architecture

## Process model (Electron)

```
┌─────────────────────┐     IPC      ┌─────────────────────┐
│  src/main/          │ ◀──────────▶ │  src/preload/       │
│  (Node.js process)  │              │  (contextBridge)    │
│  - IPC handlers     │              │  - window.api       │
│  - electron-store   │              └──────────┬──────────┘
│  - file backups     │                         │
│  - PIN hash/verify  │                         ▼
│  - PDF/MD export    │               ┌─────────────────────┐
└─────────────────────┘               │  src/renderer/      │
                                      │  (React 19 + Vite)  │
                                      │  - useStore hook    │
                                      │  - i18n (EN/FR)     │
                                      │  - UI components    │
                                      └─────────────────────┘
```

**Boundary rules**
- All IPC handlers live in [`src/main/index.ts`](../src/main/index.ts). The preload only forwards calls; it adds no logic.
- The renderer has no `nodeIntegration`; file-system access goes exclusively through `window.api.*`.
- Business logic for obligations lives in the renderer ([`utils/obligationEngine.ts`](../src/renderer/src/utils/obligationEngine.ts) + [`store/useStore.ts`](../src/renderer/src/store/useStore.ts)). The main process only stores and returns data.

## Data model

Defined in [`src/renderer/src/types/index.ts`](../src/renderer/src/types/index.ts).

| Entity | Purpose |
|---|---|
| `Obligation` | A recurring/one-time payment: name, amount, approximate day, frequency (`monthly` / `yearly` / `once`), user-defined `bankId`, optional installment plan (`isInstallment`, `totalInstallments`, `originalTotal`), effective-dated price history (`amountChanges`), section/parent links. |
| `ObligationMonth` | The payment **status of one obligation for one month**. Key: `(obligationId, year, month)`. Status: `paid` / `unpaid` / `unknown` / `skipped`. Also holds the carry-over fields (`isCarriedOver`, `carriedFromYear/Month`, `carriedAmount`, `carriedPaid`). |
| `Bank` | User-defined bank / payment service (name + badge color). Deleting a bank detaches it from obligations, which keep working without one. |
| `ObligationSection` | A custom card group, filled via drag & drop. |
| `HistoryEntry` | One undo/redo step: partial before/after snapshots of `obligations` / `obligationMonths`. Max 10, persisted. |
| `ChangeLogEntry` | Human-readable audit log entry (max 500, persisted). |
| `PinSettings` | `enabled`, SHA-256 `pinHash` (never plaintext), lockout state. |
| `AppSettings` | `language` (`en` / `fr`), display `currency`, `onboarded` flag. |

## Core invariants

1. **Month status resolution:** an `ObligationMonth` record always wins. Without a record the default is `yearly → 'unknown'`, `monthly`/`once → 'unpaid'`. Implemented once in `obligationEngine.getEffectiveStatus` and used everywhere (cards, totals, export).
2. **Native occurrence:** an obligation is "native" to a month only when the month is ≥ its `createdAt` month (`once` — only its creation month). The month's own charge is added to totals **only when native** (`isNativeActive` gate). Cards that appear in a month solely because a debt was carried there owe only the carried amount.
3. **Effective price:** every amount shown or summed for a month goes through `effectiveAmount(o, year, month)`, honouring `amountChanges`. Past months are never rewritten by a price change.
4. **Completed installment plans** (paid count ≥ `totalInstallments`) are excluded from every "to pay" total and counter, but stay visible as history.
5. **Carry-over:** carrying moves the debt to a chosen **future** month; the source month keeps its record and is excluded from the source month's totals. Reverting is "smart": a record that exists only because of the carry is deleted; otherwise only the carry markers are stripped.
6. **Day clamping:** any use of `approximateDay` in a `Date` constructor goes through `clampDayToMonth` (Feb 31 → Feb 28, not Mar 3).
7. **Undo snapshots** of `obligationMonths` are taken from a ref (`obligationMonthsRef`), never inside a React state updater — after an `await`, an updater may not have run yet and would capture an empty snapshot that undo would then apply, wiping every status. Additionally `undo`/`redo` refuse to apply an empty `obligationMonths` snapshot over a non-empty state.
8. **One click — one undo entry:** a status toggle (which may cascade to linked children and auto-settle up to 3 previous unpaid months) pushes a single combined undo entry; the inner status writes run with `skipUndo`.
9. **Mutation contract in `useStore`:** IPC persist → change-log entry → local `setState` (and ref sync) → `pushUndo`. New mutations must follow the same order.
10. **PIN:** only the SHA-256 hash is stored; verification and lockout (3 attempts → 5-minute lockout) run in the main process (`pinService.ts`). The PIN never appears in logs.

## Internationalisation

- Dictionaries: [`i18n/en.ts`](../src/renderer/src/i18n/en.ts) (source of truth for keys) and [`i18n/fr.ts`](../src/renderer/src/i18n/fr.ts) (typed as `Record<TranslationKey, string>`, so a missing key is a compile error).
- `I18nProvider` + `useI18n()` expose `t(key, params)`, plural-aware `tn(key, n)`, localized month names (`Intl.DateTimeFormat`) and currency formatting (`Intl.NumberFormat`, graceful fallback for unknown codes).
- A test ([`tests/i18n.test.ts`](../src/renderer/src/tests/i18n.test.ts)) enforces that both dictionaries share the exact same keys and placeholders.
- Change-log descriptions are resolved at write time in the then-current language; UI labels always follow the current language.

## First-run flow

```
App boot ──► settings.onboarded?
   │  no ──► Onboarding: language (EN/FR) ──► PIN setup (set / skip)
   │          └─► saveSettings{language, onboarded:true} ──► main page
   │  yes ─► pin enabled? ──► PIN gate (verify, lockout countdown) ──► main page
```

## IPC surface (window.api)

- `store.*` — `getAll`, obligation CRUD (`addObligation`, `updateObligation`, `deleteObligation`, `setObligations`), month statuses (`setObligationMonth`, `setAllObligationMonths`), `setBanks`, `saveCustomSections`, `saveUndoHistory`, `saveRedoStack`, `addChangeLog`, `saveSettings`.
- `pin.*` — `verify`, `set`, `disable`, `status`.
- `backup.*` — `list`, `create`, `restore`, `exportToFile`, `importFromFile`. Auto-backup runs every 30 minutes, keeping the last 10 files.
- `exportPdf(html, name)` / `exportMd(content, name)` — save dialogs + `printToPDF` in a hidden window.

## Testing & tooling

- **vitest** (jsdom): `obligationEngine`, `historyService`, `pinService`, i18n dictionary parity.
- **TypeScript:** two projects — `tsconfig.node.json` (main + preload) and `tsconfig.web.json` (renderer). `npm run typecheck` must stay clean; `npm run build` runs it before bundling.
- **Build:** electron-vite (three targets) + electron-builder (`Maulwurf-Lite-X.Y.Z-setup.exe` for Windows).
