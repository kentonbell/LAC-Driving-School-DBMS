-- Install only on a dedicated demonstration database, after workspace.sql.
BEGIN;
CREATE OR REPLACE FUNCTION empty_demo_data() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(3392026);
 -- Preserve administrator credentials so the admin can sign in and reseed.
 -- Refuse to erase a database containing accounts/people outside the demo.
 IF EXISTS(SELECT 1 FROM student WHERE email NOT LIKE '%@example.test')
 OR EXISTS(SELECT 1 FROM instructor WHERE email NOT LIKE '%@example.test')
 THEN RAISE EXCEPTION 'Clear is only available when all people use example.test addresses.'; END IF;
 TRUNCATE lesson_guest,lesson_record,approval_request,payment,schedule_block,lesson_feedback,
   lesson,instructor_availability,package_purchase,package,service;
 DELETE FROM application_user WHERE role<>'admin';
 DELETE FROM student;
 DELETE FROM instructor;
END $$;

CREATE OR REPLACE FUNCTION seed_demo_data() RETURNS void LANGUAGE plpgsql AS $$
DECLARE
 today date := (now() AT TIME ZONE 'America/Vancouver')::date;
 november date := date '2026-11-01';
 alex bigint;
 sam bigint;
 taylor bigint;
 morgan bigint;
 v bigint;
 pack bigint;
 purchase bigint;
 past bigint;
 u bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(3392026);
 IF EXISTS(SELECT 1 FROM student) OR EXISTS(SELECT 1 FROM instructor) THEN
   RAISE EXCEPTION 'The demo database already has people. Clear it before reseeding.';
 END IF;
 INSERT INTO student(first_name,last_name,email) VALUES('Alex','Demo','alex@example.test') RETURNING student_id INTO alex;
 INSERT INTO student(first_name,last_name,email) VALUES('Sam','Demo','sam@example.test') RETURNING student_id INTO sam;
 INSERT INTO instructor(first_name,last_name,email,staff_role) VALUES('Taylor','Demo','taylor@example.test','instructor') RETURNING instructor_id INTO taylor;
 INSERT INTO instructor(first_name,last_name,email,staff_role) VALUES('Morgan','Demo','morgan@example.test','driver') RETURNING instructor_id INTO morgan;
 INSERT INTO application_user(auth_provider_user_id,role,student_id) VALUES('demo-student','student',alex),('demo-student-2','student',sam);
 INSERT INTO application_user(auth_provider_user_id,role,instructor_id) VALUES('demo-instructor','instructor',taylor),('demo-driver','instructor',morgan);
 PERFORM install_school_catalog();
 SELECT service_id INTO STRICT v FROM service WHERE public_key='lesson';
 SELECT package_id INTO STRICT pack FROM package WHERE service_id=v AND number_of_lessons=6;
 INSERT INTO package_purchase(student_id,package_id,service_id,purchase_date,lessons_purchased,agreed_price,expiry_date)
 SELECT alex,pack,v,today-14,number_of_lessons,package_price,today+350 FROM package WHERE package_id=pack
 RETURNING purchase_id INTO purchase;
 INSERT INTO instructor_availability(instructor_id,start_at,end_at)
 SELECT i,(d+time '09:00') AT TIME ZONE 'America/Vancouver',(d+time '18:00') AT TIME ZONE 'America/Vancouver'
 FROM unnest(ARRAY[taylor,morgan]) i CROSS JOIN (
   SELECT today+n AS d FROM generate_series(0,90) n
   UNION
   SELECT november+n FROM generate_series(0,29) n
   WHERE extract(isodow FROM november+n) BETWEEN 1 AND 5
 ) days;
 INSERT INTO lesson(student_id,instructor_id,service_id,purchase_id,start_at,end_at,pickup_address,status,counts_toward_package,agreed_price)
 SELECT alex,taylor,v,purchase,(today+n+time '13:00') AT TIME ZONE 'America/Vancouver',
 (today+n+time '14:30') AT TIME ZONE 'America/Vancouver','19950 Willowbrook Drive, Langley Township, BC',
 CASE WHEN n<0 THEN 'completed' ELSE 'scheduled' END,true,s.base_price
 FROM unnest(ARRAY[-8,-2,1]) n CROSS JOIN service s WHERE s.service_id=v;
 SELECT min(lesson_id) INTO past FROM lesson WHERE student_id=alex;
 INSERT INTO lesson_record(lesson_id,student_id,attendance,topics,strengths,improve,score,visible,private_note)
 VALUES(past,alex,'Present','Lane changes','Smooth braking','Check blind spots earlier',85,true,'Review previous route');
 INSERT INTO payment(student_id,amount,note) VALUES(alex,200,'Package deposit');
 SELECT user_id INTO u FROM application_user WHERE instructor_id=morgan;
 INSERT INTO approval_request(user_id,kind,day,reason) VALUES(u,'schedule',today+4,(today+4)||' · Day off');

 -- Keep 13:00 free for the walkthrough lessons and use distinct two-hour slots.
 WITH demo_slots AS MATERIALIZED (
   SELECT november+n AS day, slot,
     CASE WHEN random()<0.5 THEN alex ELSE sam END AS student_id,
     CASE WHEN random()<0.5 THEN taylor ELSE morgan END AS instructor_id,
     (ARRAY['assessment','lesson','extended','class4','test120','rental','pretrip'])[
       1+floor(random()*7)::int
     ] AS service_key
   FROM generate_series(0,29) n
   CROSS JOIN unnest(ARRAY[time '09:00',time '11:00',time '15:00']) slot
   WHERE extract(isodow FROM november+n) BETWEEN 1 AND 5
   ORDER BY random()
   LIMIT 50
 )
 INSERT INTO lesson(student_id,instructor_id,service_id,start_at,end_at,pickup_address,status,agreed_price)
 SELECT d.student_id,d.instructor_id,s.service_id,
   (d.day+d.slot) AT TIME ZONE 'America/Vancouver',
   (d.day+d.slot+make_interval(mins=>s.duration_minutes)) AT TIME ZONE 'America/Vancouver',
   '19950 Willowbrook Drive, Langley Township, BC',
   CASE WHEN d.day<today THEN 'completed' ELSE 'scheduled' END,s.base_price
 FROM demo_slots d JOIN service s ON s.public_key=d.service_key;
END $$;
COMMIT;
