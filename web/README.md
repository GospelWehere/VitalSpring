# Vital Spring Medical Center — Clinic Appointment System

INS 204 System Specification (Group 9) implementation. A clinic appointment
system covering registration, slot-based booking, queue management, clinical
visits, notifications, reporting, administration, backup, and a patient
portal.

- **Live deployment:** https://vital-spring.vercel.app
- **Stack:** Next.js 16 (App Router, server actions), PostgreSQL (Neon),
  TypeScript, Tailwind CSS, vitest.
- **Design source:** `../report/Vital_Spring_System_Specification.html`
  and `../database/vital-spring-schema.sql`.

## Demo accounts

| Role          | Username   | Password            |
|---------------|------------|---------------------|
| Administrator | `admin`    | `Administrator@123` |
| Manager       | `manager`  | `Manager@123`       |
| Reception     | `reception`| `Reception@123`     |
| Records       | `records`  | `Records@123`       |
| Nurse         | `nurse`    | `Nurse@123`         |
| Doctor        | `doctor`   | `Doctor@123`        |

Demo patient: **Amarachi Okafor** (hospital number `VS-000001`, phone
`08033124567`). Practitioner 1 is in General Outpatient.

## Getting started

```bash
cp .env.local.example .env.local   # set DATABASE_URL (Neon) + SESSION_SECRET
npm install
npm run dev                        # http://localhost:3000
```

Database setup (creates schema + seed data in the configured database):

```bash
npx tsx --env-file=.env.local db/seed.ts
```

## Testing

```bash
npm test          # vitest integration tests AT-01 .. AT-07 against the configured database
node scripts/smoke-full.mjs   # end-to-end flow against a running build (npm run start)
npm run lint
npx tsc --noEmit
```

### Acceptance tests

| ID   | Scenario | Result |
|------|----------|--------|
| AT-01 | Two users confirm the same slot simultaneously | Exactly one appointment commits; the other receives alternatives |
| AT-02 | Reception user attempts to open a visit-record address | Access denied; no clinical text returned; denied attempt logged |
| AT-03 | Registration uses an existing phone and matching DOB/name | Possible duplicate displayed before any new patient is created |
| AT-04 | Reception checks in one appointment twice | One queue entry remains; second attempt explains current queue number |
| AT-05 | Message provider reports temporary failure | Notification becomes retrying and later records final delivery result |
| AT-06 | Backup restoration exercise | Export/restore round trip preserves every table; sequences re-synced so the service keeps working afterwards |
| AT-07 | Manager runs the June General Outpatient report | Totals reconcile with underlying data; median wait uses queue timestamps |

## Feature map

- **Authentication / accounts** — JWT sessions (`vs_session`, 15-minute
  inactivity timeout), role-based access control (receptionist, records,
  nurse, doctor, manager, administrator), account disable and password reset.
- **Patients** — registration with duplicate detection (phone, DOB + name),
  search, edit, hospital numbers from `hospital_number_seq`.
- **Booking** — slot list per practitioner/date, one-transaction booking
  (row lock + partial unique index on active `appointment.slot_id`),
  reschedule, cancel, patient portal booking/cancellation.
- **Queue** — check-in (one numbered entry per appointment per day),
  transitions `waiting → vitals → called → with_practitioner → completed`
  with role enforcement, live queue with waiting minutes.
- **Visits** — clinical record save (doctor only), clinical history
  (doctor/nurse only, denied access logged), NFR-12: patient messages omit
  diagnosis.
- **Notifications** — simulated SMS provider with queued/retrying/delivered
  states and retry logic.
- **Reports** — attendance, wait time (median from queue timestamps),
  utilisation, no-show summary; manager-only.
- **Administration** — account management, audit trail, protected JSON
  backup export/restore (all 10 tables, one transaction).
- **Downtime** — offline pack page with manual back-capture guidance.

## Implementation deviations from the specification

1. **Slot rebooking after cancellation** — the reference schema declares
   `UNIQUE (slot_id)` on `appointment`. Because the cancellation flow reopens
   the slot, a cancelled row would permanently block rebooking. The unique
   constraint is therefore a **partial unique index on active slots only**
   (`WHERE status NOT IN ('cancelled', 'no_show')`), preserving the AT-01
   double-booking barrier for concurrent active bookings while letting a
   cancelled appointment's slot be booked again.
2. **Date handling** — PostgreSQL returns `DATE` columns as JavaScript
   `Date` objects; all comparisons normalise through `clinicDateISO()` in
   `lib/dates.ts`.
3. **Notification provider** — the real SMS/email gateway is simulated
   (`processNotificationQueue` in `lib/notify.ts`); retries and final
   delivery are recorded in the `notification` table.
4. **Backup restore** — restoration also re-synchronises every BIGSERIAL
   sequence (not just `hospital_number_seq`) so the service continues to
   accept inserts after a restore.

## Deployment

```bash
vercel env add DATABASE_URL production
vercel env add SESSION_SECRET production
vercel deploy --prod
```
