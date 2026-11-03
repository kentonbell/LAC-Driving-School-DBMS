-- Fictional demonstration data only. Run once after schema.sql in a test database.
BEGIN;
INSERT INTO student (first_name, last_name, email, phone) VALUES
('Alex', 'Demo', 'alex@example.test', '604-555-0101'),
('Sam', 'Example', 'sam@example.test', '604-555-0102');
INSERT INTO instructor (first_name, last_name, email) VALUES
('Taylor', 'Demo', 'taylor@example.test');
INSERT INTO service (service_name, licence_class, duration_minutes, base_price) VALUES
('Class 5/7 driving lesson', '5/7', 90, 100.00);
INSERT INTO package (service_id, package_name, number_of_lessons, package_price)
SELECT service_id, 'Six 90-minute lessons', 6, 580.00 FROM service
WHERE service_name = 'Class 5/7 driving lesson';
INSERT INTO package_purchase
    (student_id, package_id, service_id, purchase_date, lessons_purchased, agreed_price, expiry_date)
SELECT s.student_id, p.package_id, p.service_id, DATE '2026-10-01',
       p.number_of_lessons, p.package_price, DATE '2027-10-01'
FROM student s CROSS JOIN package p WHERE s.email = 'alex@example.test';
INSERT INTO application_user (auth_provider_user_id, role) VALUES ('demo-admin', 'admin');
INSERT INTO application_user (auth_provider_user_id, role, instructor_id)
SELECT 'demo-instructor', 'instructor', instructor_id FROM instructor WHERE email = 'taylor@example.test';
INSERT INTO application_user (auth_provider_user_id, role, student_id)
SELECT 'demo-student', 'student', student_id FROM student WHERE email = 'alex@example.test';
INSERT INTO instructor_availability (instructor_id, start_at, end_at)
SELECT instructor_id, '2026-11-06 09:00 America/Vancouver'::timestamptz,
       '2026-11-06 18:00 America/Vancouver'::timestamptz FROM instructor;
-- Two completed lessons and one reservation: four remain, three unallocated.
INSERT INTO lesson (student_id, instructor_id, service_id, purchase_id,
                    start_at, end_at, pickup_address, status, counts_toward_package)
SELECT p.student_id, i.instructor_id, p.service_id, p.purchase_id,
       d.start_at, d.start_at + interval '90 minutes',
       'Demo pickup point', d.status, true
FROM package_purchase p CROSS JOIN instructor i
CROSS JOIN (VALUES
    ('2026-10-15 10:00 America/Vancouver'::timestamptz, 'completed'),
    ('2026-10-22 10:00 America/Vancouver'::timestamptz, 'completed'),
    ('2026-11-06 10:00 America/Vancouver'::timestamptz, 'scheduled')
) AS d(start_at, status);
INSERT INTO lesson_feedback (lesson_id, author_user_id, strengths, areas_to_improve, visibility)
SELECT l.lesson_id, u.user_id, 'Good mirror checks', 'Practise smooth braking', 'student_visible'
FROM lesson l JOIN application_user u ON u.instructor_id = l.instructor_id
WHERE l.status = 'completed';
COMMIT;
