BEGIN;
ALTER TABLE service ADD COLUMN public_key text UNIQUE;
ALTER TABLE lesson ADD COLUMN observer boolean NOT NULL DEFAULT false,
 ADD COLUMN booked_at timestamptz,
 ADD COLUMN agreed_price numeric(10,2) CHECK (agreed_price >= 0);
ALTER TABLE lesson ALTER COLUMN booked_at SET DEFAULT now();
UPDATE lesson l SET agreed_price=s.base_price FROM service s WHERE s.service_id=l.service_id;
CREATE TABLE lesson_guest (
 lesson_id bigint REFERENCES lesson ON DELETE CASCADE,
 student_id bigint REFERENCES student,
 PRIMARY KEY (lesson_id,student_id)
);
CREATE TABLE lesson_record (
 lesson_id bigint REFERENCES lesson ON DELETE CASCADE,
 student_id bigint REFERENCES student,
 attendance text NOT NULL CHECK (attendance IN ('Present','Absent','Late')),
 topics text NOT NULL DEFAULT '', strengths text NOT NULL DEFAULT '',
 improve text NOT NULL DEFAULT '', focus text NOT NULL DEFAULT '',
 score numeric CHECK (score BETWEEN 0 AND 100),
 visible boolean NOT NULL DEFAULT false, private_note text NOT NULL DEFAULT '',
 PRIMARY KEY (lesson_id,student_id)
);
INSERT INTO lesson_record(lesson_id,student_id,attendance,strengths,improve,focus,visible)
SELECT DISTINCT ON (l.lesson_id) l.lesson_id,l.student_id,CASE WHEN l.status='no_show' THEN 'Absent' ELSE 'Present' END,
 coalesce(f.strengths,''),coalesce(f.areas_to_improve,''),coalesce(f.next_lesson_focus,''),f.visibility='student_visible'
FROM lesson_feedback f JOIN lesson l USING(lesson_id) ORDER BY l.lesson_id,f.created_at DESC,f.feedback_id DESC;
CREATE TABLE schedule_block (
 instructor_id bigint REFERENCES instructor, day date, PRIMARY KEY(instructor_id,day)
);
CREATE TABLE approval_request (
 request_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id bigint NOT NULL REFERENCES application_user ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('cancel','reschedule','special','group','schedule')),
 lesson_id bigint REFERENCES lesson ON DELETE CASCADE,
 reason text NOT NULL, booking jsonb, day date,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined')),
 decision text, reviewed_by bigint REFERENCES application_user
);
CREATE UNIQUE INDEX pending_lesson_request ON approval_request(lesson_id) WHERE status='pending';
CREATE TABLE payment (
 payment_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 student_id bigint NOT NULL REFERENCES student, amount numeric(10,2) NOT NULL CHECK(amount>0),
 note text NOT NULL, paid_at timestamptz NOT NULL DEFAULT now()
);
CREATE VIEW lesson_attendee AS
 SELECT lesson_id,student_id FROM lesson UNION ALL SELECT lesson_id,student_id FROM lesson_guest;
