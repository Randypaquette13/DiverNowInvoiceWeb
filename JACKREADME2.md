# API & schema changes (diff from origin/master)

Summary of everything Jack needs to know: API request/response changes, new query/body params, error codes, schema (migrations), and scripts.

---

## 1. Calendar API

### GET `/api/calendar/list` (new)

- **Auth:** Required.
- **Response:** Array of `{ id, summary, primary }` for the user’s Google calendar list. Returns `[]` if not connected. Same 401 + `code: 'google_reconnect'` on invalid/expired token as other calendar endpoints.

---

### GET `/api/calendar/events`

| Before | After |
|--------|--------|
| Query: `from`, `to` (optional; parsed as `new Date(from)` / `new Date(to)`) | Query: **`from`**, **`to`** (unchanged), **or** **`fromDate`**, **`toDateEnd`** (ISO strings). If `fromDate` and `toDateEnd` are present, they are used as the range directly. Otherwise `from`/`to` are parsed: **to** is interpreted as **end of that day** (23:59:59.999 UTC). |
| Returned all events in date range for user. | **Filter by selected calendar:** only events where **`source_calendar_id`** matches the user’s **`user_integrations.google_calendar_id`** (or `'primary'`), including rows with `source_calendar_id IS NULL` when selected calendar is `'primary'`. |

- **Response shape:** Unchanged. Array of `{ id, user_id, external_id, title, start_at, end_at, synced_at }`.  
- **Schema:** `calendar_events` has **`recurring_event_id`** (varchar, nullable) and **`source_calendar_id`** (varchar 255, nullable); see migrations below.

---

### POST `/api/calendar/sync`

