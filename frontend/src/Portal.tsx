import { WorkspaceChat, type BookingPrefill } from "./WorkspaceChat"
import { AssistantButton, MapDirections } from "./WorkspaceActions"
import { MonthCalendar } from "./MonthCalendar"
import { WorkspaceMenu, type MenuGroup } from "./WorkspaceMenu"
import { useEffect, useState, type ReactNode, type FormEvent } from "react"
import { day, stamp, startAt, pickups, money, zone } from "./catalog"
import {
  balance,
  due,
  hour,
  person,
  scoped,
  serviceName,
  teaching,
  type Booking,
  type Lesson,
  type Person,
  type State,
} from "./domain"

const eventTime = new Intl.DateTimeFormat("en-CA", {
  timeStyle: "short",
  timeZone: zone,
  hour12: true,
})

const nav: Record<Person["role"], MenuGroup[]> = {
  student: [
    {
      title: "Your lessons",
      items: ["Dashboard", "Book a Session", "My Bookings"],
    },
    { title: "Learning", items: ["My Progress", "Attendance", "Chatbot"] },
  ],
  driver: [
    {
      title: "Driving",
      items: ["Dashboard", "Weekly Schedule", "Schedule Requests"],
    },
    { title: "Teaching", items: ["Student Feedback", "Chatbot"] },
  ],
  instructor: [
    {
      title: "Teaching",
      items: [
        "Dashboard",
        "Schedule",
        "Attendance",
        "Student Feedback",
        "Practice-Test Scores",
      ],
    },
    { title: "Support", items: ["Instructor Assistant"] },
  ],
  admin: [
    {
      title: "Operations",
      items: ["Dashboard", "Bookings", "Approval Requests"],
    },
    { title: "People", items: ["Students", "Staff"] },
    {
      title: "Business",
      items: [
        "Packages",
        "Payments",
        "Reports",
        "School Assistant",
        "Demo Data",
      ],
    },
  ],
}
const empty = (message: string) => <p className="empty">{message}</p>
const labels = (xs: string[]) => xs.map((x) => <option key={x}>{x}</option>)
const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim()
const field = (
  name: string,
  title: string,
  type = "text",
  value?: string,
  required = true
) => (
  <label>
    {title}
    <input
      name={name}
      type={type}
      defaultValue={value}
      required={required}
      maxLength={240}
      step={type === "number" ? "any" : undefined}
    />
  </label>
)
function useClock() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])
  return now
}
const datePlus = (n: number) => day(Date.now() + n * 24 * hour)
function Form({
  children,
  onSave,
  label = "Save changes",
}: {
  children?: ReactNode
  onSave: (f: FormData) => void | Promise<unknown>
  label?: string
}) {
  const [message, setMessage] = useState(""),
    [ok, setOk] = useState(false),
    [busy, setBusy] = useState(false)
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    try {
      setBusy(true)
      await onSave(new FormData(e.currentTarget))
      setOk(true)
      setMessage("Saved.")
    } catch (e) {
      setOk(false)
      setMessage(e instanceof Error ? e.message : "Unable to save. Try again.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="form" onSubmit={submit}>
      {children}
      <button className="primary" disabled={busy}>
        {busy ? "Saving…" : label} ↗
      </button>
      {message && (
        <p className={ok ? "notice" : "error"} role="status">
          {message}
        </p>
      )}
    </form>
  )
}
export type Save = (
  op: string,
  data: Record<string, unknown>
) => Promise<{ pending?: boolean; code?: string }>
export type FindSlots = (params: URLSearchParams) => Promise<string[]>
const pickupName = (l: Lesson) =>
  pickups[l.pickup]?.[1] ?? l.address ?? "Pick-up"
const pickupAddress = (l: Lesson) => pickups[l.pickup]?.[2] ?? l.address ?? ""
const values = (f: FormData) => Object.fromEntries(f.entries())
function downloadReminder(l: Lesson) {
  const stampUTC = (n: number) =>
    new Date(n)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d+Z$/, "Z")
  const blob = new Blob(
    [
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//LAC//Lessons//EN",
        "BEGIN:VEVENT",
        "UID:" + l.id + "@lac.example",
        "DTSTAMP:" + stampUTC(Date.now()),
        "DTSTART:" + stampUTC(l.start),
        "DTEND:" + stampUTC(l.end),
        "SUMMARY:L.A.C. driving lesson",
        "BEGIN:VALARM",
        "TRIGGER:-PT24H",
        "ACTION:DISPLAY",
        "DESCRIPTION:Driving lesson tomorrow",
        "END:VALARM",
        "END:VEVENT",
        "END:VCALENDAR",
        "",
      ].join("\r\n"),
    ],
    { type: "text/calendar" }
  )
  const href = URL.createObjectURL(blob),
    a = document.createElement("a")
  a.href = href
  a.download = "lac-lesson.ics"
  a.click()
  setTimeout(() => URL.revokeObjectURL(href), 1000)
}
function Book({
  state,
  user,
  save,
  findSlots,
  service,
  existing,
  prefill,
  finished,
  bookingConfirmed,
}: {
  state: State
  user: Person
  save: Save
  findSlots: FindSlots
  service: string
  existing?: Lesson
  prefill?: BookingPrefill
  finished: () => void
  bookingConfirmed?: () => void
}) {
  const staff = state.people.filter((p) => teaching(p) && p.active)
  const [step, setStep] = useState(0),
    [mode, setMode] = useState("Standard"),
    [date, setDate] = useState(
      existing ? day(existing.start) : (prefill?.date ?? datePlus(1))
    ),
    [time, setTime] = useState(prefill?.time ?? ""),
    [review, setReview] = useState<Booking>()
  const [b, setB] = useState<Booking>({
    service:
      existing?.service ??
      prefill?.service ??
      state.catalog.find((v) => v.publicKey === service)?.id ??
      state.catalog[0]?.id ??
      "",
    student:
      existing?.students[0] ??
      (user.role === "student"
        ? user.id
        : (state.people.find((p) => p.role === "student" && p.active)?.id ??
          "")),
    staff: existing?.staff ?? prefill?.staff ?? staff[0]?.id ?? "",
    start: 0,
    pickup: existing && existing.pickup >= 0 ? existing.pickup : 0,
    purchase: existing?.purchase,
  })
  const svc = state.catalog.find((x) => x.id === b.service)
  const isStudent = user.role === "student"
  const now = useClock()
  const late = !!existing && existing.start - now < 48 * hour && isStudent
  const request = late || mode !== "Standard"
  const [slotResult, setSlotResult] = useState<{
    key: string
    times: string[]
    error?: string
  }>()
  const [pending, setPending] = useState(false)
  const slotKey = new URLSearchParams({
    student: b.student,
    staff: b.staff,
    service: b.service,
    date,
    ...(existing ? { lesson: existing.id } : {}),
  }).toString()
  const find = Boolean(
    b.student &&
    b.staff &&
    b.service &&
    date &&
    mode !== "Special time" &&
    step === 0
  )
  useEffect(() => {
    if (!find) return
    let current = true
    findSlots(new URLSearchParams(slotKey))
      .then((times) => {
        if (current) setSlotResult({ key: slotKey, times })
      })
      .catch((e: Error) => {
        if (current)
          setSlotResult({ key: slotKey, times: [], error: e.message })
      })
    return () => {
      current = false
    }
  }, [find, findSlots, slotKey])
  const available = slotResult?.key === slotKey ? slotResult.times : []
  const bookableStaff =
    mode === "Group session"
      ? staff.filter((p) => p.role === "instructor")
      : staff
  const change = (p: Partial<Booking>) => {
    setB({ ...b, ...p })
    setTime("")
  }
  async function confirm() {
    if (!review) return
    const result = await save("book", {
      booking: review,
      lesson: existing?.id,
      mode:
        mode === "Special time"
          ? "special"
          : mode === "Group session"
            ? "group"
            : "standard",
    })
    setPending(Boolean(result.pending))
    setStep(2)
    if (!existing && !result.pending) bookingConfirmed?.()
  }
  return (
    <article className="card booking">
      <div className="eyebrow">
        01 DETAILS &nbsp; / &nbsp; 02 REVIEW &nbsp; / &nbsp; 03 CONFIRMATION
      </div>
      {step === 0 && (
        <>
          <h3>{existing ? "Reschedule your lesson" : "Choose your lesson"}</h3>
          <Form
            label="Review booking"
            onSave={(f) => {
              if (!time || !date) throw Error("Choose a time and date.")
              const group =
                existing?.students.slice(1) ?? f.getAll("group").map(String)
              const next = {
                ...b,
                start: startAt(date, time),
                observer: f.has("observer"),
                note: text(f, "note"),
                group,
              }
              if (
                !b.staff ||
                !b.student ||
                !b.service ||
                !pickups[b.pickup] ||
                next.start <= Date.now()
              )
                throw Error(
                  "Choose a student, staff member, service, pickup and future time."
                )
              if (mode !== "Special time" && !available.includes(time))
                throw Error("Select an available time.")
              if (mode === "Group session" && (next.purchase || next.observer))
                throw Error(
                  "Group bookings cannot use a package or include an observer."
                )
              setReview(next)
              setStep(1)
            }}
          >
            {!isStudent && (
              <label>
                Student
                <select
                  value={b.student}
                  onChange={(e) =>
                    change({ student: e.target.value, purchase: undefined })
                  }
                >
                  {state.people
                    .filter((p) => p.role === "student" && p.active)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label>
              Service
              <select
                value={b.service}
                onChange={(e) =>
                  change({ service: e.target.value, purchase: undefined })
                }
              >
                {state.catalog.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} · {x.tag} · {x.minutes} min · {money(x.price)}
                  </option>
                ))}
              </select>
            </label>
            {!existing && (
              <label>
                Session type
                <select
                  value={mode}
                  onChange={(e) => {
                    const next = e.target.value
                    setMode(next)
                    if (next === "Group session")
                      change({
                        staff:
                          staff.find(
                            (p) => p.id === b.staff && p.role === "instructor"
                          )?.id ??
                          staff.find((p) => p.role === "instructor")?.id ??
                          "",
                        purchase: undefined,
                      })
                    else setTime("")
                  }}
                >
                  {labels(
                    isStudent
                      ? ["Standard", "Special time", "Group session"]
                      : ["Standard", "Group session"]
                  )}
                </select>
              </label>
            )}
            <label>
              Staff member
              <select
                value={b.staff}
                onChange={(e) => change({ staff: e.target.value })}
              >
                {bookableStaff.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.role}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Pick-up point
              <select
                value={b.pickup}
                onChange={(e) => change({ pickup: +e.target.value })}
              >
                {pickups.map(([city, name], i) => (
                  <option key={name} value={i}>
                    {city} · {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Package
              <select
                disabled={mode === "Group session"}
                value={b.purchase ?? ""}
                onChange={(e) =>
                  change({ purchase: e.target.value || undefined })
                }
              >
                <option value="">Pay for this lesson separately</option>
                {state.purchases
                  .filter(
                    (p) =>
                      p.student === b.student &&
                      p.service === b.service &&
                      p.expiry >= date
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({balance(state, p).available} available)
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Date{" "}
              <input
                required
                type="date"
                min={day()}
                value={date}
                onChange={(e) => {
                  setDate(e.target.value)
                  setTime("")
                }}
              />
            </label>
            {mode === "Special time" ? (
              <label>
                Requested Pacific time
                <input
                  required
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </label>
            ) : (
              <fieldset className="slot-picker">
                <legend>Available Pacific times</legend>
                {available.length ? (
                  <div className="chips">
                    {available.map((t) => (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={time === t}
                        className={time === t ? "primary" : "secondary"}
                        onClick={() => setTime(t)}
                      >
                        {eventTime.format(startAt(date, t))}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p role="status">
                    {slotResult?.key === slotKey && slotResult.error
                      ? slotResult.error
                      : find && slotResult?.key !== slotKey
                        ? "Checking available times…"
                        : "No available slots for these details."}
                  </p>
                )}
              </fieldset>
            )}
            {!isStudent && mode === "Group session" && (
              <label>
                Additional participants
                <select name="group" multiple required>
                  {state.people
                    .filter(
                      (p) =>
                        p.role === "student" && p.active && p.id !== b.student
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label className="check">
              <input
                type="checkbox"
                name="observer"
                defaultChecked={existing?.observer}
              />{" "}
              Add one observer (+$20)
            </label>
            <label>
              {mode === "Group session"
                ? "Group details / participant names"
                : "Booking notes"}
              <textarea
                name="note"
                maxLength={500}
                defaultValue={existing?.note}
                required={mode === "Group session"}
              />
            </label>
            {request && isStudent && (
              <p className="notice">
                This change needs admin approval.
                {late ? " Late rescheduling may incur a $30 fee." : ""}
              </p>
            )}
          </Form>
        </>
      )}
      {step === 1 && review && (
        <>
          <h3>Review your booking</h3>
          <p>
            {svc?.name} · {stamp(review.start)} Pacific ·{" "}
            {person(state, review.staff)}
          </p>
          <p>
            {pickups[review.pickup][1]} · {pickups[review.pickup][2]}
          </p>
          <p>
            {review.purchase
              ? "Covered by your package"
              : `${money(svc?.price ?? 0)} due before lesson`}
            {review.observer ? " + $20 observer fee" : ""}
          </p>
          <Form
            label={request && isStudent ? "Submit request" : "Confirm booking"}
            onSave={confirm}
          >
            <label className="check">
              <input type="checkbox" required /> I agree to the{" "}
              <a href="/hours#faq" target="_blank">
                school policies
              </a>
              .
            </label>
          </Form>
          <button className="secondary" onClick={() => setStep(0)}>
            Back to details
          </button>
        </>
      )}
      {step === 2 && (
        <>
          <h3>{pending ? "Request submitted" : "Booking confirmed"} ✓</h3>
          <p>
            {pending
              ? "Staff will review your request in the approval queue."
              : "Your booking appears on your schedule."}
          </p>
          <button className="primary" onClick={finished}>
            View dashboard ↗
          </button>
        </>
      )}
    </article>
  )
}

export function Portal({
  state,
  user,
  save,
  initial,
  service,
  findSlots,
  token,
  demoEnabled,
  bookingConfirmed,
}: {
  state: State
  user: Person
  save: Save
  initial: string
  service: string
  findSlots: FindSlots
  token: string
  demoEnabled: boolean
  bookingConfirmed: () => void
}) {
  const [tab, setTab] = useState(
      nav[user.role].some((group) => group.items.includes(initial))
        ? initial
        : "Dashboard"
    ),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState(""),
    [edit, setEdit] = useState<Lesson>(),
    [notice, setNotice] = useState(""),
    [report, setReport] = useState("Package balances"),
    [loc, setLoc] = useState("")
  const [prefill, setPrefill] = useState<BookingPrefill>()
  const [weekOffset, setWeekOffset] = useState(0)
  const [reportFrom, setReportFrom] = useState("")
  const [reportTo, setReportTo] = useState("")
  const student = user.role === "student",
    admin = user.role === "admin",
    staff = teaching(user)
  const now = useClock()
  const lessons = scoped(state, user).sort((a, b) => a.start - b.start),
    upcoming = lessons.filter((l) => l.status === "scheduled" && l.start > now)
  const reportLessons = lessons.filter(
    (l) =>
      (!reportFrom || day(l.start) >= reportFrom) &&
      (!reportTo || day(l.start) <= reportTo)
  )
  const weekDate = new Date(day(now) + "T12:00:00Z")
  weekDate.setUTCDate(
    weekDate.getUTCDate() - ((weekDate.getUTCDay() + 6) % 7) + weekOffset * 7
  )
  const weekStart = weekDate.toISOString().slice(0, 10)
  weekDate.setUTCDate(weekDate.getUTCDate() + 6)
  const weekEnd = weekDate.toISOString().slice(0, 10)
  const myPackages = state.purchases.filter(
    (p) => p.student === user.id && p.expiry >= day()
  )
  const requests = state.requests.filter((r) => admin || r.by === user.id)
  const alerts = [
    ...requests
      .filter((r) => (admin ? r.status === "pending" : r.status !== "pending"))
      .map((r) => ({
        id: r.id + ":" + r.status,
        copy: admin
          ? person(state, r.by) + " submitted a " + r.type + " request."
          : "Your " + r.type + " request was " + r.status + ".",
      })),
    ...upcoming
      .filter((l) => l.start - now < 24 * hour)
      .map((l) => ({
        id: l.id + ":" + l.start,
        copy:
          "Lesson reminder: " +
          stamp(l.start) +
          " Pacific at " +
          pickupName(l) +
          ".",
      })),
  ]
  const [read, setRead] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("lac-inbox-" + user.id) ?? "[]")
    } catch {
      return []
    }
  })
  const unread = alerts.filter((a) => !read.includes(a.id)).length
  function navigate(t: string) {
    setTab(t)
    setEdit(undefined)
    setQuery("")
    setSelected("")
    setNotice("")
    setPrefill(undefined)
  }
  async function cancel(l: Lesson) {
    try {
      const result = await save("cancel", { lesson: l.id })
      setNotice(
        result.pending ? "Cancellation request submitted." : "Lesson cancelled."
      )
    } catch (e) {
      setNotice((e as Error).message)
    }
  }
  const list = (items: Lesson[], actions = false, agenda = false) =>
    items.length
      ? items.map((l) => (
          <article
            key={l.id}
            className={agenda ? "agenda-event" : "card session"}
          >
            <div>
              <div className="eyebrow">
                {agenda
                  ? l.status
                  : l.status + " · " + stamp(l.start) + " PACIFIC"}
              </div>
              <h3>{serviceName(state, l.service)}</h3>
              {agenda ? (
                <>
                  <dl className="event-details">
                    <div>
                      <dt>Time</dt>
                      <dd>{eventTime.formatRange(l.start, l.end)} Pacific</dd>
                    </div>
                    <div>
                      <dt>{student ? "Instructor" : "Student"}</dt>
                      <dd>
                        {student
                          ? person(state, l.staff)
                          : l.students
                              .map((id) => person(state, id))
                              .join(", ")}
                      </dd>
                    </div>
                    {!student && (
                      <div>
                        <dt>Assigned staff</dt>
                        <dd>{person(state, l.staff)}</dd>
                      </div>
                    )}
                    <div>
                      <dt>Pickup</dt>
                      <dd>
                        {pickupName(l)}
                        <br />
                        {pickupAddress(l)}
                      </dd>
                    </div>
                  </dl>
                  <MapDirections address={pickupAddress(l)} />
                </>
              ) : (
                <>
                  <p>
                    {l.students.length > 1 ? "Group session · " : ""}
                    {student
                      ? person(state, l.staff)
                      : l.students.map((x) => person(state, x)).join(", ")}{" "}
                    · {pickupName(l)}
                  </p>
                  <a
                    href={
                      "https://www.google.com/maps/search/?api=1&query=" +
                      encodeURIComponent(pickupAddress(l))
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    Directions ↗
                  </a>
                </>
              )}
              {l.status === "scheduled" && l.start > now && (
                <button
                  className="secondary reminder"
                  onClick={() => downloadReminder(l)}
                >
                  Calendar reminder ↓
                </button>
              )}
            </div>
            {actions &&
              l.canChange !== false &&
              l.status === "scheduled" &&
              l.start > now && (
                <div className="actions">
                  <button className="secondary" onClick={() => setEdit(l)}>
                    Reschedule
                  </button>
                  <button className="secondary" onClick={() => cancel(l)}>
                    Cancel
                  </button>
                </div>
              )}
            {admin && l.status === "scheduled" && l.end <= now && (
              <Form
                label="Update status"
                onSave={(f) =>
                  save("status", { lesson: l.id, status: text(f, "status") })
                }
              >
                <label>
                  Status
                  <select name="status">
                    {labels(["completed", "no-show"])}
                  </select>
                </label>
              </Form>
            )}
          </article>
        ))
      : empty("No lessons to display.")
  const queue = () =>
    requests.length
      ? requests.map((r) => (
          <article className="card" key={r.id}>
            <div className="eyebrow">
              {r.type} · {r.status}
            </div>
            <h3>{person(state, r.by)}</h3>
            <p>{r.reason}</p>
            {r.booking && (
              <p>
                {stamp(r.booking.start)} · {person(state, r.booking.staff)}
              </p>
            )}
            {r.decision && <p>{r.decision}</p>}
            {admin && r.status === "pending" && (
              <Form
                label="Record decision"
                onSave={(f) =>
                  save("decision", {
                    ...values(f),
                    id: r.id,
                    participants: f.getAll("participants"),
                  })
                }
              >
                <label>
                  Decision
                  <select name="decision">
                    {labels(["Approve", "Decline"])}
                  </select>
                </label>
                {r.type === "group" && (
                  <label>
                    Additional participants
                    <select name="participants" multiple>
                      {state.people
                        .filter(
                          (p) =>
                            p.role === "student" && p.active && p.id !== r.by
                        )
                        .map((p) => (
                          <option value={p.id} key={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                {field("note", "Decision note", "text", "", false)}
              </Form>
            )}
          </article>
        ))
      : empty("No requests yet.")
  const records = () => {
    const l = lessons.find((x) => x.id === selected.split(":")[0])
    const who = selected.split(":")[1]
    const note = state.records.find(
      (x) => x.lesson === l?.id && x.student === who
    )
    return (
      <>
        <label>
          Choose a past session and student
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Select a session</option>
            {lessons
              .filter((x) => x.end <= now && x.status !== "cancelled")
              .flatMap((l) =>
                l.students.map((s) => (
                  <option key={l.id + s} value={l.id + ":" + s}>
                    {stamp(l.start)} · {person(state, s)}
                  </option>
                ))
              )}
          </select>
        </label>
        {l && who && (
          <Form
            key={selected}
            onSave={(f) =>
              save("record", {
                ...values(f),
                lesson: l.id,
                student: who,
                visible: f.has("visible"),
              })
            }
          >
            <label>
              Attendance
              <select name="attendance" defaultValue={note?.attendance}>
                {labels(["Present", "Absent"])}
              </select>
            </label>
            {field(
              "topics",
              "Topics and skills practised",
              "text",
              note?.topics,
              false
            )}
            {field("strengths", "Strengths", "text", note?.strengths, false)}
            {field("improve", "Areas to improve", "text", note?.improve, false)}
            {field("focus", "Next lesson focus", "text", note?.focus, false)}
            {user.role === "instructor" &&
              field(
                "score",
                "Practice test score (0–100)",
                "number",
                note?.score,
                false
              )}
            {field(
              "private",
              "Private staff notes",
              "text",
              note?.privateNote,
              false
            )}
            <label className="check">
              <input
                type="checkbox"
                name="visible"
                defaultChecked={note?.visible}
              />{" "}
              Share feedback with student
            </label>
          </Form>
        )}
      </>
    )
  }
  const calendar = (
    <MonthCalendar
      events={lessons.map((lesson) => ({
        ...lesson,
        title: serviceName(state, lesson.service),
      }))}
      renderEvent={(event) => list([event], student || admin, true)}
    />
  )

  return (
    <section className="wrap section portal">
      <WorkspaceMenu
        groups={[...nav[user.role], { title: "Updates", items: ["Inbox"] }]}
        active={tab}
        onSelect={navigate}
        unread={unread}
      />
      <div className="portal-content">
        <div className="eyebrow">L.A.C. WORKSPACE · PACIFIC TIME</div>
        <h2>
          {["Chatbot", "Instructor Assistant", "School Assistant"].includes(tab)
            ? "AI Assistant"
            : tab}
        </h2>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {edit ? (
          <>
            <button className="secondary" onClick={() => setEdit(undefined)}>
              ← Back
            </button>
            <Book
              state={state}
              user={user}
              save={save}
              findSlots={findSlots}
              service={service}
              existing={edit}
              finished={() => navigate("Dashboard")}
            />
          </>
        ) : (
          <>
            {tab === "Inbox" && (
              <article className="card">
                <h3>In-app updates</h3>
                {alerts.length
                  ? alerts.map((a) => (
                      <div key={a.id} className="line">
                        <span>
                          {read.includes(a.id) ? "Read" : "New"} · {a.copy}
                        </span>
                      </div>
                    ))
                  : empty("You’re all caught up.")}
                <button
                  className="secondary"
                  disabled={!unread}
                  onClick={() => {
                    const all = [
                      ...new Set([...read, ...alerts.map((a) => a.id)]),
                    ]
                    localStorage.setItem(
                      "lac-inbox-" + user.id,
                      JSON.stringify(all)
                    )
                    setRead(all)
                  }}
                >
                  Mark all as read
                </button>
              </article>
            )}
            {tab === "Dashboard" && (
              <>
                {student && (
                  <>
                    <div className="stats">
                      {myPackages.map((p) => (
                        <article key={p.id} className="card">
                          <div className="eyebrow">{p.name}</div>
                          <h3>{balance(state, p).remaining} lessons left</h3>
                          <p>
                            {balance(state, p).reserved} already booked ·
                            Expires {p.expiry}
                          </p>
                        </article>
                      ))}
                    </div>
                  </>
                )}
                {admin && (
                  <>
                    <div className="stats">
                      {[
                        [
                          "New students this week",
                          state.people.filter(
                            (p) =>
                              p.role === "student" &&
                              p.joined >= now - 7 * 24 * hour
                          ).length,
                        ],
                        [
                          "Lessons booked this week",
                          lessons.filter(
                            (l) =>
                              l.booked != null &&
                              l.booked >= now - 7 * 24 * hour
                          ).length,
                        ],
                        [
                          "Pending approvals",
                          requests.filter((r) => r.status === "pending").length,
                        ],
                      ].map(([label, total]) => (
                        <article className="card" key={label}>
                          <div className="eyebrow">{label}</div>
                          <h3>{total}</h3>
                        </article>
                      ))}
                    </div>
                  </>
                )}
                {user.role === "driver" && (
                  <article className="card">
                    <h3>Today’s lessons</h3>
                    {list(
                      lessons.filter(
                        (l) =>
                          day(l.start) === day(now) && l.status !== "cancelled"
                      )
                    )}
                  </article>
                )}
                {calendar}
              </>
            )}
            {tab === "Book a Session" && (
              <Book
                bookingConfirmed={bookingConfirmed}
                prefill={prefill}
                state={state}
                user={user}
                save={save}
                findSlots={findSlots}
                service={service}
                finished={() => navigate("Dashboard")}
              />
            )}
            {tab === "My Bookings" && (
              <>
                {list(lessons, true)}
                <h3>My requests</h3>
                {queue()}
              </>
            )}
            {tab === "Bookings" && (
              <>
                <details className="card">
                  <summary>Create a booking</summary>
                  <Book
                    state={state}
                    user={user}
                    save={save}
                    findSlots={findSlots}
                    service={service}
                    finished={() => navigate("Dashboard")}
                  />
                </details>
                <label>
                  Search bookings
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Student, instructor or status"
                  />
                </label>
                {list(
                  lessons.filter((l) =>
                    [
                      l.status,
                      person(state, l.staff),
                      ...l.students.map((x) => person(state, x)),
                    ]
                      .join(" ")
                      .toLowerCase()
                      .includes(query.toLowerCase())
                  ),
                  true
                )}
              </>
            )}
            {tab === "Schedule" && calendar}
            {staff &&
              [
                "Attendance",
                "Practice-Test Scores",
                "Student Feedback",
              ].includes(tab) && (
                <article className="card">{records()}</article>
              )}
            {student && ["Attendance", "My Progress"].includes(tab) && (
              <>
                {state.records
                  .filter(
                    (r) =>
                      r.student === user.id &&
                      (tab === "Attendance" || r.visible || r.score)
                  )
                  .map((r) => (
                    <article className="card" key={r.lesson}>
                      <div className="eyebrow">
                        {stamp(
                          lessons.find((l) => l.id === r.lesson)?.start ?? 0
                        )}
                      </div>
                      {tab === "Attendance" ? (
                        <h3>{r.attendance}</h3>
                      ) : (
                        <>
                          {r.visible && (
                            <>
                              <h3>{r.topics || "Lesson feedback"}</h3>
                              <p>{r.strengths}</p>
                              <p>{r.improve}</p>
                              <p>{r.focus}</p>
                            </>
                          )}
                          {r.score && <p>Practice test: {r.score}%</p>}
                        </>
                      )}
                    </article>
                  ))}
                {!state.records.some(
                  (r) =>
                    r.student === user.id &&
                    (tab === "Attendance" || r.visible || r.score)
                ) && empty("No records have been posted yet.")}
              </>
            )}
            {tab === "Schedule Requests" && (
              <>
                <article className="card">
                  <h3>Request a day off</h3>
                  <Form
                    label="Send request"
                    onSave={(f) => save("schedule", { ...values(f) })}
                  >
                    <label>
                      Date
                      <input required name="date" type="date" min={day()} />
                    </label>
                    {field("reason", "Reason")}
                  </Form>
                </article>
                {queue()}
              </>
            )}
            {tab === "Approval Requests" && queue()}
            {["Students", "Staff"].includes(tab) && (
              <>
                <label>
                  Search records
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Name or email"
                  />
                </label>
                <details className="card">
                  <summary>
                    Add {tab === "Students" ? "student" : "staff member"}
                  </summary>
                  <PersonForm
                    key={tab}
                    save={save}
                    role={tab === "Students" ? "student" : "driver"}
                  />
                </details>
                {state.people
                  .filter(
                    (p) =>
                      (tab === "Students"
                        ? p.role === "student"
                        : teaching(p)) &&
                      (p.name + " " + p.email)
                        .toLowerCase()
                        .includes(query.toLowerCase())
                  )
                  .map((p) => (
                    <details className="card" key={p.id}>
                      <summary>
                        {p.name} · {p.active ? "Active" : "Archived"}
                      </summary>
                      <PersonForm save={save} role={p.role} existing={p} />
                      {p.active && (
                        <Form
                          label="Generate a one-day access code"
                          onSave={async () => {
                            const result = await save("issue-code", {
                              id: p.id,
                              role: p.role,
                            })
                            setNotice(
                              "Access code (copy and share securely): " +
                                result.code
                            )
                          }}
                        />
                      )}
                      {p.role === "student" ? (
                        <>
                          <h3>Purchases</h3>
                          {state.purchases
                            .filter((x) => x.student === p.id)
                            .map((x) => (
                              <p key={x.id}>
                                {x.name} · {balance(state, x).remaining}{" "}
                                remaining
                              </p>
                            ))}
                          <h3>Lesson history</h3>
                          {list(
                            lessons.filter((x) => x.students.includes(p.id))
                          )}
                        </>
                      ) : (
                        <>
                          <h3>Assigned lessons</h3>
                          {list(lessons.filter((x) => x.staff === p.id))}
                          <h3>Add an availability window (Pacific)</h3>
                          <Form
                            label="Add availability"
                            onSave={(f) =>
                              save("availability", {
                                ...values(f),
                                staff: p.id,
                              })
                            }
                          >
                            {field("date", "Date", "date")}
                            {field("from", "From", "time")}
                            {field("to", "To", "time")}
                          </Form>
                          <h3>Unavailable dates</h3>
                          {state.unavailable
                            .filter((x) => x.staff === p.id)
                            .map((x, i) => (
                              <p key={i}>{x.date}</p>
                            ))}
                        </>
                      )}
                    </details>
                  ))}
              </>
            )}
            {tab === "Packages" && (
              <>
                <article className="card">
                  <h3>Record a package purchase</h3>
                  <Form
                    label="Record purchase"
                    onSave={(f) => save("purchase", { ...values(f) })}
                  >
                    <label>
                      Student
                      <select name="student" required>
                        {state.people
                          .filter((p) => p.role === "student" && p.active)
                          .map((p) => (
                            <option value={p.id} key={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Offer
                      <select name="offer">
                        {state.offers.map((p) => (
                          <option value={p.id} key={p.id}>
                            {p.lessons} lessons · {money(p.price)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </Form>
                </article>
                <details className="card">
                  <summary>Manage services</summary>
                  <Form
                    label="Add service"
                    onSave={(f) => save("service", values(f))}
                  >
                    {field("name", "Service name")}
                    {field("tag", "Licence class")}
                    {field("price", "Price (CAD)", "number")}
                    {field("minutes", "Duration in minutes", "number")}
                  </Form>
                  <label>
                    Service
                    <select
                      value={selected}
                      onChange={(e) => setSelected(e.target.value)}
                    >
                      <option value="">Choose a service</option>
                      {state.catalog.map((x) => (
                        <option value={x.id} key={x.id}>
                          {x.name} · {x.minutes} min
                        </option>
                      ))}
                    </select>
                  </label>
                  {state.catalog
                    .filter((x) => x.id === selected)
                    .map((x) => (
                      <Form
                        key={x.id}
                        onSave={(f) =>
                          save("service", { ...values(f), id: x.id })
                        }
                      >
                        {field("name", "Service name", "text", x.name)}
                        {field(
                          "price",
                          "Price (CAD)",
                          "number",
                          String(x.price)
                        )}
                        {field(
                          "minutes",
                          "Duration in minutes",
                          "number",
                          String(x.minutes)
                        )}
                      </Form>
                    ))}
                </details>
                <details className="card">
                  <summary>Manage package offers</summary>
                  <Form
                    label="Add package offer"
                    onSave={(f) => save("offer", values(f))}
                  >
                    {field("name", "Package name")}
                    {field("lessons", "Included lessons", "number")}
                    {field("price", "Price (CAD)", "number")}
                    <label>
                      Service{" "}
                      <select name="service" required>
                        {state.catalog.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </Form>
                  {state.offers.map((p) => (
                    <Form
                      key={p.id}
                      label={
                        "Update " + (p.name ?? p.lessons + "-lesson offer")
                      }
                      onSave={(f) => save("offer", { ...values(f), id: p.id })}
                    >
                      {field(
                        "price",
                        p.lessons + " lessons · price (CAD)",
                        "number",
                        String(p.price)
                      )}
                    </Form>
                  ))}
                </details>
                {state.purchases.map((p) => (
                  <div className="card" key={p.id}>
                    <b>
                      {person(state, p.student)} · {p.name}
                    </b>
                    <p>
                      {money(p.price)} agreed · {balance(state, p).remaining}{" "}
                      remaining · {balance(state, p).reserved} reserved ·
                      Expires {p.expiry}
                    </p>
                  </div>
                ))}
              </>
            )}
            {tab === "Payments" && (
              <>
                <article className="card">
                  <h3>Record a payment received outside the app</h3>
                  <Form
                    label="Record payment"
                    onSave={(f) => save("payment", { ...values(f) })}
                  >
                    <label>
                      Student
                      <select name="student" required>
                        {state.people
                          .filter((p) => p.role === "student")
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Amount (CAD)
                      <input
                        name="amount"
                        type="number"
                        min=".01"
                        step=".01"
                        required
                      />
                    </label>
                    {field("note", "Payment reference", "text", "", false)}
                  </Form>
                </article>
                {state.people
                  .filter((p) => p.role === "student")
                  .map((p) => (
                    <div className="card" key={p.id}>
                      <b>
                        {p.name} · {money(Math.abs(due(state, p.id)))}{" "}
                        {due(state, p.id) < 0 ? "credit" : "outstanding"}
                      </b>
                      {state.payments
                        .filter((x) => x.student === p.id)
                        .map((x) => (
                          <p key={x.id}>
                            {money(x.amount)} · {stamp(x.date)} · {x.note}
                          </p>
                        ))}
                    </div>
                  ))}
              </>
            )}
            {tab === "Weekly Schedule" && (
              <article className="card">
                <h3>
                  {weekStart} to {weekEnd}
                </h3>
                <div className="actions">
                  <button onClick={() => setWeekOffset((n) => n - 1)}>
                    Previous week
                  </button>
                  <button onClick={() => setWeekOffset(0)}>This week</button>
                  <button onClick={() => setWeekOffset((n) => n + 1)}>
                    Next week
                  </button>
                </div>
                {list(
                  lessons.filter(
                    (l) => day(l.start) >= weekStart && day(l.start) <= weekEnd
                  )
                )}
              </article>
            )}
            {tab === "Reports" && (
              <>
                <label>
                  Report
                  <select
                    value={report}
                    onChange={(e) => setReport(e.target.value)}
                  >
                    {labels([
                      "Package balances",
                      "Lesson schedule",
                      "Instructor workload",
                      "Cancellations and no-shows",
                      "Student history",
                      "Follow-up",
                    ])}
                  </select>
                </label>
                <label>
                  Search by name or status
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                {!["Package balances", "Follow-up"].includes(report) && (
                  <div className="actions">
                    <label>
                      From{" "}
                      <input
                        type="date"
                        value={reportFrom}
                        onChange={(e) => setReportFrom(e.target.value)}
                      />
                    </label>
                    <label>
                      Through{" "}
                      <input
                        type="date"
                        value={reportTo}
                        onChange={(e) => setReportTo(e.target.value)}
                      />
                    </label>
                  </div>
                )}
                <div className="card report">
                  {report === "Package balances" || report === "Follow-up"
                    ? state.purchases
                        .filter(
                          (p) =>
                            person(state, p.student)
                              .toLowerCase()
                              .includes(query.toLowerCase()) &&
                            (report !== "Follow-up" ||
                              (p.expiry >= day() &&
                                state.people.some(
                                  (person) =>
                                    person.id === p.student && person.active
                                ) &&
                                balance(state, p).available > 0 &&
                                !upcoming.some((l) =>
                                  l.students.includes(p.student)
                                )))
                        )
                        .map((p) => (
                          <div className="line" key={p.id}>
                            <b>{person(state, p.student)}</b>
                            <span>
                              {p.allowance} purchased · {balance(state, p).used}{" "}
                              used · {balance(state, p).remaining} remaining ·{" "}
                              {balance(state, p).reserved} booked
                            </span>
                          </div>
                        ))
                    : report === "Instructor workload"
                      ? state.people
                          .filter(
                            (p) =>
                              teaching(p) &&
                              p.name.toLowerCase().includes(query.toLowerCase())
                          )
                          .map((p) => (
                            <div className="line" key={p.id}>
                              <b>{p.name}</b>
                              <span>
                                {
                                  reportLessons.filter(
                                    (l) =>
                                      l.staff === p.id &&
                                      l.status === "scheduled"
                                  ).length
                                }{" "}
                                scheduled ·{" "}
                                {
                                  reportLessons.filter(
                                    (l) =>
                                      l.staff === p.id &&
                                      l.status === "completed"
                                  ).length
                                }{" "}
                                completed
                              </span>
                            </div>
                          ))
                      : list(
                          reportLessons.filter(
                            (l) =>
                              (report !== "Cancellations and no-shows" ||
                                ["cancelled", "no-show"].includes(l.status)) &&
                              (report !== "Student history" || l.end <= now) &&
                              [
                                l.status,
                                person(state, l.staff),
                                ...l.students.map((x) => person(state, x)),
                              ]
                                .join(" ")
                                .toLowerCase()
                                .includes(query.toLowerCase())
                          )
                        )}
                </div>
                {report === "Student history" &&
                  state.records
                    .filter(
                      (r) =>
                        reportLessons.some(
                          (l) => l.id === r.lesson && l.end <= now
                        ) &&
                        person(state, r.student)
                          .toLowerCase()
                          .includes(query.toLowerCase())
                    )
                    .map((r) => (
                      <article
                        className="card"
                        key={r.lesson + ":" + r.student}
                      >
                        <h3>
                          {person(state, r.student)} · {r.attendance}
                        </h3>
                        <p>
                          {stamp(
                            reportLessons.find((l) => l.id === r.lesson)!.start
                          )}{" "}
                          Pacific
                        </p>
                        {r.topics && <p>Topics: {r.topics}</p>}
                        {r.strengths && <p>Strengths: {r.strengths}</p>}
                        {r.improve && <p>Areas to improve: {r.improve}</p>}
                        {r.focus && <p>Next lesson: {r.focus}</p>}
                        {r.score && <p>Practice-test score: {r.score}%</p>}
                      </article>
                    ))}
              </>
            )}
            {admin && tab === "Demo Data" && (
              <article className="card">
                <h3>Demo database</h3>
                <p>
                  Populate a dedicated demo database with fictional records, or
                  clear it while keeping administrator access.
                </p>
                <div className="actions">
                  <a
                    className="button secondary"
                    href="/demo-populate.sql"
                    download
                  >
                    Download populate SQL
                  </a>
                  <a
                    className="button secondary"
                    href="/demo-empty.sql"
                    download
                  >
                    Download empty SQL
                  </a>
                </div>
                {demoEnabled ? (
                  <>
                    <Form
                      label="Populate database"
                      onSave={() => save("demo-seed", { confirm: "demo-seed" })}
                    >
                      <label className="check">
                        <input required type="checkbox" /> Populate this
                        dedicated demo database.
                      </label>
                    </Form>
                    <Form
                      label="Empty database"
                      onSave={() =>
                        save("demo-empty", { confirm: "demo-empty" })
                      }
                    >
                      <label className="check">
                        <input required type="checkbox" /> Permanently remove
                        all demo database records except administrator access.
                      </label>
                    </Form>
                  </>
                ) : (
                  <p>Database controls are disabled on this deployment.</p>
                )}
              </article>
            )}
            {["Chatbot", "Instructor Assistant", "School Assistant"].includes(
              tab
            ) && (
              <WorkspaceChat
                state={state}
                user={user}
                token={token}
                onBook={(slot) => {
                  navigate("Book a Session")
                  setPrefill(slot)
                }}
                onSchedule={() =>
                  navigate(
                    student
                      ? "My Bookings"
                      : admin
                        ? "Reports"
                        : user.role === "driver"
                          ? "Weekly Schedule"
                          : "Schedule"
                  )
                }
              />
            )}
          </>
        )}
        <details className="card location-tool">
          <summary>Pick-up directions and my location</summary>
          <p>
            Choose a pick-up point for directions. Your location is requested
            only when you press the button.
          </p>
          <div className="actions">
            <a className="button secondary" href="/locations">
              Pick-up map links ↗
            </a>
            <button
              className="secondary"
              onClick={() => {
                if (!navigator.geolocation) {
                  setLoc("Location is unavailable.")
                  return
                }
                navigator.geolocation.getCurrentPosition(
                  (p) => setLoc(p.coords.latitude + "," + p.coords.longitude),
                  () =>
                    setLoc("Location permission was denied or unavailable."),
                  { timeout: 8000 }
                )
              }}
            >
              Use my location
            </button>
          </div>
          {loc &&
            (/^[-\d]/.test(loc) ? (
              <a
                href={
                  "https://www.google.com/maps/search/?api=1&query=" +
                  encodeURIComponent(loc)
                }
                target="_blank"
                rel="noreferrer"
              >
                Open my current location on map ↗
              </a>
            ) : (
              <p role="status">{loc}</p>
            ))}
        </details>
        <div className="floating-chat">
          <AssistantButton
            onClick={() => {
              navigate(
                student || user.role === "driver"
                  ? "Chatbot"
                  : admin
                    ? "School Assistant"
                    : "Instructor Assistant"
              )
              window.scrollTo(0, 0)
            }}
          />
        </div>
      </div>
    </section>
  )
}
function PersonForm({
  role,
  save,
  existing,
}: {
  role: Person["role"]
  save: Save
  existing?: Person
}) {
  return (
    <Form
      onSave={(f) =>
        save("person", {
          ...values(f),
          id: existing?.id,
          role: text(f, "role") || role,
        })
      }
    >
      {field("name", "Full name", "text", existing?.name)}
      {field("email", "Email", "email", existing?.email)}
      {field("phone", "Phone", "tel", existing?.phone, false)}
      {role !== "student" && (
        <label>
          Role
          <select name="role" defaultValue={role}>
            {labels(["driver", "instructor"])}
          </select>
        </label>
      )}
      <label>
        Status
        <select
          name="status"
          defaultValue={existing?.active === false ? "Archived" : "Active"}
        >
          {labels(["Active", "Archived"])}
        </select>
      </label>
    </Form>
  )
}
