-- LAC Driving School: first PostgreSQL schema.

BEGIN;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE student (
    student_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    first_name text NOT NULL CHECK (btrim(first_name) <> ''),
    last_name text NOT NULL CHECK (btrim(last_name) <> ''),
    email text NOT NULL CHECK (btrim(email) <> ''),
    phone text,
    default_pickup_address text,
    registration_date date NOT NULL DEFAULT CURRENT_DATE,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive'))
);

CREATE TABLE instructor (
    instructor_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    first_name text NOT NULL CHECK (btrim(first_name) <> ''),
    last_name text NOT NULL CHECK (btrim(last_name) <> ''),
    email text NOT NULL CHECK (btrim(email) <> ''),
    phone text,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive'))
);

CREATE TABLE service (
    service_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    service_name text NOT NULL CHECK (btrim(service_name) <> ''),
    description text,
    licence_class text NOT NULL,
    duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
    base_price numeric(10,2) NOT NULL CHECK (base_price >= 0),
    is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE package (
    package_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    service_id bigint NOT NULL REFERENCES service ON DELETE RESTRICT,
    package_name text NOT NULL CHECK (btrim(package_name) <> ''),
    number_of_lessons integer NOT NULL CHECK (number_of_lessons > 0),
    package_price numeric(10,2) NOT NULL CHECK (package_price >= 0),
    is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE package_purchase (
    purchase_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    student_id bigint NOT NULL REFERENCES student ON DELETE RESTRICT,
    package_id bigint NOT NULL REFERENCES package ON DELETE RESTRICT,
    -- Snapshot the service, allowance and price when the purchase is made.
    service_id bigint NOT NULL REFERENCES service ON DELETE RESTRICT,
    purchase_date date NOT NULL DEFAULT CURRENT_DATE,
    lessons_purchased integer NOT NULL CHECK (lessons_purchased > 0),
    agreed_price numeric(10,2) NOT NULL CHECK (agreed_price >= 0),
    expiry_date date,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
    CHECK (expiry_date IS NULL OR expiry_date >= purchase_date),
    UNIQUE (purchase_id, student_id, service_id)
);

CREATE TABLE lesson (
    lesson_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    student_id bigint NOT NULL REFERENCES student ON DELETE RESTRICT,
    instructor_id bigint NOT NULL REFERENCES instructor ON DELETE RESTRICT,
    service_id bigint NOT NULL REFERENCES service ON DELETE RESTRICT,
    purchase_id bigint,
    start_at timestamptz NOT NULL,
    end_at timestamptz NOT NULL,
    pickup_address text NOT NULL CHECK (btrim(pickup_address) <> ''),
    status text NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
    counts_toward_package boolean NOT NULL DEFAULT false,
    booking_notes text,
    -- Internal counter slot: each package-funded reservation occupies one unit.
    entitlement_slot integer,
    CHECK (end_at > start_at),
    CHECK (NOT counts_toward_package OR purchase_id IS NOT NULL),
    CHECK ((counts_toward_package AND status <> 'cancelled') = (entitlement_slot IS NOT NULL)),
    CHECK (entitlement_slot IS NULL OR entitlement_slot > 0),
    FOREIGN KEY (purchase_id, student_id, service_id)
        REFERENCES package_purchase (purchase_id, student_id, service_id) ON DELETE RESTRICT,
    UNIQUE (purchase_id, entitlement_slot),
    -- Adjacent lessons are allowed; cancelled bookings release the time.
    EXCLUDE USING gist (instructor_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&)
        WHERE (status <> 'cancelled'),
    EXCLUDE USING gist (student_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&)
        WHERE (status <> 'cancelled')
);

CREATE TABLE instructor_availability (
    availability_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    instructor_id bigint NOT NULL REFERENCES instructor ON DELETE RESTRICT,
    start_at timestamptz NOT NULL,
    end_at timestamptz NOT NULL,
    CHECK (end_at > start_at),
    EXCLUDE USING gist (instructor_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&)
);

CREATE TABLE application_user (
    user_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    auth_provider_user_id text NOT NULL UNIQUE CHECK (btrim(auth_provider_user_id) <> ''),
    role text NOT NULL CHECK (role IN ('admin', 'instructor', 'student')),
    student_id bigint UNIQUE REFERENCES student ON DELETE RESTRICT,
    instructor_id bigint UNIQUE REFERENCES instructor ON DELETE RESTRICT,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (
        (role = 'admin' AND student_id IS NULL AND instructor_id IS NULL) OR
        (role = 'student' AND student_id IS NOT NULL AND instructor_id IS NULL) OR
        (role = 'instructor' AND instructor_id IS NOT NULL AND student_id IS NULL)
    )
);

CREATE TABLE lesson_feedback (
    feedback_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    lesson_id bigint NOT NULL REFERENCES lesson ON DELETE RESTRICT,
    author_user_id bigint NOT NULL REFERENCES application_user ON DELETE RESTRICT,
    strengths text,
    areas_to_improve text,
    next_lesson_focus text,
    visibility text NOT NULL DEFAULT 'instructor_only'
        CHECK (visibility IN ('student_visible', 'instructor_only')),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Assign the smallest free package slot. The unique constraint prevents two
-- concurrent requests claiming the same unit; API retries the whole transaction.
CREATE FUNCTION assign_entitlement_slot() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    purchased package_purchase%ROWTYPE;
BEGIN
    NEW.entitlement_slot := NULL;
    IF NEW.purchase_id IS NULL THEN RETURN NEW; END IF;
    SELECT * INTO STRICT purchased FROM package_purchase WHERE purchase_id = NEW.purchase_id FOR UPDATE;
    IF NOT NEW.counts_toward_package OR NEW.status = 'cancelled' THEN RETURN NEW; END IF;
    IF purchased.status <> 'active' THEN
        RAISE EXCEPTION 'Package purchase is not active';
    END IF;
    IF (NEW.start_at AT TIME ZONE 'America/Vancouver')::date < purchased.purchase_date OR
       (purchased.expiry_date IS NOT NULL AND
        (NEW.start_at AT TIME ZONE 'America/Vancouver')::date > purchased.expiry_date) THEN
        RAISE EXCEPTION 'Lesson date is outside the package purchase dates';
    END IF;
    SELECT candidate INTO NEW.entitlement_slot
    FROM generate_series(1, purchased.lessons_purchased) AS slots(candidate)
    WHERE NOT EXISTS (
        SELECT 1 FROM lesson l WHERE l.purchase_id = NEW.purchase_id
        AND l.entitlement_slot = candidate AND l.lesson_id <> NEW.lesson_id
    ) ORDER BY candidate LIMIT 1;
    IF NEW.entitlement_slot IS NULL THEN
        RAISE EXCEPTION 'No unallocated lessons remain in this package';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER lesson_entitlement BEFORE INSERT OR UPDATE ON lesson
FOR EACH ROW EXECUTE FUNCTION assign_entitlement_slot();

-- Historical purchase terms are immutable. Corrections need a reviewed migration.
CREATE FUNCTION protect_purchase_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF ROW(NEW.student_id, NEW.package_id, NEW.service_id, NEW.purchase_date,
           NEW.lessons_purchased, NEW.agreed_price, NEW.expiry_date)
       IS DISTINCT FROM
       ROW(OLD.student_id, OLD.package_id, OLD.service_id, OLD.purchase_date,
           OLD.lessons_purchased, OLD.agreed_price, OLD.expiry_date) THEN
        RAISE EXCEPTION 'Purchase terms cannot be changed after recording';
    END IF;
    IF NEW.status = 'cancelled' AND EXISTS (
        SELECT 1 FROM lesson WHERE purchase_id = OLD.purchase_id AND status = 'scheduled'
    ) THEN RAISE EXCEPTION 'Cancel scheduled lessons before cancelling their purchase'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_purchase_terms BEFORE UPDATE ON package_purchase
FOR EACH ROW EXECUTE FUNCTION protect_purchase_terms();

CREATE INDEX lesson_purchase_idx ON lesson (purchase_id);
CREATE INDEX purchase_student_idx ON package_purchase (student_id);
CREATE INDEX package_service_idx ON package (service_id);
CREATE INDEX purchase_package_idx ON package_purchase (package_id);
CREATE INDEX purchase_service_idx ON package_purchase (service_id);
CREATE INDEX lesson_service_idx ON lesson (service_id);
CREATE INDEX feedback_lesson_idx ON lesson_feedback (lesson_id);
CREATE INDEX feedback_author_idx ON lesson_feedback (author_user_id);

CREATE VIEW student_package_balance AS
SELECT p.purchase_id, p.student_id, p.package_id, p.lessons_purchased,
       p.purchase_date, p.expiry_date, p.status,
       count(l.lesson_id) FILTER (WHERE l.status IN ('completed', 'no_show')) AS consumed_lessons,
       count(l.lesson_id) FILTER (WHERE l.status = 'scheduled') AS reserved_lessons,
       p.lessons_purchased - count(l.lesson_id)
           FILTER (WHERE l.status IN ('completed', 'no_show')) AS remaining_lessons,
       p.lessons_purchased - count(l.lesson_id)
           FILTER (WHERE l.status <> 'cancelled') AS unallocated_lessons
FROM package_purchase p
LEFT JOIN lesson l ON l.purchase_id = p.purchase_id AND l.counts_toward_package
GROUP BY p.purchase_id;

CREATE VIEW lesson_schedule AS
SELECT l.*, s.first_name || ' ' || s.last_name AS student_name,
       i.first_name || ' ' || i.last_name AS instructor_name, v.service_name
FROM lesson l JOIN student s USING (student_id)
JOIN instructor i USING (instructor_id) JOIN service v USING (service_id);

CREATE VIEW instructor_workload AS
SELECT instructor_id, (start_at AT TIME ZONE 'America/Vancouver')::date AS lesson_date,
       count(*) FILTER (WHERE status = 'scheduled') AS scheduled_lessons,
       count(*) FILTER (WHERE status = 'completed') AS completed_lessons,
       sum(EXTRACT(epoch FROM (end_at - start_at)) / 3600)
           FILTER (WHERE status = 'completed') AS completed_hours
FROM lesson GROUP BY instructor_id, (start_at AT TIME ZONE 'America/Vancouver')::date;

CREATE VIEW cancellation_summary AS
SELECT * FROM lesson_schedule WHERE status IN ('cancelled', 'no_show');

CREATE VIEW student_lesson_history AS
SELECT * FROM lesson_schedule WHERE status IN ('completed', 'cancelled', 'no_show');

CREATE VIEW students_needing_follow_up AS
SELECT s.* FROM student s
WHERE s.status = 'active' AND EXISTS (
    SELECT 1 FROM student_package_balance b WHERE b.student_id = s.student_id
    AND b.status = 'active' AND b.remaining_lessons > 0
    AND (b.expiry_date IS NULL OR b.expiry_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Vancouver')::date)
) AND NOT EXISTS (
    SELECT 1 FROM lesson l WHERE l.student_id = s.student_id
    AND l.status = 'scheduled' AND l.start_at >= CURRENT_TIMESTAMP
);
COMMIT;
