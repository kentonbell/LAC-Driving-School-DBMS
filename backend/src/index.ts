import { pickupAddresses, workspace, workspaceSlots } from './workspace';
import { neon } from '@neondatabase/serverless';
import { pickups, policies, services } from '../../frontend/src/catalog';

type Bindings = {
	DATABASE_URL?: string;
	ENABLE_DEMO_DATA?: string;
	FRONTEND_ORIGIN?: string;
	GEMINI_API_KEY?: string;
	GEMINI_MODEL?: string;
};
type Row = Record<string, unknown>;
export type User = {
	user_id: string;
	role: 'admin' | 'student' | 'instructor' | 'driver';
	student_id: string | null;
	instructor_id: string | null;
	name: string;
};
export type SQL = ReturnType<typeof neon<false, false>>;
const weekday = 'America/Vancouver';
const positiveId = (v: unknown): v is string => typeof v === 'string' && /^[1-9]\d{0,17}$/.test(v);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value: unknown): value is string =>
	typeof value === 'string' &&
	datePattern.test(value) &&
	Number.isFinite(Date.parse(value)) &&
	new Date(value).toISOString().slice(0, 10) === value;
class HTTP extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}
const bad = (message: string) => {
	throw new HTTP(400, message);
};
const unauthorized = () => {
	throw new HTTP(401, 'Enter a valid school access code.');
};
const deny = () => {
	throw new HTTP(403, 'This operation is outside your account permissions.');
};

async function authenticate(req: Request, sql: SQL): Promise<User> {
	const token = req.headers.get('Authorization')?.match(/^Bearer ([a-f\d]{64})$/)?.[1] ?? unauthorized();
	const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), (x) =>
		x.toString(16).padStart(2, '0'),
	).join('');
	const rows = await sql`SELECT u.user_id::text,u.student_id::text,u.instructor_id::text,
   coalesce(i.staff_role,u.role) role,coalesce(s.first_name||' '||s.last_name,i.first_name||' '||i.last_name,'School administrator') name
   FROM portal_access t JOIN application_user u USING(user_id) LEFT JOIN student s USING(student_id) LEFT JOIN instructor i USING(instructor_id)
   WHERE t.token_digest=${digest} AND t.expires_at>now() AND u.is_active
     AND coalesce(s.status,'active')='active' AND coalesce(i.status,'active')='active'`;
	return (rows[0] as User | undefined) ?? unauthorized();
}
async function input(req: Request): Promise<Row> {
	const raw = await req.text();
	if (raw.length > 8192) throw new HTTP(413, 'Request is too large.');
	try {
		const data = JSON.parse(raw);
		if (data && typeof data === 'object' && !Array.isArray(data)) return data;
	} catch {
		/* handled below */
	}
	return bad('Expected a JSON object.');
}
const schedule = (sql: SQL, u: User, month: string | null = null) => sql`
 SELECT lesson_id::text, service_name, instructor_name,start_at,end_at,pickup_address,status,
   CASE WHEN ${u.role}<>'student' THEN student_name END student_name
 FROM lesson_schedule WHERE (${u.role}='admin' OR student_id=${u.student_id}::bigint OR instructor_id=${u.instructor_id}::bigint)
 AND (${month}::date IS NULL OR (
   start_at >= (${month}::date::timestamp AT TIME ZONE ${weekday})
   AND start_at < ((${month}::date + interval '1 month') AT TIME ZONE ${weekday})
 ))
 ORDER BY start_at DESC LIMIT CASE WHEN ${month}::date IS NULL THEN 200 END`;
const balances = (sql: SQL, u: User) => sql`
 SELECT b.purchase_id::text,p.package_name,b.expiry_date,b.remaining_lessons,b.reserved_lessons,b.unallocated_lessons,pp.service_id::text
 FROM student_package_balance b JOIN package p USING(package_id) JOIN package_purchase pp USING(purchase_id)
 WHERE b.student_id=${u.student_id}::bigint AND b.status='active'
   AND (b.expiry_date IS NULL OR b.expiry_date >= (now() AT TIME ZONE ${weekday})::date)
 ORDER BY b.expiry_date NULLS LAST`;
