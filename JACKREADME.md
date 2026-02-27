# Diver Now Admin – API Reference

Base URL: your server (e.g. `https://yourapp.com` or `http://localhost:5000`).  
All requests that require auth must send **cookies** (`credentials: 'include'` in fetch).

---

## Authentication

**Session:** Cookie-based. After login, the server sets a session cookie; include it on every request.


| Method | Endpoint           | Auth | Body                  | Description                                                |
| ------ | ------------------ | ---- | --------------------- | ---------------------------------------------------------- |
| POST   | `/api/auth/login`  | No   | `{ email, password }` | Log in. Returns `{ id, email, role }`.                     |
| POST   | `/api/auth/logout` | No   | —                     | Log out, clear session.                                    |
| GET    | `/api/me`          | Yes  | —                     | Current user: `{ id, email, role }`. 401 if not logged in. |


**Creating users (e.g. for first-time app signup):**  
POST `/api/admin/users` with header `X-Admin-Secret: <ADMIN_SECRET>` and body `{ email, password, role?: "user" }`. Returns 201 with user. (Admin-only; get the secret from the server operator.)

---

## Push notifications (iPhone)


| Method | Endpoint             | Auth | Body                                       | Description                                                                |
| ------ | -------------------- | ---- | ------------------------------------------ | -------------------------------------------------------------------------- |
| POST   | `/api/push/register` | No   | `{ deviceToken, email, platform?: "ios" }` | Register device for push. User is identified by `email`. Call after login. |


**Server behavior:** A daily cron job runs (e.g. 8 PM). For each user who had at least one “Job Completed” that day, the server sends an APNs notification: *"You had N boat(s) cleaned today."*  
**iPhone app:** Request push permission, get the device token, then call `POST /api/push/register` with that token and the user’s email.

---

## Calendar & events


| Method | Endpoint               | Auth | Query / Body              | Description                                                                                     |
| ------ | ---------------------- | ---- | ------------------------- | ----------------------------------------------------------------------------------------------- |
| GET    | `/api/calendar/events` | Yes  | `from`, `to` (YYYY-MM-DD) | List events in date range. Returns `[{ id, external_id, title, start_at, end_at, synced_at }]`. |
| POST   | `/api/calendar/sync`   | Yes  | —                         | Pull events from Google Calendar into DB. Requires Google connected in integrations.            |


**Note:** Google OAuth is done in the web app (redirect to `/api/auth/google`). The app stores a refresh token. The iPhone app uses the same backend; no separate Google login in the app if the user has already connected on the web.

---

## Cleaning records (job status per event)


| Method | Endpoint         | Auth | Body                                                 | Description                                                                                                                                                                                                                           |
| ------ | ---------------- | ---- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/cleanings` | Yes  | —                                                    | All records. Each: `id, calendar_event_id, status, notes, extra_work, square_order_id, order_id, created_at, updated_at`. `status`: `"pending"`, `"yes"`, `"no"`. `square_order_id` set when an invoice has been sent for that event. |
| POST   | `/api/cleanings` | Yes  | `{ calendar_event_id, status, notes?, extra_work? }` | Create or update record for that event. Use `status: "yes"` for Job Completed, `"no"` for Skipped. `extra_work`: JSON string of `[{ title, value }]` for extra line items.                                                            |


---

## Event–invoice mappings (link template to event)


| Method | Endpoint            | Auth | Body / Params                     | Description                                                                                                |
| ------ | ------------------- | ---- | --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| GET    | `/api/mappings`     | Yes  | —                                 | All mappings. Each: `id, calendar_event_id, order_id` (Square template id), etc.                           |
| POST   | `/api/mappings`     | Yes  | `{ calendar_event_id, order_id }` | Link event to a Square invoice template. `order_id` = Square invoice/order id from `/api/square/invoices`. |
| DELETE | `/api/mappings/:id` | Yes  | —                                 | Remove mapping.                                                                                            |


---

## Square (invoices & sending)


| Method | Endpoint                             | Auth | Body / Query                                                   | Description                                                                                                                                                                                                                     |
| ------ | ------------------------------------ | ---- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/square/invoices`               | Yes  | —                                                              | List Square invoices (templates + sent). Each has `external_order_id`, `customer_email`, `customer_name`, `amount`, `sales_line_items` (name, quantity, total_money in cents), etc.                                             |
| GET    | `/api/square/invoices/:id`           | Yes  | —                                                              | Raw Square invoice by `external_order_id`.                                                                                                                                                                                      |
| POST   | `/api/square/sync`                   | Yes  | —                                                              | Sync invoices from Square into DB (and fetch order line items).                                                                                                                                                                 |
| GET    | `/api/square/locations`              | Yes  | —                                                              | List Square locations (for settings).                                                                                                                                                                                           |
| POST   | `/api/square/invoices/from-template` | Yes  | `{ calendar_event_id, extra_work_items?: [{ title, value }] }` | Create and send invoice from the event’s linked template; add optional extra line items. Sends by email if template has customer. Backend sets `square_order_id` on the cleaning record so the same event cannot be sent twice. |


