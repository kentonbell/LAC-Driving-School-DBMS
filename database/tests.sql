-- Run after seed.sql in an isolated development database. All edits roll back.
BEGIN;
DO $$
DECLARE
    purchase bigint;
    student bigint;
    instructor bigint;
    service bigint;
    other_student bigint;
    booking bigint;
    balance record;
    n integer;
BEGIN
    SELECT p.purchase_id, p.student_id, p.service_id INTO STRICT purchase, student, service
    FROM package_purchase p JOIN student s USING (student_id) WHERE s.email = 'alex@example.test';
    SELECT instructor_id INTO STRICT instructor FROM instructor WHERE email = 'taylor@example.test';
    SELECT student_id INTO STRICT other_student FROM student WHERE email = 'sam@example.test';
    SELECT * INTO STRICT balance FROM student_package_balance WHERE purchase_id = purchase;
    IF balance.consumed_lessons <> 2 OR balance.reserved_lessons <> 1 OR
       balance.remaining_lessons <> 4 OR balance.unallocated_lessons <> 3 THEN
        RAISE EXCEPTION 'Seed balance is incorrect';
    END IF;

    BEGIN
        INSERT INTO lesson (student_id, instructor_id, service_id, start_at, end_at, pickup_address)
        VALUES (other_student, instructor, service, '2026-11-06 10:30 America/Vancouver',
                '2026-11-06 12:00 America/Vancouver', 'Demo');
        RAISE EXCEPTION 'Overlapping instructor booking was accepted';
    EXCEPTION WHEN exclusion_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO lesson (student_id, instructor_id, service_id, purchase_id,
                            start_at, end_at, pickup_address, counts_toward_package)
        VALUES (other_student, instructor, service, purchase,
                '2026-11-07 10:00 America/Vancouver', '2026-11-07 11:30 America/Vancouver', 'Demo', true);
        RAISE EXCEPTION 'Another student used the purchase';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    -- Reserve the last three units, bringing allocations to six.
    FOR n IN 1..3 LOOP
        INSERT INTO lesson (student_id, instructor_id, service_id, purchase_id,
                            start_at, end_at, pickup_address, counts_toward_package)
        VALUES (student, instructor, service, purchase,
                '2026-11-10 10:00 America/Vancouver'::timestamptz + n * interval '1 day',
                '2026-11-10 11:30 America/Vancouver'::timestamptz + n * interval '1 day', 'Demo', true)
        RETURNING lesson_id INTO booking;
    END LOOP;
    BEGIN
        INSERT INTO lesson (student_id, instructor_id, service_id, purchase_id,
                            start_at, end_at, pickup_address, counts_toward_package)
        VALUES (student, instructor, service, purchase, '2026-11-20 10:00 America/Vancouver',
                '2026-11-20 11:30 America/Vancouver', 'Demo', true);
        RAISE EXCEPTION 'TEST FAILURE: over-allocation was accepted';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM <> 'No unallocated lessons remain in this package' THEN RAISE; END IF;
    END;
    UPDATE lesson SET status = 'cancelled' WHERE lesson_id = booking;
    SELECT * INTO STRICT balance FROM student_package_balance WHERE purchase_id = purchase;
    IF balance.unallocated_lessons <> 1 THEN RAISE EXCEPTION 'Cancellation did not release entitlement'; END IF;
    INSERT INTO lesson (student_id, instructor_id, service_id, purchase_id,
                        start_at, end_at, pickup_address, counts_toward_package)
    VALUES (student, instructor, service, purchase, '2026-11-20 10:00 America/Vancouver',
            '2026-11-20 11:30 America/Vancouver', 'Demo', true);
    BEGIN
        UPDATE package_purchase SET lessons_purchased = 100 WHERE purchase_id = purchase;
        RAISE EXCEPTION 'TEST FAILURE: purchase terms changed';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM <> 'Purchase terms cannot be changed after recording' THEN RAISE; END IF;
    END;
    RAISE NOTICE 'Database smoke tests passed';
END;
$$;
ROLLBACK;
