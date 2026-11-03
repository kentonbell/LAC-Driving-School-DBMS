import type { SQL, User } from './index';
import { pickups } from '../../frontend/src/catalog';

export const pickupAddresses = pickups.map((p) => p[2]);

export async function workspace(sql: SQL, u: User) {
	const admin = u.role === 'admin';
	const sid = u.student_id;
	const iid = u.instructor_id;
	const id = sid ?? (iid ? 'staff:' + iid : 'admin:' + u.user_id);
	const [people, lessons, purchases, records, requests, payments, catalog, offers, unavailable, paymentBalances] = await sql.transaction(
		[
			sql`SELECT student_id::text id,'student' role,first_name||' '||last_name name,
        CASE WHEN ${admin} OR student_id=${sid} THEN email ELSE '' END email,
        CASE WHEN ${admin} OR student_id=${sid} THEN coalesce(phone,'') ELSE '' END phone,
        status='active' active,extract(epoch from registration_date::timestamp AT TIME ZONE 'America/Vancouver')*1000 joined
        FROM student s WHERE ${admin} OR student_id=${sid} OR EXISTS(
          SELECT 1 FROM lesson_attendee a JOIN lesson l USING(lesson_id) WHERE a.student_id=s.student_id AND l.instructor_id=${iid})
        UNION ALL
        SELECT 'staff:'||instructor_id,staff_role,first_name||' '||last_name,
          CASE WHEN ${admin} OR instructor_id=${iid} THEN email ELSE '' END,
          CASE WHEN ${admin} OR instructor_id=${iid} THEN coalesce(phone,'') ELSE '' END,status='active',0
        FROM instructor WHERE ${admin} OR instructor_id=${iid} OR ${sid}::bigint IS NOT NULL
        ORDER BY name`,
			sql`SELECT l.lesson_id::text id,
        CASE WHEN ${sid}::bigint IS NOT NULL THEN ARRAY[${sid}::text]
          ELSE ARRAY[l.student_id::text]||ARRAY(SELECT student_id::text FROM lesson_guest g WHERE g.lesson_id=l.lesson_id ORDER BY student_id) END students,
        'staff:'||l.instructor_id staff,l.service_id::text service,
        extract(epoch from l.start_at)*1000 start,extract(epoch from l.end_at)*1000 "end",
        extract(epoch from l.booked_at)*1000 booked,l.pickup_address address,replace(l.status,'_','-') status,
        CASE WHEN ${sid}::bigint IS NULL OR l.student_id=${sid} THEN l.purchase_id::text END purchase,
        CASE WHEN ${sid}::bigint IS NULL OR l.student_id=${sid} THEN l.booking_notes END note,
        l.observer,l.agreed_price price,(${admin} OR l.student_id=${sid}) "canChange"
        FROM lesson l WHERE ${admin} OR l.instructor_id=${iid} OR EXISTS(
          SELECT 1 FROM lesson_attendee a WHERE a.lesson_id=l.lesson_id AND a.student_id=${sid})`,
			sql`SELECT pp.purchase_id::text id,pp.student_id::text student,p.package_name name,
        pp.lessons_purchased allowance,pp.agreed_price price,pp.service_id::text service,
        extract(epoch from pp.purchase_date::timestamp AT TIME ZONE 'America/Vancouver')*1000 created,
        coalesce(pp.expiry_date::text,'9999-12-31') expiry,
        b.consumed_lessons::int used,b.reserved_lessons::int reserved,b.remaining_lessons::int remaining,b.unallocated_lessons::int available
        FROM package_purchase pp JOIN package p USING(package_id) JOIN student_package_balance b ON b.purchase_id=pp.purchase_id
        WHERE pp.status='active' AND (${admin} OR pp.student_id=${sid})`,
			sql`SELECT r.lesson_id::text lesson,r.student_id::text student,attendance,visible,
        CASE WHEN ${sid}::bigint IS NULL OR visible THEN topics ELSE '' END topics,
        CASE WHEN ${sid}::bigint IS NULL OR visible THEN strengths ELSE '' END strengths,
        CASE WHEN ${sid}::bigint IS NULL OR visible THEN improve ELSE '' END improve,
        CASE WHEN ${sid}::bigint IS NULL OR visible THEN focus ELSE '' END focus,
        coalesce(score::text,'') score,CASE WHEN ${sid}::bigint IS NULL THEN private_note ELSE '' END "privateNote"
        FROM lesson_record r JOIN lesson l USING(lesson_id)
        WHERE ${admin} OR l.instructor_id=${iid} OR r.student_id=${sid}`,
			sql`SELECT r.request_id::text id,coalesce(a.student_id::text,'staff:'||a.instructor_id,'admin:'||a.user_id) "by",
        r.kind type,r.lesson_id::text lesson,r.reason,r.booking,r.status,r.decision
        FROM approval_request r JOIN application_user a USING(user_id) WHERE ${admin} OR r.user_id=${u.user_id}
        ORDER BY r.request_id DESC`,
			sql`SELECT payment_id::text id,student_id::text student,amount,note,extract(epoch from paid_at)*1000 date
        FROM payment WHERE ${admin} ORDER BY paid_at DESC`,
			sql`SELECT service_id::text id,public_key "publicKey",service_name name,licence_class tag,
        duration_minutes minutes,base_price price,coalesce(description,'') description
        FROM service WHERE is_active OR EXISTS(SELECT 1 FROM lesson WHERE service_id=service.service_id) ORDER BY service_id`,
			sql`SELECT p.package_id::text id,p.service_id::text service,p.package_name name,p.number_of_lessons lessons,
        p.package_price price,s.base_price*p.number_of_lessons-p.package_price savings
        FROM package p JOIN service s USING(service_id) WHERE p.is_active ORDER BY p.number_of_lessons`,
			sql`SELECT 'staff:'||instructor_id staff,day::text date FROM schedule_block WHERE ${admin} OR instructor_id=${iid}`,
			sql`SELECT student_id::text id,outstanding FROM student_payment_balance WHERE ${admin}`,
		],
		{ isolationLevel: 'RepeatableRead', readOnly: true },
	);
	const user = people.find((p) => p.id === id) ?? { id, role: u.role, name: u.name, email: '', phone: '', active: true, joined: 0 };
	return {
		user,
		state: {
			people: people.map((p) => ({ ...p, joined: Number(p.joined) })),
			lessons: lessons.map((l) => ({
				...l,
				pickup: pickupAddresses.indexOf(l.address),
				start: Number(l.start),
				end: Number(l.end),
				price: Number(l.price),
				booked: l.booked == null ? undefined : Number(l.booked),
				purchase: l.purchase ?? undefined,
			})),
			purchases: purchases.map((p) => ({ ...p, price: Number(p.price), created: Number(p.created) })),
			records,
			requests: requests.map((r) => ({
				...r,
				booking: r.booking ? { ...r.booking, staff: 'staff:' + r.booking.staff } : undefined,
			})),
			payments: payments.map((p) => ({ ...p, amount: Number(p.amount), date: Number(p.date) })),
			catalog: catalog.map((s) => ({ ...s, price: Number(s.price) })),
			offers: offers.map((p) => ({ ...p, price: Number(p.price), savings: Number(p.savings) })),
			unavailable,
			paymentBalances: Object.fromEntries(paymentBalances.map((p) => [p.id, Number(p.outstanding)])),
		},
	};
}