**Flow:** Link a template to an event (mappings), then call `from-template` for that `calendar_event_id`. Do not send twice for the same event (check cleaning record’s `square_order_id`).

---

## Integrations (settings)


| Method | Endpoint            | Auth | Body                                                                 | Description                                                                                                       |
| ------ | ------------------- | ---- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/integrations` | Yes  | —                                                                    | `google_connected`, `squarespace_connected`, `square_connected`, `google_calendar_id`, `square_location_id`, etc. |
| PATCH  | `/api/integrations` | Yes  | `{ square_access_token?, square_location_id?, google_calendar_id? }` | Update stored tokens/ids. Omit a key to leave it unchanged.                                                       |


Google OAuth itself is done via the web (redirect). The app can show Square token/location and calendar ID; typically the user sets Square on the web and uses the app for day-to-day actions.

---

## Analytics


| Method | Endpoint                   | Auth | Query                     | Description                                                   |
| ------ | -------------------------- | ---- | ------------------------- | ------------------------------------------------------------- |
| GET    | `/api/analytics/summary`   | Yes  | `from`, `to` (YYYY-MM-DD) | `{ totalCleanings, totalRevenue, uniqueCustomers }` in range. |
| GET    | `/api/analytics/customers` | Yes  | `from`, `to`              | Per-customer: `[{ customer, cleanings, revenue }]`.           |


---

## Errors

- **401** – Not authenticated (no or invalid session).
- **403** – Forbidden (e.g. admin secret wrong).
- **4xx/5xx** – JSON body often has `{ error, detail? }`.

---

## Suggested iPhone app flows

1. **Login** – POST `/api/auth/login`; store session (cookie). GET `/api/me` to confirm.
2. **Push** – After login, register device: POST `/api/push/register` with APNs token and user email.
3. **Dashboard** – GET `/api/calendar/events?from=…&to=…`, GET `/api/cleanings`, GET `/api/mappings`, GET `/api/square/invoices`. Merge by `calendar_event_id` to show events with status, linked template, and “Send invoice” (only if completed, linked, and no `square_order_id` on the cleaning record).
4. **Mark job completed/skipped** – POST `/api/cleanings` with `calendar_event_id` and `status: "yes"` or `"no"`.
5. **Add extra work** – POST `/api/cleanings` with same `calendar_event_id`, `status`, `notes`, and `extra_work` as JSON array of `{ title, value }`.
6. **Link invoice** – POST `/api/mappings` with `calendar_event_id` and `order_id` (from Square invoices list).
7. **Send invoice** – POST `/api/square/invoices/from-template` with `calendar_event_id` and optional `extra_work_items`.
8. **Analytics** – GET `/api/analytics/summary` and `/api/analytics/customers` with date range.

