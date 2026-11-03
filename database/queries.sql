-- Demonstration reports. Use parameterized queries and authenticated identity in
-- the API, rather than trusting student/instructor IDs sent by the browser.
SELECT * FROM student_package_balance ORDER BY student_id, purchase_id;

SELECT * FROM lesson_schedule
WHERE status = 'scheduled' AND start_at >= CURRENT_TIMESTAMP ORDER BY start_at;

SELECT * FROM instructor_workload ORDER BY lesson_date, instructor_id;

SELECT * FROM cancellation_summary ORDER BY start_at DESC;

SELECT * FROM student_lesson_history ORDER BY student_id, start_at DESC;

SELECT * FROM students_needing_follow_up ORDER BY student_id;

-- Inspect lesson feedback. This is an administrator/developer example;
-- student endpoints must filter student_id AND visibility = 'student_visible'.
SELECT l.student_id, l.start_at, f.strengths, f.areas_to_improve,
       f.next_lesson_focus, f.visibility
FROM lesson l JOIN lesson_feedback f USING (lesson_id)
ORDER BY l.student_id, l.start_at DESC;