export function workspaceSlots(sql: SQL, student: string, staff: string, service: string, date: string, lesson: string | null) {
	return sql`WITH times AS (
    SELECT t starts,t+make_interval(mins=>s.duration_minutes) ends FROM service s
    CROSS JOIN LATERAL generate_series(
      (${date}::date + CASE WHEN extract(isodow from ${date}::date)>5 THEN time '10:00' ELSE time '09:00' END) AT TIME ZONE 'America/Vancouver',
      ((${date}::date + CASE WHEN extract(isodow from ${date}::date)>5 THEN time '17:00' ELSE time '18:00' END) AT TIME ZONE 'America/Vancouver') - make_interval(mins=>s.duration_minutes),
      interval '30 minutes') t WHERE s.service_id=${service}::bigint AND s.is_active
  ) SELECT to_char(starts AT TIME ZONE 'America/Vancouver','HH24:MI') time FROM times
    WHERE starts>now()
      AND EXISTS(SELECT 1 FROM instructor i WHERE i.instructor_id=${staff}::bigint AND i.status='active')
      AND EXISTS(SELECT 1 FROM instructor_availability a WHERE a.instructor_id=${staff}::bigint AND a.start_at<=starts AND a.end_at>=ends)
      AND NOT EXISTS(SELECT 1 FROM schedule_block WHERE instructor_id=${staff}::bigint AND day=${date}::date)
      AND NOT EXISTS(SELECT 1 FROM lesson l WHERE l.lesson_id IS DISTINCT FROM ${lesson}::bigint AND l.status<>'cancelled'
        AND l.start_at<ends AND l.end_at>starts AND (l.instructor_id=${staff}::bigint OR EXISTS(
          SELECT 1 FROM lesson_attendee a WHERE a.lesson_id=l.lesson_id AND a.student_id=${student}::bigint)))
    ORDER BY starts`;
}
