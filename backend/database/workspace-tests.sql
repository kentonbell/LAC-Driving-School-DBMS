-- Run after schema, portal, workspace, catalog and demo migrations in a fresh disposable DB.
BEGIN;
INSERT INTO application_user(auth_provider_user_id,role) VALUES ('workspace-test-admin','admin');
INSERT INTO portal_access(token_digest,user_id,expires_at)
SELECT repeat('a',64),user_id,now()+interval '1 day' FROM application_user WHERE auth_provider_user_id='workspace-test-admin';
SELECT seed_demo_data();
DO $$
DECLARE
 admin bigint := (SELECT user_id FROM application_user WHERE auth_provider_user_id='workspace-test-admin');
 alex_user bigint := (SELECT user_id FROM application_user WHERE auth_provider_user_id='demo-student');
 alex bigint := (SELECT student_id FROM application_user WHERE user_id=alex_user);
 sam bigint := (SELECT student_id FROM application_user WHERE auth_provider_user_id='demo-student-2');
 taylor bigint := (SELECT instructor_id FROM application_user WHERE auth_provider_user_id='demo-instructor');
 taylor_user bigint := (SELECT user_id FROM application_user WHERE auth_provider_user_id='demo-instructor');
 morgan bigint := (SELECT instructor_id FROM application_user WHERE auth_provider_user_id='demo-driver');
 driver_user bigint := (SELECT user_id FROM application_user WHERE auth_provider_user_id='demo-driver');
 v bigint := (SELECT service_id FROM service WHERE public_key='lesson');
 tomorrow date := (now() AT TIME ZONE 'America/Vancouver')::date+1;
 pickups text[] := ARRAY['19950 Willowbrook Drive, Langley Township, BC'];
 l bigint;
 r bigint;
 group_lesson bigint;
 booking jsonb;
 result jsonb;
BEGIN
 IF (SELECT count(*) FROM lesson WHERE NOT counts_toward_package) <> 50 OR EXISTS (
  SELECT 1 FROM lesson
  CROSS JOIN LATERAL (SELECT start_at AT TIME ZONE 'America/Vancouver' AS local_start) local
  WHERE NOT counts_toward_package AND (
   local_start < date '2026-11-01' OR local_start >= date '2026-12-01'
   OR extract(isodow FROM local_start) NOT BETWEEN 1 AND 5
  )
 ) THEN
  RAISE EXCEPTION 'Expected 50 extra November 2026 weekday bookings';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM student_package_balance WHERE student_id=alex AND remaining_lessons=4 AND reserved_lessons=1 AND unallocated_lessons=3) THEN
  RAISE EXCEPTION 'Invalid seeded entitlement';
 END IF;
 SELECT lesson_id INTO STRICT l FROM lesson WHERE student_id=alex AND status='scheduled' AND counts_toward_package;
 result := workspace_action(alex_user,'cancel',jsonb_build_object('lesson',l),pickups);
 IF result <> '{"pending":true}' THEN RAISE EXCEPTION 'Late cancellation skipped approval'; END IF;
 SELECT request_id INTO STRICT r FROM approval_request WHERE lesson_id=l AND status='pending';
 PERFORM workspace_action(admin,'decision',jsonb_build_object('id',r,'decision','Approve'),pickups);
 IF NOT EXISTS(SELECT 1 FROM student_package_balance WHERE student_id=alex AND remaining_lessons=4 AND reserved_lessons=0 AND unallocated_lessons=4) THEN
  RAISE EXCEPTION 'Cancellation did not release the reservation';
 END IF;
 booking := jsonb_build_object('student',sam,'staff',taylor,'service',v,'pickup',0,
  'start',extract(epoch from ((tomorrow+2+time '13:00') AT TIME ZONE 'America/Vancouver'))*1000);
 PERFORM workspace_action(alex_user,'book',jsonb_build_object('booking',booking,'mode','group'),pickups);
 SELECT request_id INTO STRICT r FROM approval_request WHERE user_id=alex_user AND kind='group';
 PERFORM workspace_action(admin,'decision',jsonb_build_object('id',r,'decision','Approve','participants',ARRAY[sam]),pickups);
 SELECT lesson_id INTO STRICT group_lesson FROM lesson_guest WHERE student_id=sam;
 IF NOT EXISTS(SELECT 1 FROM lesson WHERE lesson_id=group_lesson AND student_id=alex) THEN
  RAISE EXCEPTION 'Student supplied identity was trusted';
 END IF;
 BEGIN
  PERFORM workspace_action(admin,'book',jsonb_build_object('booking',booking||jsonb_build_object('staff',morgan)),pickups);
  RAISE assertion_failure USING MESSAGE='Group participant double-booked';
 EXCEPTION WHEN raise_exception THEN NULL;
 END;
 BEGIN
  PERFORM workspace_action(alex_user,'payment',jsonb_build_object('student',alex,'amount',1),pickups);
  RAISE assertion_failure USING MESSAGE='Student recorded a payment';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 SELECT lesson_id INTO l FROM lesson WHERE status='completed' ORDER BY lesson_id LIMIT 1;
 BEGIN
  PERFORM workspace_action(driver_user,'record',jsonb_build_object('lesson',l,'student',alex,'attendance','Present'),pickups);
  RAISE assertion_failure USING MESSAGE='Unassigned driver saved feedback';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM workspace_action(taylor_user,'record',jsonb_build_object('lesson',l,'student',alex,'attendance','Present','score',95,'visible',true),pickups);
 IF NOT EXISTS(SELECT 1 FROM lesson_record WHERE lesson_id=l AND student_id=alex AND score=95) THEN
  RAISE EXCEPTION 'Feedback was not persisted';
 END IF;
END $$;
SELECT empty_demo_data();
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM student) OR EXISTS(SELECT 1 FROM lesson) OR EXISTS(SELECT 1 FROM service)
 OR NOT EXISTS(SELECT 1 FROM portal_access WHERE token_digest=repeat('a',64))
 THEN RAISE EXCEPTION 'Reset did not clear demo records and preserve admin access'; END IF;
END $$;
SELECT seed_demo_data();
ROLLBACK;