| Before | After |
|--------|--------|
| No body. Sync used fixed window: `timeMin` = 30 days ago, `timeMax` = 7 days from now. | **Optional body:** `{ from?, to?, fromDate?, toDateEnd? }`. If **`fromDate`** and **`toDateEnd`** are provided, they are used as `timeMin`/`timeMax` (ISO). If only **`from`**/**`to`** (YYYY-MM-DD) are provided, server derives range (to = end of that day). If no body or missing range, falls back to same fixed window as before. |
| Upserted `calendar_events` without recurring info. | Upserts **`recurring_event_id`** from Google’s `recurringEventId` and **`source_calendar_id`** from the calendar used for the request (user’s `google_calendar_id` or `'primary'`). For each event with a `recurringEventId`, **auto-links** to an existing invoice if the same recurring series already has a mapping (by `event_invoice_mappings.recurring_series_id` or linked `calendar_events.recurring_event_id`). |
| No special error for expired token. | On Google **invalid_grant** / token expired or revoked: **401** with body `{ error: "Google Calendar access expired or was revoked.", code: "google_reconnect", detail: "..." }`. Refresh token is cleared in DB. |

- **Response:** Still `{ synced: number }` (count of events synced).

---

## 2. Mappings API

### POST `/api/mappings`

| Before | After |
|--------|--------|
| Body: `calendar_event_id`, `order_id` (or `square_order_id`). Single row inserted/updated. | Same body. **Behavior:** Resolves event’s **recurring series** (`recurring_event_id` or `raw_json->>'recurringEventId'`). Inserts/updates mapping with **`recurring_series_id`** set. **Propagates** the same link to **all** `calendar_events` with that recurring series (same `recurring_event_id` or raw `recurringEventId`). |
| 400 if missing params. | **404** if **calendar event not found**: `{ error: "Calendar event not found" }`. Still 400 if params missing. |

- **Response shape:** Unchanged. Single object: `{ id, calendar_event_id, square_order_id, squarespace_order_id }` (and `order_id` alias).

---

## 3. Square API

### POST `/api/square/sync`

| Before | After |
|--------|--------|
| Synced **all** invoices from Square. | Only syncs invoices where **`status === 'DRAFT'`**. |

- **Response:** `{ synced: number }` — count is now **draft-only**.

---

### GET `/api/square/invoices`

| Before | After |
|--------|--------|
| All rows from `square_orders` for user. | Filter: **`raw_json->>'status' IS NULL OR raw_json->>'status' = 'DRAFT'`** (only drafts or legacy rows without status). |
| List items: `customer_email`, `customer_name`, `amount`, `line_items_summary`, `synced_at`, etc. | Each item **adds** **`title`**: `raw_json?.title || line_items_summary || null`. |

---

### POST `/api/square/invoices/from-template`

| Before | After |
|--------|--------|
| Created invoice with fixed **title: `"Boat Cleaning"`**. | Title is **dynamic**: `"{baseTitle} on {dateStr}"` where `baseTitle` = template’s title or `"Boat Cleaning"`, `dateStr` = event’s `start_at` date (e.g. `3/10/2025`). Stored and returned the same way; only the value changes. |

- **Request/response shape:** Unchanged. Still 201 + published invoice object.

---

## 4. Integrations API

### PATCH `/api/integrations`

| Before | After |
|--------|--------|
| Body could set `google_calendar_id`. | Same. **Behavior:** Updating **`google_calendar_id`** only updates the stored value; **no deletion** of `calendar_events` or other calendar data. GET `/api/calendar/events` uses the new value to filter by `source_calendar_id`. |

- **Response shape:** Unchanged.

---

## 5. Client API usage (for reference)

- **`getCalendarList()`** — **New.** GET `/api/calendar/list`; returns list of calendars for dropdown.
- **`getEvents(params)`** — Now sends **`fromDate`** and **`toDateEnd`** (ISO) when `from` and `to` are set, so “to” is end-of-day in local time.
- **`syncCalendar(params)`** — Can take **`{ from, to }`**; sends **`fromDate`** and **`toDateEnd`** (with `toDateEnd` = start of **next** day so Google’s exclusive `timeMax` includes the last day).

---

## 6. UI / product (for reference)

- **Settings:** Google Calendar section now has **Connect / Reconnect** button and a **Calendar** dropdown (from `getCalendarList`). Saving **`google_calendar_id`** via `updateIntegrations`; only events from the selected calendar appear on the Dashboard. Copy updated to direct users to Settings for connecting.
- **Dashboard:** **Connect Google Calendar** link removed. Shows **“Calendar: [name]”** (from `getIntegrations` + `getCalendarList`) as a link to **Settings**. Sync error and empty-state copy updated to say “in Settings”.

---

## 7. Schema / migrations (from branch)

- **1739980000002_calendar_events_recurring_event_id.cjs**  
  - `calendar_events`: new column **`recurring_event_id`** (varchar 255, nullable). Index `(user_id, recurring_event_id)`. Backfill from `raw_json->>'recurringEventId'`.

- **1739980000003_one_time_square_orders_drafts_only.cjs**  
  - One-time: `event_invoice_mappings.square_order_id` set to NULL where not null; **all `square_orders` rows deleted**. Next sync repopulates with drafts only.

- **1739980000004_event_mappings_recurring_series_id.cjs**  
  - `event_invoice_mappings`: new column **`recurring_series_id`** (varchar 255, nullable). Index `(user_id, recurring_series_id)`. Backfill from linked `calendar_events.recurring_event_id` or `raw_json->>'recurringEventId'`.  
  - **Idempotent:** uses `ADD COLUMN IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` so re-running migration is safe.

- **1739980000005_calendar_events_source_calendar_id.cjs**  
  - `calendar_events`: new column **`source_calendar_id`** (varchar 255, nullable). Set on sync from the calendar used for the request; GET `/api/calendar/events` filters by user’s selected `google_calendar_id`.

---

## 8. New npm scripts

- **Root:** `db:reset-calendar-invoices` → `cd server && npm run db:reset-calendar-invoices`
- **Server:** `db:reset-calendar-invoices` → `node scripts/reset-calendar-and-invoices.js` (migrations + reset script for calendar/invoices state).

---

## Quick reference: new/updated contracts

| Endpoint | New/changed |
|----------|----------------|
| **GET calendar/list** | **New.** Returns calendar list `[{ id, summary, primary }]`. 401 + `google_reconnect` on expired token. |
| GET calendar/events | Query: optional `fromDate`, `toDateEnd` (ISO); `to` = end of day. **Filter by** user’s **`google_calendar_id`** (`source_calendar_id` match or NULL when primary). |
| POST calendar/sync | Body: optional `from`, `to`, `fromDate`, `toDateEnd`. Sets **`source_calendar_id`** on upsert. 401 + `code: 'google_reconnect'` on expired token. Auto-link recurring events to existing series mappings. |
| PATCH integrations | **`google_calendar_id`** update does not delete calendar data; events filtered by selected calendar. |
| POST mappings | 404 if event not found. Propagates link to all same-series events; sets `recurring_series_id`. |
| POST square/sync | Only DRAFT invoices synced. |
| GET square/invoices | Filter: drafts only. Response items include `title`. |
| POST square/invoices/from-template | Invoice title is `"{baseTitle} on {dateStr}"`. |