CREATE FUNCTION workspace_book(b jsonb, old_id bigint, mode text, guests bigint[], pickup text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
 v service%ROWTYPE;
 sid bigint := (b->>'student')::bigint;
 iid bigint := (b->>'staff')::bigint;
 starts timestamptz := to_timestamp((b->>'start')::double precision/1000);
 ends timestamptz;
 local_start timestamp;
 local_end timestamp;
 weekend boolean;
 pid bigint := nullif(b->>'purchase','')::bigint;
 has_observer boolean := coalesce((b->>'observer')::boolean,false);
 result bigint;
BEGIN
 SELECT * INTO v FROM service WHERE service_id=(b->>'service')::bigint AND is_active;
 IF NOT FOUND OR pickup IS NULL OR starts IS NULL OR starts<=now()
 OR NOT EXISTS(SELECT 1 FROM instructor WHERE instructor_id=iid AND status='active')
 OR EXISTS(SELECT 1 FROM unnest(array_prepend(sid,guests)) a(id) WHERE NOT EXISTS(
   SELECT 1 FROM student WHERE student_id=a.id AND status='active'))
 OR (cardinality(guests)>0 AND NOT EXISTS(SELECT 1 FROM instructor WHERE instructor_id=iid AND staff_role='instructor'))
 OR (cardinality(guests)>0 AND (has_observer OR pid IS NOT NULL OR sid=ANY(guests)))
 THEN RAISE EXCEPTION 'Choose an active student, staff member, service and future time.'; END IF;
 ends := starts + make_interval(mins=>v.duration_minutes);
 local_start := starts AT TIME ZONE 'America/Vancouver';
 local_end := ends AT TIME ZONE 'America/Vancouver';
 weekend := extract(isodow from local_start)>5;
 IF EXISTS(SELECT 1 FROM schedule_block WHERE instructor_id=iid AND day BETWEEN local_start::date AND local_end::date)
 OR (mode <> 'special' AND (
 local_start::date<>local_end::date OR local_start::time < CASE WHEN weekend THEN time '10:00' ELSE time '09:00' END
 OR local_end::time > CASE WHEN weekend THEN time '17:00' ELSE time '18:00' END
 OR NOT EXISTS(SELECT 1 FROM instructor_availability WHERE instructor_id=iid AND start_at<=starts AND end_at>=ends)))
 THEN RAISE EXCEPTION 'Staff is unavailable for that time.'; END IF;
 IF EXISTS(SELECT 1 FROM lesson l WHERE l.lesson_id IS DISTINCT FROM old_id AND l.status<>'cancelled'
 AND l.start_at<ends AND l.end_at>starts AND (l.instructor_id=iid OR EXISTS(
 SELECT 1 FROM lesson_attendee a WHERE a.lesson_id=l.lesson_id AND a.student_id=ANY(array_prepend(sid,guests)))))
 THEN RAISE EXCEPTION 'This time overlaps another lesson.'; END IF;
 IF old_id IS NULL THEN
 INSERT INTO lesson(student_id,instructor_id,service_id,purchase_id,start_at,end_at,pickup_address,
  counts_toward_package,booking_notes,observer,agreed_price)
 VALUES(sid,iid,v.service_id,pid,starts,ends,pickup,pid IS NOT NULL,left(b->>'note',240),has_observer,v.base_price)
 RETURNING lesson_id INTO result;
 ELSE
 UPDATE lesson SET instructor_id=iid,agreed_price=CASE WHEN service_id=v.service_id THEN agreed_price ELSE v.base_price END,
 service_id=v.service_id,purchase_id=pid,start_at=starts,end_at=ends,pickup_address=pickup,
 counts_toward_package=pid IS NOT NULL,booking_notes=left(b->>'note',240),observer=has_observer
 WHERE lesson_id=old_id AND student_id=sid AND status='scheduled' RETURNING lesson_id INTO result;
 IF result IS NULL THEN RAISE EXCEPTION 'The original booking has changed.'; END IF;
 END IF;
 INSERT INTO lesson_guest SELECT result,g FROM unnest(guests) g ON CONFLICT DO NOTHING;
 RETURN result;
END $$;

CREATE FUNCTION workspace_action(actor bigint, op text, d jsonb, pickup_addresses text[])
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
 u application_user%ROWTYPE;
 l lesson%ROWTYPE;
 r approval_request%ROWTYPE;
 b jsonb;
 kind text;
 lid bigint;
 sid bigint;
 iid bigint;
 dt date;
 first text;
 last text;
 pickup text;
 guests bigint[] := '{}';
 today date := (now() AT TIME ZONE 'America/Vancouver')::date;
 staff_role text;
BEGIN
 -- Serialize workspace writes including group membership and day-off decisions.
 PERFORM pg_advisory_xact_lock(3392026);
 SELECT * INTO u FROM application_user WHERE user_id=actor AND is_active;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM student WHERE student_id=u.student_id AND status<>'active')
 OR EXISTS(SELECT 1 FROM instructor WHERE instructor_id=u.instructor_id AND status<>'active')
 THEN RAISE insufficient_privilege; END IF;
 IF op IN ('book','cancel') THEN
  IF u.role NOT IN ('admin','student') THEN RAISE insufficient_privilege; END IF;
  lid := (d->>'lesson')::bigint;
  IF lid IS NOT NULL THEN
   SELECT * INTO l FROM lesson WHERE lesson_id=lid AND status='scheduled' AND start_at>now()
      AND (u.role='admin' OR student_id=u.student_id) FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'The original booking is unavailable.'; END IF;
  END IF;
  IF op='cancel' AND lid IS NULL THEN RAISE EXCEPTION 'Choose a booking.'; END IF;
  b := d->'booking';
  IF op='book' THEN
   IF b IS NULL THEN RAISE EXCEPTION 'Choose a booking.'; END IF;
   sid := coalesce(l.student_id,u.student_id,(b->>'student')::bigint);
   b := b || jsonb_build_object('student',sid::text);
   pickup := pickup_addresses[1+(b->>'pickup')::int];
   IF pickup IS NULL OR (b->>'start')::double precision <= extract(epoch from now())*1000
   THEN RAISE EXCEPTION 'Choose a future time and pickup.'; END IF;
  END IF;
  kind := CASE WHEN u.role='student' AND l.start_at < now()+interval '48 hours'
      THEN CASE WHEN op='book' THEN 'reschedule' ELSE 'cancel' END
      WHEN op='book' AND lid IS NULL AND u.role='student' AND d->>'mode' IN ('special','group') THEN d->>'mode'
      END;
  IF kind IS NOT NULL THEN
   INSERT INTO approval_request(user_id,kind,lesson_id,reason,booking)
   VALUES(actor,kind,lid,coalesce(nullif(left(b->>'note',240),''),kind),b);
   RETURN jsonb_build_object('pending',true);
  END IF;
  IF op='cancel' THEN UPDATE lesson SET status='cancelled' WHERE lesson_id=lid;
  ELSE
   IF lid IS NOT NULL THEN
    SELECT ARRAY(SELECT student_id FROM lesson_guest WHERE lesson_id=lid) INTO guests;
   ELSIF u.role='admin' AND d->>'mode'='group' THEN
    SELECT ARRAY(SELECT DISTINCT value::bigint FROM jsonb_array_elements_text(b->'group')) INTO guests;
    IF cardinality(guests) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Select 1 to 20 additional participants.'; END IF;
   END IF;
   PERFORM workspace_book(b,lid,'standard',guests,pickup);
  END IF;
  UPDATE approval_request SET status='declined',decision='The original booking changed.'
   WHERE lesson_id=lid AND status='pending';
 ELSIF op='schedule' THEN
  SELECT i.staff_role INTO staff_role FROM instructor i WHERE instructor_id=u.instructor_id;
  IF staff_role IS DISTINCT FROM 'driver' THEN RAISE insufficient_privilege; END IF;
  dt := (d->>'date')::date;
  IF dt IS NULL OR dt<today OR nullif(btrim(d->>'reason'),'') IS NULL THEN RAISE EXCEPTION 'Choose a future date and enter a reason.'; END IF;
  INSERT INTO approval_request(user_id,kind,day,reason) VALUES(actor,'schedule',dt,dt||' · '||left(d->>'reason',240));
 ELSIF op='record' THEN
  IF u.role <> 'instructor' THEN RAISE insufficient_privilege; END IF;
  lid := (d->>'lesson')::bigint;
  sid := (d->>'student')::bigint;
  SELECT * INTO l FROM lesson WHERE lesson_id=lid AND instructor_id=u.instructor_id AND end_at<=now() AND status<>'cancelled';
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM lesson_attendee WHERE lesson_id=lid AND student_id=sid)
  THEN RAISE insufficient_privilege; END IF;
  IF EXISTS(SELECT 1 FROM instructor i WHERE i.instructor_id=u.instructor_id AND i.staff_role='driver')
   AND d->>'score' IS NOT NULL THEN RAISE insufficient_privilege; END IF;
  INSERT INTO lesson_record VALUES(lid,sid,d->>'attendance',left(coalesce(d->>'topics',''),240),
   left(coalesce(d->>'strengths',''),240),left(coalesce(d->>'improve',''),240),left(coalesce(d->>'focus',''),240),
   nullif(d->>'score','')::numeric,coalesce((d->>'visible')::boolean,false),left(coalesce(d->>'private',''),240))
  ON CONFLICT(lesson_id,student_id) DO UPDATE SET attendance=excluded.attendance, topics=excluded.topics,
    strengths=excluded.strengths,improve=excluded.improve,focus=excluded.focus,score=excluded.score,
    visible=excluded.visible,private_note=excluded.private_note;
  IF (SELECT count(*) FROM lesson_record WHERE lesson_id=lid) =
     (SELECT count(*) FROM lesson_attendee WHERE lesson_id=lid) THEN
   UPDATE lesson SET status=CASE WHEN EXISTS(SELECT 1 FROM lesson_record WHERE lesson_id=lid AND attendance<>'Absent')
     THEN 'completed' ELSE 'no_show' END WHERE lesson_id=lid;
  END IF;
 ELSE
  IF u.role<>'admin' THEN RAISE insufficient_privilege; END IF;
  CASE op
  WHEN 'decision' THEN
   SELECT * INTO r FROM approval_request WHERE request_id=(d->>'id')::bigint AND status='pending' FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Already reviewed.'; END IF;
   IF d->>'decision'='Approve' THEN
    IF r.lesson_id IS NOT NULL THEN
     SELECT * INTO l FROM lesson WHERE lesson_id=r.lesson_id AND status='scheduled' AND start_at>now();
     IF NOT FOUND THEN RAISE EXCEPTION 'The original booking has changed.'; END IF;
    END IF;
    IF r.kind='cancel' THEN UPDATE lesson SET status='cancelled' WHERE lesson_id=r.lesson_id;
    ELSIF r.kind='schedule' THEN
     SELECT instructor_id INTO iid FROM application_user WHERE user_id=r.user_id;
     IF r.day<today OR EXISTS(SELECT 1 FROM lesson WHERE instructor_id=iid AND status='scheduled'
      AND start_at<((r.day+1)::timestamp AT TIME ZONE 'America/Vancouver')
      AND end_at>(r.day::timestamp AT TIME ZONE 'America/Vancouver'))
     THEN RAISE EXCEPTION 'Resolve existing bookings before blocking this date.'; END IF;
     INSERT INTO schedule_block VALUES(iid,r.day) ON CONFLICT DO NOTHING;
    ELSE
     b := r.booking;
     IF r.kind='group' THEN
      SELECT ARRAY(SELECT DISTINCT value::bigint FROM jsonb_array_elements_text(d->'participants')) INTO guests;
      IF cardinality(guests) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Select 1 to 20 additional participants.'; END IF;
     ELSIF r.lesson_id IS NOT NULL THEN
      SELECT ARRAY(SELECT student_id FROM lesson_guest WHERE lesson_id=r.lesson_id) INTO guests;
     END IF;
     PERFORM workspace_book(b,r.lesson_id,r.kind,guests,pickup_addresses[1+(b->>'pickup')::int]);
    END IF;
   END IF;
   UPDATE approval_request SET status=CASE WHEN d->>'decision'='Approve' THEN 'approved' ELSE 'declined' END,
    decision=left(d->>'note',240),reviewed_by=actor WHERE request_id=r.request_id;
  WHEN 'status' THEN
   IF d->>'status' NOT IN ('completed','no-show') THEN RAISE EXCEPTION 'Invalid status.'; END IF;
   UPDATE lesson SET status=replace(d->>'status','-','_') WHERE lesson_id=(d->>'lesson')::bigint AND end_at<=now() AND status='scheduled';
   IF NOT FOUND THEN RAISE EXCEPTION 'The booking has changed.'; END IF;
  WHEN 'person' THEN
   first := split_part(btrim(d->>'name'),' ',1);
   last := coalesce(nullif(btrim(substr(btrim(d->>'name'),length(first)+1)),''),first);
   IF nullif(first,'') IS NULL OR coalesce(d->>'email','') !~ '^[^ @]+@[^ @]+\.[^ @]+$' THEN RAISE EXCEPTION 'Enter a name and valid email.'; END IF;
   IF d->>'role'='student' THEN
    sid := (d->>'id')::bigint;
    IF sid IS NULL THEN INSERT INTO student(first_name,last_name,email,phone) VALUES(first,last,d->>'email',d->>'phone') RETURNING student_id INTO sid;
    ELSE UPDATE student SET first_name=first,last_name=last,email=d->>'email',phone=d->>'phone',
       status=CASE WHEN d->>'status'='Archived' THEN 'inactive' ELSE 'active' END WHERE student_id=sid;
    END IF;
    INSERT INTO application_user(auth_provider_user_id,role,student_id) VALUES('student:'||sid,'student',sid) ON CONFLICT(student_id) DO NOTHING;
   ELSIF d->>'role' IN ('driver','instructor') THEN
    iid := (d->>'id')::bigint;
    IF iid IS NULL THEN INSERT INTO instructor(first_name,last_name,email,phone,staff_role) VALUES(first,last,d->>'email',d->>'phone',d->>'role') RETURNING instructor_id INTO iid;
    ELSE UPDATE instructor SET first_name=first,last_name=last,email=d->>'email',phone=d->>'phone',staff_role=d->>'role',
       status=CASE WHEN d->>'status'='Archived' THEN 'inactive' ELSE 'active' END WHERE instructor_id=iid;
    END IF;
    INSERT INTO application_user(auth_provider_user_id,role,instructor_id) VALUES('staff:'||iid,'instructor',iid) ON CONFLICT(instructor_id) DO NOTHING;
   ELSE RAISE EXCEPTION 'Invalid role.'; END IF;
  WHEN 'availability' THEN
   iid := (d->>'staff')::bigint;
   dt := (d->>'date')::date;
   IF dt<today THEN RAISE EXCEPTION 'Choose a future date.'; END IF;
   INSERT INTO instructor_availability(instructor_id,start_at,end_at)
   VALUES(iid,(dt+(d->>'from')::time) AT TIME ZONE 'America/Vancouver',(dt+(d->>'to')::time) AT TIME ZONE 'America/Vancouver');
  WHEN 'purchase' THEN
   INSERT INTO package_purchase(student_id,package_id,service_id,purchase_date,lessons_purchased,agreed_price,expiry_date)
   SELECT s.student_id,p.package_id,p.service_id,today,p.number_of_lessons,p.package_price,(today+interval '1 year')::date
   FROM package p CROSS JOIN student s WHERE p.package_id=(d->>'offer')::bigint AND p.is_active
    AND s.student_id=(d->>'student')::bigint AND s.status='active';
   IF NOT FOUND THEN RAISE EXCEPTION 'Choose an active student and package.'; END IF;
  WHEN 'service' THEN
   IF (d->>'minutes')::int NOT BETWEEN 15 AND 480 THEN RAISE EXCEPTION 'Choose a duration from 15 to 480 minutes.'; END IF;
   IF d->>'id' IS NULL THEN
    INSERT INTO service(public_key,service_name,licence_class,base_price,duration_minutes)
    VALUES('service-'||gen_random_uuid(),d->>'name',d->>'tag',(d->>'price')::numeric,(d->>'minutes')::int);
   ELSE
    UPDATE service SET service_name=d->>'name',base_price=(d->>'price')::numeric,
      duration_minutes=(d->>'minutes')::int WHERE service_id=(d->>'id')::bigint;
    IF NOT FOUND THEN RAISE EXCEPTION 'Service not found.'; END IF;
   END IF;
  WHEN 'offer' THEN
   IF d->>'id' IS NULL THEN
    INSERT INTO package(service_id,package_name,number_of_lessons,package_price)
    VALUES((d->>'service')::bigint,d->>'name',(d->>'lessons')::int,(d->>'price')::numeric);
   ELSE
    UPDATE package SET package_price=(d->>'price')::numeric WHERE package_id=(d->>'id')::bigint;
    IF NOT FOUND THEN RAISE EXCEPTION 'Package not found.'; END IF;
   END IF;
  WHEN 'payment' THEN
   INSERT INTO payment(student_id,amount,note) VALUES((d->>'student')::bigint,(d->>'amount')::numeric,coalesce(left(d->>'note',240),''));
  ELSE RAISE insufficient_privilege;
  END CASE;
 END IF;
 RETURN jsonb_build_object('pending',false);