async function availability(sql: SQL, u: User, service: unknown, date: unknown) {
	if (u.role !== 'student') return deny();
	if (!positiveId(service) || !validDate(date)) return bad('Choose a service and a valid date.');
	return sql`WITH slots AS (
 SELECT i.instructor_id, i.first_name||' '||i.last_name staff, v.service_id, v.duration_minutes, t AS start_at,
   t+make_interval(mins=>v.duration_minutes) AS end_at
 FROM instructor i CROSS JOIN service v CROSS JOIN LATERAL generate_series(
   (${date}::date+time '09:00') AT TIME ZONE ${weekday},
   (${date}::date+time '17:00') AT TIME ZONE ${weekday}, interval '30 minutes') t
 WHERE i.status='active' AND v.is_active AND v.service_id=${service}::bigint
 ) SELECT instructor_id::text,service_id::text,staff,start_at,end_at FROM slots s
 WHERE s.start_at>now()
 AND (s.start_at AT TIME ZONE ${weekday})::time >= CASE WHEN extract(isodow from ${date}::date)>5 THEN time '10:00' ELSE time '09:00' END
 AND (s.end_at AT TIME ZONE ${weekday})::time <= CASE WHEN extract(isodow from ${date}::date)>5 THEN time '17:00' ELSE time '18:00' END
 AND NOT EXISTS(SELECT 1 FROM schedule_block WHERE instructor_id=s.instructor_id AND day=${date}::date)
 AND EXISTS(SELECT 1 FROM instructor_availability a WHERE a.instructor_id=s.instructor_id AND a.start_at<=s.start_at AND a.end_at>=s.end_at)
 AND NOT EXISTS(SELECT 1 FROM lesson l WHERE l.status<>'cancelled' AND (l.instructor_id=s.instructor_id OR EXISTS(SELECT 1 FROM lesson_attendee a WHERE a.lesson_id=l.lesson_id AND a.student_id=${u.student_id}::bigint)) AND l.start_at<s.end_at AND l.end_at>s.start_at)
 ORDER BY start_at,staff LIMIT 60`;
}
async function chat(req: Request, sql: SQL, u: User, env: Bindings) {
	if (!env.GEMINI_API_KEY || !env.GEMINI_MODEL) throw new HTTP(503, 'The assistant is unavailable. Your booking screens still work.');
	const { question, student, date, service } = await input(req);
	if (typeof question !== 'string' || !question.trim() || question.length > 400) return bad('Enter a question up to 400 characters.');
	const quota = await sql`INSERT INTO portal_chat_quota(user_id,local_day,requests)
 VALUES(${u.user_id},(now() AT TIME ZONE ${weekday})::date,1)
 ON CONFLICT(user_id,local_day) DO UPDATE SET requests=portal_chat_quota.requests+1
 WHERE portal_chat_quota.requests<10 RETURNING requests`;
	if (!quota.length) throw new HTTP(429, 'Daily assistant limit reached.');
	const choices: Record<string, string> = {
		school_information: 'Public school hours, services, prices or policies',
	};
	if (u.role === 'student')
		Object.assign(choices, {
			get_my_upcoming_lessons: 'Upcoming bookings for the signed-in student',
			get_my_package_balance: 'Package balance for the signed-in student',
			find_available_slots: 'Find slots using the explicitly selected service and date',
		});
	else
		Object.assign(choices, {
			get_my_teaching_schedule: 'Signed-in instructor schedule, or admin school schedule',
			get_my_lesson_summary: 'Weekly lesson status counts',
			get_assigned_student_history: 'History for a student explicitly selected in the app',
		});
	if (u.role === 'admin') choices.follow_up = 'Students with unused entitlement and no upcoming lesson';
	const model = env.GEMINI_MODEL;
	if (!/^[a-z\d.-]+$/i.test(model)) throw new HTTP(503, 'The assistant is unavailable.');
	const reply = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-goog-api-key': env.GEMINI_API_KEY,
		},
		signal: AbortSignal.timeout(12000),
		body: JSON.stringify({
			systemInstruction: {
				parts: [
					{
						text: 'Select exactly one read-only function if appropriate. Never invent data or claim to change bookings. If unclear, ask a short clarification.',
					},
				],
			},
			contents: [{ parts: [{ text: question }] }],
			tools: [
				{
					functionDeclarations: Object.entries(choices).map(([name, description]) => ({ name, description })),
				},
			],
			generationConfig: { maxOutputTokens: 180 },
		}),
	});
	if (!reply.ok) throw new HTTP(503, 'The assistant is unavailable. Please retry.');
	const parts = (
		(await reply.json()) as {
			candidates?: {
				content?: { parts?: { functionCall?: { name: string } }[] };
			}[];
		}
	).candidates?.[0]?.content?.parts;
	const op = parts?.find((x) => x.functionCall)?.functionCall?.name;
	if (!op || !Object.hasOwn(choices, op))
		return {
			message: 'Could you clarify which bookings, dates, package or school information you want?',
			rows: [],
		};
	let rows: Row[] = [];
	if (op === 'get_my_upcoming_lessons')
		rows =
			await sql`SELECT lesson_id::text,service_name,start_at,pickup_address FROM lesson_schedule s WHERE EXISTS(SELECT 1 FROM lesson_attendee a WHERE a.lesson_id=s.lesson_id AND a.student_id=${u.student_id}::bigint) AND status='scheduled' AND start_at>now() ORDER BY start_at LIMIT 10`;
	else if (op === 'get_my_package_balance') rows = await balances(sql, u);
	else if (op === 'find_available_slots') {
		if (!positiveId(service) || !validDate(date))
			return {
				message: 'Select a service and an exact date to find availability.',
				rows: [],
			};
		rows = await availability(sql, u, service, date);
	} else if (op === 'get_my_teaching_schedule') {
		const dateFilter = validDate(date) ? date : null;
		rows = await sql`SELECT lesson_id::text,service_name,student_name,instructor_name,start_at,end_at,pickup_address,status
      FROM lesson_schedule WHERE (${u.role}='admin' OR instructor_id=${u.instructor_id}::bigint)
      AND CASE WHEN ${dateFilter}::date IS NULL THEN start_at>=now()
        ELSE (start_at AT TIME ZONE ${weekday})::date=${dateFilter}::date END
      ORDER BY start_at LIMIT 20`;
	} else if (op === 'get_my_lesson_summary')
		rows =
			await sql`SELECT status,count(*)::int AS lessons FROM lesson WHERE (${u.role}='admin' OR instructor_id=${u.instructor_id}::bigint) AND start_at>now()-interval '7 days' AND start_at<now()+interval '1 day' GROUP BY status`;
	else if (op === 'get_assigned_student_history') {
		if (!positiveId(student)) return { message: 'Select a student to review their history.', rows: [] };
		rows = await sql`SELECT s.lesson_id::text,s.service_name,s.status,s.start_at,r.attendance,r.topics,r.strengths,r.improve,r.focus,r.score
      FROM lesson_schedule s JOIN lesson_attendee a USING(lesson_id)
      LEFT JOIN lesson_record r ON r.lesson_id=a.lesson_id AND r.student_id=a.student_id
      WHERE a.student_id=${student}::bigint AND (${u.role}='admin' OR s.instructor_id=${u.instructor_id}::bigint)
      AND s.end_at<now() ORDER BY s.start_at DESC LIMIT 20`;
	} else if (op === 'follow_up') rows = await sql`SELECT first_name,last_name FROM students_needing_follow_up ORDER BY last_name LIMIT 20`;
	else
		rows = [
			{ hours: 'Monday–Friday 9 AM–6 PM · Saturday–Sunday 10 AM–5 PM Pacific' },
			...(await sql`SELECT service_name,base_price,duration_minutes FROM service WHERE is_active ORDER BY service_id`),
			...(await sql`SELECT package_name,number_of_lessons,package_price FROM package WHERE is_active ORDER BY package_id`),
			...policies.map(([policy, details]) => ({ policy, details })),
		];
	return {
		operation: op,
		message: rows.length ? 'Here are the matching records.' : 'No matching records found.',
		rows,
		retrievedAt: new Date().toISOString(),
	};
}
export default {
	async fetch(req: Request, env: Bindings): Promise<Response> {
		const origin = req.headers.get('Origin');
		const headers = new Headers({
			'cache-control': 'no-store',
			vary: 'Origin',
		});
		if (origin && origin === env.FRONTEND_ORIGIN) {
			headers.set('access-control-allow-origin', origin);
			headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');
			headers.set('access-control-allow-headers', 'Authorization, Content-Type');
		}
		const json = (data: unknown, status = 200) => Response.json(data, { status, headers });
		if (req.method === 'OPTIONS')
			return new Response(null, {
				status: origin === env.FRONTEND_ORIGIN ? 204 : 403,
				headers,
			});
		const url = new URL(req.url);
		if (url.pathname === '/health' && req.method === 'GET') return json({ status: 'ok' });
		if (url.pathname === '/api/catalog' && req.method === 'GET') {
			if (!env.DATABASE_URL) return json({ error: 'School catalog is unavailable.' }, 503);
			try {
				const sql = neon(env.DATABASE_URL);
				const [rows, offers] = await sql.transaction(
					[
						sql`SELECT public_key id,service_name name,licence_class tag,duration_minutes minutes,
            base_price price,description FROM service WHERE public_key IS NOT NULL AND is_active ORDER BY service_id`,
						sql`SELECT p.package_id::text id,p.number_of_lessons lessons,p.package_price price,
            s.base_price*p.number_of_lessons-p.package_price savings
            FROM package p JOIN service s USING(service_id) WHERE p.is_active AND s.is_active ORDER BY p.number_of_lessons`,
					],
					{ readOnly: true },
				);
				return json({
					services: rows.map((r) => ({
						...r,
						price: Number(r.price),
						description: r.description ?? services.find((s) => s.id === r.id)?.description ?? '',
					})),
					packages: offers.map((r) => ({ ...r, price: Number(r.price), savings: Number(r.savings) })),
				});
			} catch {
				return json({ error: 'School catalog is unavailable.' }, 503);
			}
		}
		if (!url.pathname.startsWith('/api/')) return json({ error: 'Route not found.' }, 404);
		if (origin && origin !== env.FRONTEND_ORIGIN) return json({ error: 'Origin is not allowed.' }, 403);
		if (!env.DATABASE_URL) return json({ error: 'Live portal is not configured.' }, 503);
		try {
			const sql = neon(env.DATABASE_URL);
			const u = await authenticate(req, sql);
			if (url.pathname === '/api/me' && req.method === 'GET') return json({ id: u.user_id, name: u.name, role: u.role });
			if (url.pathname === '/api/dashboard' && req.method === 'GET') {
				const month = url.searchParams.get('month');
				if (month !== null && !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month)) return json({ error: 'Choose a valid calendar month.' }, 400);
				const [lessons, purchases, services] = await Promise.all([
					schedule(sql, u, month && month + '-01'),
					u.role === 'student' ? balances(sql, u) : [],
					sql`SELECT service_id::text,service_name,duration_minutes,base_price FROM service WHERE is_active ORDER BY service_id`,
				]);
				const students =
					u.role === 'student'
						? []
						: await sql`SELECT DISTINCT student_id::text, student_name FROM lesson_schedule WHERE (${u.role}='admin' OR instructor_id=${u.instructor_id}::bigint) ORDER BY student_name`;
				return json({ lessons, purchases, services, students });
			}
			if (url.pathname === '/api/availability' && req.method === 'GET')
				return json(await availability(sql, u, url.searchParams.get('service'), url.searchParams.get('date')));
			if (url.pathname === '/api/workspace' && req.method === 'GET')
				return json({ ...(await workspace(sql, u)), demoEnabled: u.role === 'admin' && env.ENABLE_DEMO_DATA === 'true' });
			if (url.pathname === '/api/workspace/slots' && req.method === 'GET') {
				if (u.role !== 'student' && u.role !== 'admin') return deny();
				const student = u.student_id ?? url.searchParams.get('student');
				const staff = url.searchParams.get('staff')?.replace(/^staff:/, '');
				const service = url.searchParams.get('service');
				const date = url.searchParams.get('date');
				let lesson = url.searchParams.get('lesson');
				if (
					!positiveId(student) ||
					!positiveId(staff) ||
					!positiveId(service) ||
					!validDate(date) ||
					(lesson !== null && !positiveId(lesson))
				)
					return bad('Choose a student, staff member, service and date.');
				if (lesson && u.role !== 'admin') {
					const owned =
						await sql`SELECT 1 FROM lesson WHERE lesson_id=${lesson}::bigint AND student_id=${student}::bigint AND status='scheduled'`;
					if (!owned.length) lesson = null;
				}
				return json((await workspaceSlots(sql, student, staff, service, date, lesson)).map((row) => row.time));
			}
			if (url.pathname === '/api/workspace/action' && req.method === 'POST') {
				const { op, data } = await input(req);
				if (typeof op !== 'string' || !data || typeof data !== 'object' || Array.isArray(data))
					return bad('Choose a valid workspace action.');
				const d = data as Row;
				if (op === 'book') {
					const b = d.booking as Row | undefined;
					if (
						!b ||
						typeof b.staff !== 'string' ||
						!positiveId(b.staff.replace(/^staff:/, '')) ||
						!positiveId(b.service) ||
						!Number.isSafeInteger(b.start) ||
						typeof b.start !== 'number' ||
						b.start > Date.now() + 366 * 86400000 ||
						!Number.isInteger(b.pickup) ||
						!pickups[Number(b.pickup)]
					)
						return bad('Choose a valid service, time and pickup.');
					d.booking = { ...b, staff: b.staff.replace(/^staff:/, '') };
				}
				if (op === 'record' && u.role === 'driver' && d.score != null) return deny();
				if (op === 'availability' && typeof d.staff === 'string') d.staff = d.staff.replace(/^staff:/, '');
				if (op === 'person' && typeof d.id === 'string') d.id = d.id.replace(/^staff:/, '');
				if (op === 'issue-code') {
					if (u.role !== 'admin') return deny();
					const role = d.role === 'student' ? 'student' : 'instructor';
					const target = typeof d.id === 'string' ? d.id.replace(/^staff:/, '') : null;
					if (!positiveId(target)) return bad('Choose an account.');
					const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
					const code = hex(crypto.getRandomValues(new Uint8Array(32)));
					const digest = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code))));
					const rows = await sql`INSERT INTO portal_access(token_digest,user_id,expires_at)
            SELECT ${digest},user_id,now()+interval '1 day' FROM application_user
            WHERE role=${role} AND coalesce(student_id,instructor_id)=${target}::bigint AND is_active RETURNING expires_at`;
					if (!rows.length) return bad('Account unavailable.');
					return json({ code });
				}
				if (op === 'demo-seed' || op === 'demo-empty') {
					if (u.role !== 'admin' || env.ENABLE_DEMO_DATA !== 'true') return deny();
					if (d.confirm !== op) return bad('Confirm the demo database operation.');
					if (op === 'demo-seed') await sql`SELECT seed_demo_data()`;
					else await sql`SELECT empty_demo_data()`;
					return json({ pending: false });
				}
				const [row] =
					await sql`SELECT workspace_action(${u.user_id}::bigint,${op},${JSON.stringify(d)}::jsonb,${pickupAddresses}::text[]) result`;
				return json(row.result);
			}
			if (url.pathname === '/api/chat' && req.method === 'POST') return json(await chat(req, sql, u, env));
			return json({ error: 'Route not found.' }, 404);
		} catch (error) {
			if (error instanceof HTTP) return json({ error: error.message }, error.status);
			const code = (error as { code?: string }).code;
			if (code === '42501') return json({ error: 'This operation is outside your account permissions.' }, 403);
			if (code === 'P0001') return json({ error: (error as Error).message }, 409);
			if (['22P02', '22003', '22007', '22008', '23502', '23514'].includes(code ?? ''))
				return json({ error: 'Check the values and try again.' }, 400);
			if (['23P01', '23505', '23503', '40001', '40P01'].includes(code ?? ''))
				return json(
					{
						error: 'That slot or package is no longer available. Refresh and try again.',
					},
					409,
				);
			return json({ error: 'The service is temporarily unavailable.' }, 503);
		}
	},
};
