import { neon } from "@neondatabase/serverless";
import { pickups, policies } from "../../frontend/src/catalog";

type Bindings = {
  DATABASE_URL?: string;
  FRONTEND_ORIGIN?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
};
type Row = Record<string, unknown>;
type User = {
  user_id: string;
  role: "admin" | "student" | "instructor" | "driver";
  student_id: string | null;
  instructor_id: string | null;
  name: string;
};
type SQL = ReturnType<typeof neon<false, false>>;
const weekday = "America/Vancouver";
const positiveId = (v: unknown): v is string =>
  typeof v === "string" && /^[1-9]\d{0,17}$/.test(v);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value: unknown): value is string =>
  typeof value === "string" &&
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
  throw new HTTP(401, "Enter a valid school access code.");
};
const deny = () => {
  throw new HTTP(403, "This operation is outside your account permissions.");
};

async function authenticate(req: Request, sql: SQL): Promise<User> {
  const token =
    req.headers.get("Authorization")?.match(/^Bearer ([a-f\d]{64})$/)?.[1] ??
    unauthorized();
  const digest = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
  const rows =
    await sql`SELECT u.user_id::text,u.student_id::text,u.instructor_id::text,
   coalesce(i.staff_role,u.role) role,coalesce(s.first_name||' '||s.last_name,i.first_name||' '||i.last_name,'School administrator') name
   FROM portal_access t JOIN application_user u USING(user_id) LEFT JOIN student s USING(student_id) LEFT JOIN instructor i USING(instructor_id)
   WHERE t.token_digest=${digest} AND t.expires_at>now() AND u.is_active
     AND coalesce(s.status,'active')='active' AND coalesce(i.status,'active')='active'`;
  return (rows[0] as User | undefined) ?? unauthorized();
}
async function input(req: Request): Promise<Row> {
  const raw = await req.text();
  if (raw.length > 8192) throw new HTTP(413, "Request is too large.");
  try {
    const data = JSON.parse(raw);
    if (data && typeof data === "object" && !Array.isArray(data)) return data;
  } catch {
    /* handled below */
  }
  return bad("Expected a JSON object.");
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
async function availability(
  sql: SQL,
  u: User,
  service: unknown,
  date: unknown,
) {
  if (u.role !== "student") return deny();
  if (!positiveId(service) || !validDate(date))
    return bad("Choose a service and a valid date.");
  return sql`WITH slots AS (
 SELECT i.instructor_id, i.first_name||' '||i.last_name staff, v.service_id, v.duration_minutes, t AS start_at,
   t+make_interval(mins=>v.duration_minutes) AS end_at
 FROM instructor i CROSS JOIN service v CROSS JOIN LATERAL generate_series(
   (${date}::date+time '09:00') AT TIME ZONE ${weekday},
   (${date}::date+time '17:00') AT TIME ZONE ${weekday}, interval '30 minutes') t
 WHERE i.status='active' AND v.is_active AND v.service_id=${service}::bigint
 ) SELECT instructor_id::text,staff,start_at,end_at FROM slots s
 WHERE s.start_at>now()
 AND (s.start_at AT TIME ZONE ${weekday})::time >= CASE WHEN extract(isodow from ${date}::date)>5 THEN time '10:00' ELSE time '09:00' END
 AND (s.end_at AT TIME ZONE ${weekday})::time <= CASE WHEN extract(isodow from ${date}::date)>5 THEN time '17:00' ELSE time '18:00' END
 AND EXISTS(SELECT 1 FROM instructor_availability a WHERE a.instructor_id=s.instructor_id AND a.start_at<=s.start_at AND a.end_at>=s.end_at)
 AND NOT EXISTS(SELECT 1 FROM lesson l WHERE l.status<>'cancelled' AND (l.instructor_id=s.instructor_id OR l.student_id=${u.student_id}::bigint) AND l.start_at<s.end_at AND l.end_at>s.start_at)
 ORDER BY start_at,staff LIMIT 60`;
}
async function book(sql: SQL, u: User, d: Row) {
  if (u.role !== "student") return deny();
  const { service, instructor, start, purchase, pickup } = d;
  if (
    !positiveId(service) ||
    !positiveId(instructor) ||
    (purchase != null && !positiveId(purchase)) ||
    typeof start !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:00(?:\.000)?(?:Z|[+-]\d\d:\d\d)$/.test(
      start,
    ) ||
    !Number.isInteger(pickup) ||
    !pickups[Number(pickup)]
  )
    return bad("Choose a service, time and approved pick-up point.");
  // Availability and insertion are one database statement; the GiST exclusion
  // constraints and package entitlement trigger arbitrate concurrent bookings.
  const result = await sql`WITH candidate AS (
 SELECT v.service_id, ${start}::timestamptz start_at, ${start}::timestamptz+make_interval(mins=>v.duration_minutes) end_at
 FROM service v JOIN instructor i ON i.instructor_id=${instructor}::bigint AND i.status='active'
 JOIN student s ON s.student_id=${u.student_id}::bigint AND s.status='active'
 WHERE v.is_active AND v.service_id=${service}::bigint
 ) INSERT INTO lesson(student_id,instructor_id,service_id,purchase_id,start_at,end_at,pickup_address,counts_toward_package)
 SELECT ${u.student_id},${instructor},service_id,${purchase ?? null},start_at,end_at,${pickups[Number(pickup)][2]},${purchase != null}
 FROM candidate c WHERE c.start_at>now()
 AND (c.start_at AT TIME ZONE ${weekday})::date=(c.end_at AT TIME ZONE ${weekday})::date
 AND (c.start_at AT TIME ZONE ${weekday})::time >= CASE WHEN extract(isodow from c.start_at AT TIME ZONE ${weekday})>5 THEN time '10:00' ELSE time '09:00' END
 AND (c.end_at AT TIME ZONE ${weekday})::time <= CASE WHEN extract(isodow from c.start_at AT TIME ZONE ${weekday})>5 THEN time '17:00' ELSE time '18:00' END
 AND EXISTS(SELECT 1 FROM instructor_availability a WHERE a.instructor_id=${instructor}::bigint AND a.start_at<=c.start_at AND a.end_at>=c.end_at)
 RETURNING lesson_id::text,start_at,end_at`;
  if (!result.length) throw new HTTP(409, "That slot is no longer available.");
  return result[0];
}
async function chat(req: Request, sql: SQL, u: User, env: Bindings) {
  if (!env.GEMINI_API_KEY || !env.GEMINI_MODEL)
    throw new HTTP(
      503,
      "The assistant is unavailable. Your booking screens still work.",
    );
  const { question, student, date, service } = await input(req);
  if (typeof question !== "string" || !question.trim() || question.length > 400)
    return bad("Enter a question up to 400 characters.");
  const quota =
    await sql`INSERT INTO portal_chat_quota(user_id,local_day,requests)
 VALUES(${u.user_id},(now() AT TIME ZONE ${weekday})::date,1)
 ON CONFLICT(user_id,local_day) DO UPDATE SET requests=portal_chat_quota.requests+1
 WHERE portal_chat_quota.requests<10 RETURNING requests`;
  if (!quota.length) throw new HTTP(429, "Daily assistant limit reached.");
  const choices: Record<string, string> = {
    school_information: "Public school hours, services, prices or policies",
  };
  if (u.role === "student")
    Object.assign(choices, {
      get_my_upcoming_lessons: "Upcoming bookings for the signed-in student",
      get_my_package_balance: "Package balance for the signed-in student",
      find_available_slots:
        "Find slots using the explicitly selected service and date",
    });
  else
    Object.assign(choices, {
      get_my_teaching_schedule:
        "Signed-in instructor schedule, or admin school schedule",
      get_my_lesson_summary: "Weekly lesson status counts",
      get_assigned_student_history:
        "History for a student explicitly selected in the app",
    });
  if (u.role === "admin")
    choices.follow_up =
      "Students with unused entitlement and no upcoming lesson";
  const model = env.GEMINI_MODEL;
  if (!/^[a-z\d.-]+$/i.test(model))
    throw new HTTP(503, "The assistant is unavailable.");
  const reply = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" +
      model +
      ":generateContent",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY,
      },
      signal: AbortSignal.timeout(12000),
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: "Select exactly one read-only function if appropriate. Never invent data or claim to change bookings. If unclear, ask a short clarification.",
            },
          ],
        },
        contents: [{ parts: [{ text: question }] }],
        tools: [
          {
            functionDeclarations: Object.entries(choices).map(
              ([name, description]) => ({ name, description }),
            ),
          },
        ],
        generationConfig: { maxOutputTokens: 180 },
      }),
    },
  );
  if (!reply.ok)
    throw new HTTP(503, "The assistant is unavailable. Please retry.");
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
      message:
        "Could you clarify which bookings, dates, package or school information you want?",
      rows: [],
    };
  let rows: Row[] = [];
  if (op === "get_my_upcoming_lessons")
    rows =
      await sql`SELECT lesson_id::text,service_name,start_at,pickup_address FROM lesson_schedule WHERE student_id=${u.student_id}::bigint AND status='scheduled' AND start_at>now() ORDER BY start_at LIMIT 10`;
  else if (op === "get_my_package_balance") rows = await balances(sql, u);
  else if (op === "find_available_slots") {
    if (!positiveId(service) || !validDate(date))
      return {
        message: "Select a service and an exact date to find availability.",
        rows: [],
      };
    rows = await availability(sql, u, service, date);
  } else if (op === "get_my_teaching_schedule")
    rows = (await schedule(sql, u))
      .filter((r) => new Date(String(r.start_at)).getTime() >= Date.now())
      .slice(-10)
      .reverse();
  else if (op === "get_my_lesson_summary")
    rows =
      await sql`SELECT status,count(*)::int AS lessons FROM lesson WHERE (${u.role}='admin' OR instructor_id=${u.instructor_id}::bigint) AND start_at>now()-interval '7 days' AND start_at<now()+interval '1 day' GROUP BY status`;
  else if (op === "get_assigned_student_history") {
    if (!positiveId(student))
      return { message: "Select a student to review their history.", rows: [] };
    rows =
      await sql`SELECT service_name,status,start_at FROM lesson_schedule WHERE student_id=${student}::bigint AND (${u.role}='admin' OR instructor_id=${u.instructor_id}::bigint) AND end_at<now() ORDER BY start_at DESC LIMIT 20`;
  } else if (op === "follow_up")
    rows =
      await sql`SELECT first_name,last_name FROM students_needing_follow_up ORDER BY last_name LIMIT 20`;
  else
    rows = [
      { hours: "Monday–Friday 9 AM–6 PM · Saturday–Sunday 10 AM–5 PM Pacific" },
      ...(await sql`SELECT service_name,base_price,duration_minutes FROM service WHERE is_active ORDER BY service_id`),
      ...policies.map(([policy, details]) => ({ policy, details })),
    ];
  return {
    operation: op,
    message: rows.length
      ? "Here are the matching records."
      : "No matching records found.",
    rows,
    retrievedAt: new Date().toISOString(),
  };
}
export default {
  async fetch(req: Request, env: Bindings): Promise<Response> {
    const origin = req.headers.get("Origin");
    const headers = new Headers({
      "cache-control": "no-store",
      vary: "Origin",
    });
    if (origin && origin === env.FRONTEND_ORIGIN) {
      headers.set("access-control-allow-origin", origin);
      headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
      headers.set(
        "access-control-allow-headers",
        "Authorization, Content-Type",
      );
    }
    const json = (data: unknown, status = 200) =>
      Response.json(data, { status, headers });
    if (req.method === "OPTIONS")
      return new Response(null, {
        status: origin === env.FRONTEND_ORIGIN ? 204 : 403,
        headers,
      });
    const url = new URL(req.url);
    if (url.pathname === "/health" && req.method === "GET")
      return json({ status: "ok" });
    if (!url.pathname.startsWith("/api/"))
      return json({ error: "Route not found." }, 404);
    if (!env.DATABASE_URL)
      return json({ error: "Live portal is not configured." }, 503);
    try {
      const sql = neon(env.DATABASE_URL);
      const u = await authenticate(req, sql);
      if (url.pathname === "/api/me" && req.method === "GET")
        return json({ name: u.name, role: u.role });
      if (url.pathname === "/api/dashboard" && req.method === "GET") {
        const month = url.searchParams.get("month");
        if (month !== null && !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month))
          return json({ error: "Choose a valid calendar month." }, 400);
        const [lessons, purchases, services] = await Promise.all([
          schedule(sql, u, month && month + "-01"),
          u.role === "student" ? balances(sql, u) : [],
          sql`SELECT service_id::text,service_name,duration_minutes,base_price FROM service WHERE is_active ORDER BY service_id`,
        ]);
        const students =
          u.role === "student"
            ? []
            : await sql`SELECT DISTINCT student_id::text, student_name FROM lesson_schedule WHERE (${u.role}='admin' OR instructor_id=${u.instructor_id}::bigint) ORDER BY student_name`;
        return json({ lessons, purchases, services, students });
      }
      if (url.pathname === "/api/availability" && req.method === "GET")
        return json(
          await availability(
            sql,
            u,
            url.searchParams.get("service"),
            url.searchParams.get("date"),
          ),
        );
      if (url.pathname === "/api/bookings" && req.method === "POST")
        return json(await book(sql, u, await input(req)), 201);
      if (url.pathname === "/api/chat" && req.method === "POST")
        return json(await chat(req, sql, u, env));
      return json({ error: "Route not found." }, 404);
    } catch (error) {
      if (error instanceof HTTP)
        return json({ error: error.message }, error.status);
      const code = (error as { code?: string }).code;
      if (
        ["23P01", "23505", "23503", "P0001", "40001", "40P01"].includes(
          code ?? "",
        )
      )
        return json(
          {
            error:
              "That slot or package is no longer available. Refresh and try again.",
          },
          409,
        );
      return json({ error: "The service is temporarily unavailable." }, 503);
    }
  },
};