END $$;
CREATE OR REPLACE VIEW students_needing_follow_up AS
SELECT s.* FROM student s
WHERE s.status='active' AND EXISTS (
 SELECT 1 FROM student_package_balance b WHERE b.student_id=s.student_id AND b.status='active' AND b.unallocated_lessons>0
 AND (b.expiry_date IS NULL OR b.expiry_date >= (now() AT TIME ZONE 'America/Vancouver')::date)
) AND NOT EXISTS (
 SELECT 1 FROM lesson l JOIN lesson_attendee a USING(lesson_id)
 WHERE a.student_id=s.student_id AND l.status='scheduled' AND l.start_at>=now()
);
CREATE VIEW student_payment_balance AS
SELECT s.student_id,
 coalesce((SELECT sum(agreed_price) FROM package_purchase p WHERE p.student_id=s.student_id AND p.status='active'),0)
 + coalesce((SELECT sum(CASE WHEN l.purchase_id IS NULL THEN l.agreed_price ELSE 0 END +
    CASE WHEN l.observer THEN 20 ELSE 0 END)
    FROM lesson_attendee a JOIN lesson l USING(lesson_id) WHERE a.student_id=s.student_id AND l.status<>'cancelled'),0)
 - coalesce((SELECT sum(amount) FROM payment p WHERE p.student_id=s.student_id),0) AS outstanding
FROM student s;
COMMIT;
