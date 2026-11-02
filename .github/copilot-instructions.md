# Repository guidance

## Commands

- `npm run dev` starts the local development server.
- `npm run check` runs Svelte/TypeScript checks.
- `npm test` runs the Vitest suite; run one test file with `npm test -- src/lib/auth/password.test.ts`, or filter by test name with `npm test -- src/lib/auth/password.test.ts -t "test name"`.
- `npm run build` creates the production build; `npm start` serves it with the Node adapter.
- There is no separate lint script in `package.json`.

## Architecture

GTDone is a SvelteKit app deployed as a Node server. Route UI lives under `src/routes`; server-only `+page.server.ts` files handle form actions and loads. The browser never opens SQLite directly.

The app UI lives in the `src/routes/(app)` group (shared layout shell, `[list=list]` list pages, `projects/[id]`, `search`, `manage/[kind=kind]`); `/` redirects to `/inbox`. Route matchers are Standard Schema objects exported as `params` from `src/params/index.ts`. Domain logic is in `src/lib/gtd` (`core.ts` shared constants/dates/`GtdError`, `items.ts`, `projects.ts`, `organize.ts` for areas/tags/contacts/settings). Form actions for items and projects are defined once in `src/lib/server/actions.ts` (`appActions`) and re-exported by every page that needs them; the client posts to them through `postAction` (`src/lib/client/actions.ts`, always against `/inbox?/<name>`). List filters (energy, time, contact, project, tag, due, sort) come from URL query params via `loadViewFilter` and are applied by `listItems`; the area filter lives in the `gtdone_area` cookie. Sequential projects (`projects.execution_mode`) gate Next/Focus through the `SEQUENTIAL` clause in `items.ts`; bulk selection goes through the `bulk` action and `bulkApply`. Domain code throws `GtdError`, which the action wrapper turns into `fail()`.

`src/hooks.server.ts` resolves the session cookie into `event.locals.session` and redirects unauthenticated requests to `/setup` or `/login`. Authentication operations are in `src/lib/auth`; route actions should use these domain helpers rather than duplicating credential or session logic.

SQLite access is centralized in `src/lib/server/db.ts`, which lazily opens a process-wide `node:sqlite` connection. `src/lib/db/client.ts` enables WAL and foreign keys, and `src/lib/db/migrations.ts` owns the versioned schema. Add schema changes as new migrations; do not rewrite migrations that may already have run. Migrations that rebuild tables must set `foreignKeys: false` so the runner disables FKs outside the transaction and runs `foreign_key_check` before commit; `runMigrations(db, targetVersion)` can stop at a version for data-preservation tests. Dates are stored as UTC-midnight milliseconds. `src/instrumentation.server.ts` starts the backup scheduler, which writes a backup at startup and every 24 hours.

The database defaults to `data/gtdone.db` and can be relocated with `GTDONE_DB_PATH`. Backups default to a `backups` directory beside the database; `GTDONE_BACKUP_DIR` and `GTDONE_BACKUP_KEEP` configure the directory and retention count.

## Repository conventions

- TypeScript strict mode is enabled. Vite forces Svelte 5 runes mode for project Svelte files; use runes such as `$props()` rather than legacy component syntax. The compiler exception for dependencies is configured in `vite.config.ts`.
- Use `#lib/...` for internal library imports with the explicit file extension (`.ts`/`.svelte`; the alias is defined in `package.json`); SvelteKit-generated route types are imported from `./$types`.
- Keep user-facing UI and validation messages in Portuguese, consistent with the existing screens and auth helpers.
- Server form actions return `fail(status, data)` for expected form errors and use `redirect(303, path)` after successful navigation. Session cookies are `httpOnly`, `sameSite: 'lax'`, and scoped to `/`.
- Use parameterized SQLite statements. Group multi-step writes in explicit transactions and roll back before rethrowing errors, following the account and migration helpers.
- Tests are `src/**/*.test.ts` Vitest tests in the Node environment. Database tests create temporary SQLite files and close connections in `finally` blocks.

## Phase 5 notes

- Preferences live in `src/lib/gtd/preferences.ts` (`PREF_DEFS` is the single source for defaults/validation; stored as `pref.<key>` in `settings`). The `(app)` layout loads them, sets `data-theme/accent/density` on `<html>`, and exposes them to components via `providePrefs`/`usePrefs` (`src/lib/prefs-context.ts`). Add new preferences by extending `PREF_DEFS` and the `TABS` in `settings/+page.svelte`.
- Checklists use `checklist_items` (exposed as `Item.checklist`); recurrence uses `recurrences` (`weekly:2` format, one row per item). `completeItem` creates the next occurrence and moves the rule, so completing twice never duplicates. `tx()` in `items.ts` is nest-safe via `db.isTransaction`.
- Keyboard shortcuts are declared in `src/lib/shortcuts.ts` and handled in `(app)/+layout.svelte`; list rows must keep `.row[data-id]`, `.title`, `.star`, and the editor `form.editor` markup that the handler relies on.

## Phase 6 notes

- `src/lib/gtd/portability.ts` exports/imports generically from the live schema (new tables are included automatically). Never export or overwrite `users`, `sessions`, `schema_migrations`, or `settings` keys prefixed `integration.` (secrets/state). Import requires an identical `schemaVersion` and runs in one transaction with a `foreign_key_check`.
- `src/lib/gtd/integrations.ts` holds email capture (token hash + sender allow-list; `/api/inbound-email` is the only non-session route besides login/setup, JSON-only) and the Focus digest policy (`runDigestTick`, injected `send`). SMTP lives in `src/lib/server/mailer.ts`; `digest-scheduler.ts` ticks every minute from `instrumentation.server.ts`.


## i18n

- O texto em português é a chave de tradução; use `const t = useT()` (`#lib/prefs-context.ts`) e `t('Texto')`; erros do servidor com `t.msg(error)`.
- Inglês em `src/lib/i18n/en-{core,server,shell,ui}.ts` (chaves únicas). Login/setup e email do Foco ficam em português.

## Quick Add

- `src/lib/nlp/quick-add.ts` (`parseQuickAdd`) é um parser de regras, puro e síncrono (sem LLM): `$área`, `@contexto` (vira tag), `!urgência` (alta → Foco), datas em pt/en e recorrência. A ação `capture` o aplica quando `quick=1` (Composer e RapidEntry).

## Agendadas e Calendário

- `/scheduled` lista só itens `state='scheduled'` (data de início), agrupados por `scheduleBucket` em Esta semana / Próxima semana / Datas futuras (`ItemList` `groupBy='schedule'`).
- `/calendar` renderiza `Calendar.svelte` (`?view=deadlines|3days|next7|week|month|gantt&mode=both|planned|deadlines&date=AAAA-MM-DD`). Lógica pura em `src/lib/calendar.ts`; consulta `listCalendarItems(..., mode)` usando `idx_items_due`/`idx_items_starts`. A visão `gantt` usa `listGanttItems` (início e prazo cruzando o mês) e ignora `mode`.

## Editor de item

- `ItemEditor.svelte`: coluna direita com Tempo, Energia, Prazo e um menu único "Estado" (Reagendar: Data de início…/Repetir…; Estado: Caixa de entrada, Próximas, Depois, Algum dia, Aguardando ▸ contatos/Novo contato…, Agendadas ▸ data). O menu escreve em campos ocultos (`state`, `startsAt`, `contactId`) e em `recUnit`/`recEvery`; o servidor continua resolvendo o estado via `resolveState`.
