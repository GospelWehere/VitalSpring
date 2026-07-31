-- Vital Spring Medical Center Clinic Appointment System
-- PostgreSQL reference schema for the INS 204 system specification.

CREATE TABLE department (
  department_id BIGSERIAL PRIMARY KEY,
  department_name VARCHAR(80) NOT NULL UNIQUE,
  location VARCHAR(80) NOT NULL
);

CREATE TABLE user_account (
  user_id BIGSERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK
    (role IN ('receptionist', 'records', 'nurse', 'doctor', 'manager', 'administrator')),
  display_name VARCHAR(100) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login TIMESTAMPTZ
);

CREATE TABLE patient (
  patient_id BIGSERIAL PRIMARY KEY,
  hospital_number VARCHAR(20) NOT NULL UNIQUE,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  date_of_birth DATE NOT NULL CHECK (date_of_birth <= CURRENT_DATE),
  sex VARCHAR(20) NOT NULL,
  phone VARCHAR(15) NOT NULL,
  email VARCHAR(120),
  address VARCHAR(160) NOT NULL,
  emergency_contact VARCHAR(140) NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_patient_search ON patient (last_name, first_name, date_of_birth);
CREATE INDEX ix_patient_phone ON patient (phone);

CREATE TABLE practitioner (
  practitioner_id BIGSERIAL PRIMARY KEY,
  department_id BIGINT NOT NULL REFERENCES department(department_id) ON DELETE RESTRICT,
  staff_number VARCHAR(20) NOT NULL UNIQUE,
  full_name VARCHAR(100) NOT NULL,
  professional_role VARCHAR(40) NOT NULL,
  phone VARCHAR(15) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE availability_slot (
  slot_id BIGSERIAL PRIMARY KEY,
  practitioner_id BIGINT NOT NULL REFERENCES practitioner(practitioner_id) ON DELETE RESTRICT,
  slot_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  slot_status VARCHAR(16) NOT NULL DEFAULT 'open'
    CHECK (slot_status IN ('open', 'reserved', 'blocked', 'expired')),
  CHECK (end_time > start_time),
  UNIQUE (practitioner_id, slot_date, start_time)
);

CREATE TABLE appointment (
  appointment_id BIGSERIAL PRIMARY KEY,
  patient_id BIGINT NOT NULL REFERENCES patient(patient_id) ON DELETE RESTRICT,
  practitioner_id BIGINT NOT NULL REFERENCES practitioner(practitioner_id) ON DELETE RESTRICT,
  slot_id BIGINT NOT NULL UNIQUE REFERENCES availability_slot(slot_id) ON DELETE RESTRICT,
  recorded_by BIGINT REFERENCES user_account(user_id) ON DELETE SET NULL,
  booking_source VARCHAR(16) NOT NULL
    CHECK (booking_source IN ('patient_portal', 'front_desk', 'telephone', 'walk_in')),
  visit_reason VARCHAR(200) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked', 'confirmed', 'checked_in', 'called',
                      'in_consultation', 'completed', 'cancelled', 'no_show')),
  booked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_appointment_patient ON appointment (patient_id, booked_at DESC);
CREATE INDEX ix_appointment_status ON appointment (status);

CREATE TABLE queue_entry (
  queue_entry_id BIGSERIAL PRIMARY KEY,
  appointment_id BIGINT NOT NULL UNIQUE REFERENCES appointment(appointment_id) ON DELETE RESTRICT,
  checked_in_at TIMESTAMPTZ NOT NULL,
  queue_number SMALLINT NOT NULL CHECK (queue_number > 0),
  queue_status VARCHAR(20) NOT NULL DEFAULT 'waiting'
    CHECK (queue_status IN ('waiting', 'vitals', 'called', 'with_practitioner', 'completed', 'left')),
  called_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  CHECK (called_at IS NULL OR called_at >= checked_in_at),
  CHECK (completed_at IS NULL OR completed_at >= checked_in_at)
);

CREATE TABLE visit_record (
  visit_record_id BIGSERIAL PRIMARY KEY,
  appointment_id BIGINT NOT NULL UNIQUE REFERENCES appointment(appointment_id) ON DELETE RESTRICT,
  presenting_complaint TEXT NOT NULL,
  clinical_findings TEXT,
  diagnosis TEXT,
  care_plan TEXT,
  documented_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notification (
  notification_id BIGSERIAL PRIMARY KEY,
  appointment_id BIGINT NOT NULL REFERENCES appointment(appointment_id) ON DELETE RESTRICT,
  message_type VARCHAR(20) NOT NULL
    CHECK (message_type IN ('confirmation', 'reminder', 'reschedule', 'cancellation')),
  channel VARCHAR(10) NOT NULL CHECK (channel IN ('sms', 'email')),
  destination VARCHAR(120) NOT NULL,
  delivery_status VARCHAR(16) NOT NULL DEFAULT 'queued'
    CHECK (delivery_status IN ('queued', 'sent', 'delivered', 'retrying', 'failed')),
  processed_at TIMESTAMPTZ
);

CREATE TABLE activity_log (
  activity_id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES user_account(user_id) ON DELETE RESTRICT,
  action_type VARCHAR(50) NOT NULL,
  object_type VARCHAR(40) NOT NULL,
  object_id BIGINT,
  action_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_address INET
);

CREATE INDEX ix_activity_user_time ON activity_log (user_id, action_time DESC);
CREATE INDEX ix_activity_object ON activity_log (object_type, object_id, action_time DESC);

-- Appointment confirmation runs in one transaction:
-- lock the selected availability_slot, verify slot_status='open', insert the
-- appointment, then update slot_status='reserved'. The UNIQUE slot_id on
-- appointment provides a second database-level conflict barrier.
