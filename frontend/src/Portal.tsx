import { AssistantButton, MapDirections, Sparkles } from "./WorkspaceActions"
import { MonthCalendar } from "./MonthCalendar"
import { WorkspaceMenu, type MenuGroup } from "./WorkspaceMenu"
import { useEffect, useState, type ReactNode, type FormEvent } from "react"
import { day, stamp, startAt, pickups, policies, money, zone } from "./catalog"
import {
  balance,
  createLesson,
  due,
  hour,
  id,
  person,
  scoped,
  serviceName,
  slots,
  teaching,
  type Booking,
  type Lesson,
  type Person,
  type State,
  type Status,
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
      items: ["Dashboard", "Schedule", "Schedule Requests"],
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
      items: ["Packages", "Payments", "Reports", "School Assistant"],
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
  children: ReactNode
  onSave: (f: FormData) => void
  label?: string
}) {
  const [message, setMessage] = useState(""),
    [ok, setOk] = useState(false)
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    try {
      onSave(new FormData(e.currentTarget))
      setOk(true)
      setMessage("Saved.")
    } catch (e) {
      setOk(false)
      setMessage(e instanceof Error ? e.message : "Unable to save. Try again.")
    }
  }
  return (
    <form className="form" onSubmit={submit}>
      {children}
      <button className="primary">{label} ↗</button>
      {message && (
        <p className={ok ? "notice" : "error"} role="status">
          {message}
        </p>
      )}
    </form>
  )
}
type Save = (fn: (s: State) => State) => void
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
        "SUMMARY:L.A.C. demo driving lesson",
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
  service,
  existing,
  finished,
  bookingConfirmed,
}: {
  state: State
  user: Person
  save: Save
  service: string
  existing?: Lesson
  finished: () => void
  bookingConfirmed?: () => void
}) {
  const staff = state.people.filter((p) => teaching(p) && p.active)
  const [step, setStep] = useState(0),
    [mode, setMode] = useState("Standard"),
    [date, setDate] = useState(existing ? day(existing.start) : datePlus(1)),
    [time, setTime] = useState(""),
    [review, setReview] = useState<Booking>()
  const [b, setB] = useState<Booking>({
    service: existing?.service ?? service,
    student:
      existing?.students[0] ??
      (user.role === "student"
        ? user.id
        : (state.people.find((p) => p.role === "student" && p.active)?.id ??
          "")),
    staff: existing?.staff ?? staff[0]?.id ?? "",
    start: 0,
    pickup: existing?.pickup ?? 0,
    purchase: existing?.purchase,
  })
  const svc = state.catalog.find((x) => x.id === b.service)
  const isStudent = user.role === "student"
  const now = useClock()
  const late = !!existing && existing.start - now < 48 * hour && isStudent
  const request = late || mode !== "Standard"
  const available = slots(
    existing
      ? { ...state, lessons: state.lessons.filter((l) => l.id !== existing.id) }
      : state,
    b,
    date
  )
  const change = (p: Partial<Booking>) => {
    setB({ ...b, ...p })
    setTime("")
  }
  function confirm() {
    if (!review) return
    save((s) => {
      if (
        existing &&
        !s.lessons.some(
          (l) =>
            l.id === existing.id &&
            l.status === "scheduled" &&
            (user.role === "admin" || l.students.includes(user.id))
        )
      )
        throw Error("This booking is no longer available.")
      if ((request && isStudent) || mode === "Special time") {
        if (
          s.requests.some(
            (r) =>
              r.status === "pending" &&
              r.by === user.id &&
              r.lesson &&
              r.lesson === existing?.id
          )
        )
          throw Error("A request is already pending for this lesson.")
        createLesson(s, review, existing?.id, mode === "Special time")
        const type = existing
          ? "reschedule"
          : mode === "Group session"
            ? "group"
            : "special"
        return {
          ...s,
          requests: [
            ...s.requests,
            {
              id: id(),
              by: user.id,
              type,
              lesson: existing?.id,
              reason: review.note || type,
              booking: review,
              status: "pending",
            },
          ],
        }
      }
      const l = createLesson(s, review, existing?.id)
      return { ...s, lessons: [...s.lessons.filter((x) => x.id !== l.id), l] }
    })
    setStep(2)
    if (!existing && !(request && isStudent) && mode !== "Special time") {
      bookingConfirmed?.()
    }
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
              createLesson(state, next, existing?.id, mode === "Special time")
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
                    setMode(e.target.value)
                    setTime("")
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
                {staff.map((p) => (
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
                  <p>No available slots for these details.</p>
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
          <h3>
            {request && isStudent ? "Request submitted" : "Booking confirmed"} ✓
          </h3>
          <p>
            {request && isStudent
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
  resetDemo,
  bookingConfirmed,
}: {
  state: State
  user: Person
  save: Save
  initial: string
  service: string
  resetDemo: () => void
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
  const student = user.role === "student",
    admin = user.role === "admin",
    staff = teaching(user)
  const now = useClock()
  const lessons = scoped(state, user).sort((a, b) => a.start - b.start),
    upcoming = lessons.filter((l) => l.status === "scheduled" && l.start > now)
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
          pickups[l.pickup][1] +
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
  }
  function cancel(l: Lesson) {
    try {
      save((s) => {
        const current = scoped(s, user).find(
          (x) => x.id === l.id && x.status === "scheduled"
        )
        if (!current) throw Error("This lesson cannot be cancelled.")
        if (student && current.start - now < 48 * hour) {
          if (
            s.requests.some(
              (r) =>
                r.by === user.id && r.lesson === l.id && r.status === "pending"
            )
          )
            throw Error("A request is already pending.")
          return {
            ...s,
            requests: [
              ...s.requests,
              {
                id: id(),
                by: user.id,
                lesson: l.id,
                type: "cancel",
                reason: "Late cancellation request",
                status: "pending",
              },
            ],
          }
        }
        return {
          ...s,
          lessons: s.lessons.map((x) =>
            x.id === l.id ? { ...x, status: "cancelled" } : x
          ),
        }
      })
      setNotice(
        student && l.start - now < 48 * hour
          ? "Cancellation request submitted."
          : "Lesson cancelled."
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
                        {pickups[l.pickup][1]}
                        <br />
                        {pickups[l.pickup][2]}
                      </dd>
                    </div>
                  </dl>
                  <MapDirections address={pickups[l.pickup][2]} />
                </>
              ) : (
                <>
                  <p>
                    {l.students.length > 1 ? "Group session · " : ""}
                    {student
                      ? person(state, l.staff)
                      : l.students.map((x) => person(state, x)).join(", ")}{" "}
                    · {pickups[l.pickup][1]}
                  </p>
                  <a
                    href={
                      "https://www.google.com/maps/search/?api=1&query=" +
                      encodeURIComponent(pickups[l.pickup][2])
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
            {actions && l.status === "scheduled" && (
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
                  save((s) => ({
                    ...s,
                    lessons: s.lessons.map((x) =>
                      x.id === l.id && x.status === "scheduled"
                        ? { ...x, status: text(f, "status") as Status }
                        : x
                    ),
                  }))
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
                  save((s) => {
                    const fresh = s.requests.find(
                      (x) => x.id === r.id && x.status === "pending"
                    )
                    if (!fresh) throw Error("Already reviewed.")
                    const approve = text(f, "decision") === "Approve"
                    let next = s.lessons
                    let unavailable = s.unavailable
                    if (approve) {
                      const old = next.find(
                        (l) =>
                          l.id === r.lesson &&
                          l.status === "scheduled" &&
                          l.students.includes(r.by)
                      )
                      if (
                        (r.type === "reschedule" || r.type === "cancel") &&
                        !old
                      )
                        throw Error("The original booking has changed.")
                      if (r.type === "cancel")
                        next = next.map((l) =>
                          l.id === old?.id ? { ...l, status: "cancelled" } : l
                        )
                      else if (r.type === "schedule") {
                        const date = r.reason.slice(0, 10)
                        if (
                          date < day() ||
                          next.some(
                            (l) =>
                              l.staff === r.by &&
                              l.status === "scheduled" &&
                              day(l.start) === date
                          )
                        )
                          throw Error(
                            "Resolve existing bookings before blocking this date."
                          )
                        unavailable = [...unavailable, { staff: r.by, date }]
                      } else if (r.booking) {
                        const group =
                          r.type === "group"
                            ? f.getAll("participants").map(String)
                            : old?.students.slice(1)
                        if (r.type === "group" && !group?.length)
                          throw Error(
                            "Select at least one additional participant."
                          )
                        const l = createLesson(
                          s,
                          { ...r.booking, group },
                          old?.id,
                          r.type === "special"
                        )
                        next = [...next.filter((x) => x.id !== l.id), l]
                      }
                    }
                    return {
                      ...s,
                      lessons: next,
                      unavailable,
                      requests: s.requests.map((x) =>
                        x.id === r.id
                          ? {
                              ...x,
                              status: approve ? "approved" : "declined",
                              decision: text(f, "note"),
                            }
                          : x
                      ),
                    }
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
              save((s) => {
                const current = scoped(s, user).find(
                  (x) =>
                    x.id === l.id &&
                    x.students.includes(who) &&
                    x.status !== "cancelled" &&
                    x.end <= now
                )
                if (!current) throw Error("This session is unavailable.")
                const score = text(f, "score")
                if (
                  score &&
                  (+score < 0 || +score > 100 || !Number.isFinite(+score))
                )
                  throw Error("Enter a score from 0 to 100.")
                const rec = {
                  lesson: l.id,
                  student: who,
                  attendance: text(f, "attendance"),
                  topics: text(f, "topics"),
                  strengths: text(f, "strengths"),
                  improve: text(f, "improve"),
                  focus: text(f, "focus"),
                  score,
                  visible: f.has("visible"),
                  privateNote: text(f, "private"),
                }
                const all = [
                  ...s.records.filter(
                    (r) => r.lesson !== l.id || r.student !== who
                  ),
                  rec,
                ]
                const attendance = all.filter((r) => r.lesson === l.id)
                const status: Status =
                  attendance.length === l.students.length
                    ? attendance.every((r) => r.attendance === "Absent")
                      ? "no-show"
                      : "completed"
                    : "scheduled"
                return {
                  ...s,
                  records: all,
                  lessons: s.lessons.map((x) =>
                    x.id === l.id ? { ...x, status } : x
                  ),
                }
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
                          "Lessons in next 7 days",
                          upcoming.filter((l) => l.start < now + 7 * 24 * hour)
                            .length,
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
                {calendar}
              </>
            )}
            {tab === "Book a Session" && (
              <Book
                bookingConfirmed={bookingConfirmed}
                state={state}
                user={user}
                save={save}
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
                    onSave={(f) =>
                      save((s) => {
                        const date = text(f, "date")
                        if (date < day()) throw Error("Choose a future date.")
                        return {
                          ...s,
                          requests: [
                            ...s.requests,
                            {
                              id: id(),
                              by: user.id,
                              type: "schedule",
                              reason: date + " · " + text(f, "reason"),
                              status: "pending",
                            },
                          ],
                        }
                      })
                    }
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
                    onSave={(f) =>
                      save((s) => {
                        const offer = s.offers.find(
                            (x) => x.id === text(f, "offer")
                          ),
                          buyer = s.people.find(
                            (x) =>
                              x.id === text(f, "student") &&
                              x.active &&
                              x.role === "student"
                          )
                        if (!offer || !buyer)
                          throw Error("Choose an active student and an offer.")
                        const [year, month, date] = day().split("-").map(Number)
                        const expiry = [
                          year + 1,
                          month,
                          Math.min(
                            date,
                            new Date(Date.UTC(year + 1, month, 0)).getUTCDate()
                          ),
                        ]
                          .map((x, i) =>
                            i ? String(x).padStart(2, "0") : String(x)
                          )
                          .join("-")
                        return {
                          ...s,
                          purchases: [
                            ...s.purchases,
                            {
                              id: id(),
                              student: buyer.id,
                              name: offer.lessons + "-lesson package",
                              allowance: offer.lessons,
                              price: offer.price,
                              service: "lesson",
                              created: now,
                              expiry,
                            },
                          ],
                        }
                      })
                    }
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
                  <summary>Edit service pricing and duration</summary>
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
                          save((s) => {
                            const price = +text(f, "price"),
                              minutes = +text(f, "minutes")
                            if (
                              price < 0 ||
                              minutes <= 0 ||
                              !Number.isInteger(minutes)
                            )
                              throw Error("Enter a valid price and duration.")
                            return {
                              ...s,
                              catalog: s.catalog.map((y) =>
                                y.id === x.id
                                  ? {
                                      ...y,
                                      price,
                                      minutes,
                                      name: text(f, "name"),
                                    }
                                  : y
                              ),
                            }
                          })
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
                  <summary>Edit package offers</summary>
                  {state.offers.map((p) => (
                    <Form
                      key={p.id}
                      label={"Update " + p.lessons + "-lesson offer"}
                      onSave={(f) =>
                        save((s) => {
                          const price = +text(f, "price")
                          if (
                            price < 0 ||
                            price >
                              p.lessons *
                                (s.catalog.find((x) => x.id === "lesson")
                                  ?.price ?? 0)
                          )
                            throw Error(
                              "Enter a price between zero and the cost of individual lessons."
                            )
                          return {
                            ...s,
                            offers: s.offers.map((x) =>
                              x.id === p.id
                                ? {
                                    ...x,
                                    price,
                                    savings:
                                      p.lessons *
                                        (s.catalog.find(
                                          (y) => y.id === "lesson"
                                        )?.price ?? 0) -
                                      price,
                                  }
                                : x
                            ),
                          }
                        })
                      }
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
                    onSave={(f) =>
                      save((s) => {
                        const student = text(f, "student"),
                          amount = +text(f, "amount")
                        if (
                          !s.people.some(
                            (p) => p.id === student && p.role === "student"
                          ) ||
                          !Number.isFinite(amount) ||
                          amount <= 0
                        )
                          throw Error(
                            "Choose a student and enter a positive amount."
                          )
                        return {
                          ...s,
                          payments: [
                            ...s.payments,
                            {
                              id: id(),
                              student,
                              amount,
                              note: text(f, "note"),
                              date: now,
                            },
                          ],
                        }
                      })
                    }
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
                                  lessons.filter(
                                    (l) =>
                                      l.staff === p.id &&
                                      l.status === "scheduled"
                                  ).length
                                }{" "}
                                scheduled ·{" "}
                                {
                                  lessons.filter(
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
                          lessons.filter(
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
              </>
            )}
            {["Chatbot", "Instructor Assistant", "School Assistant"].includes(
              tab
            ) && (
              <Chat
                state={state}
                user={user}
                onBook={() => navigate("Book a Session")}
                onSchedule={() =>
                  navigate(
                    student ? "My Bookings" : admin ? "Reports" : "Schedule"
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
        <button className="secondary demo-reset" onClick={resetDemo}>
          Reset demo data
        </button>
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
        save((s) => {
          const name = text(f, "name"),
            email = text(f, "email")
          if (!name || !email) throw Error("Enter a name and email.")
          const p = {
            id: existing?.id ?? id(),
            name,
            email,
            phone: text(f, "phone"),
            role: (text(f, "role") || role) as Person["role"],
            active: text(f, "status") !== "Archived",
            joined: existing?.joined ?? Date.now(),
          }
          return { ...s, people: [...s.people.filter((x) => x.id !== p.id), p] }
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

export function Chat({
  state,
  user,
  close,
  onBook,
  onSchedule,
}: {
  state: State
  user?: Person
  close?: () => void
  onBook?: () => void
  onSchedule?: () => void
}) {
  const [question, setQuestion] = useState(""),
    [student, setStudent] = useState(""),
    [messages, setMessages] = useState<
      {
        question: string
        answer: string
        lines: string[]
        action?: "book" | "schedule"
        time: number
      }[]
    >([])
  const [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(""),
    [count, setCount] = useState(0)
  const staff = !!user && teaching(user),
    admin = user?.role === "admin"
  const mine = user ? scoped(state, user) : []
  const assigned = [...new Set(mine.flatMap((l) => l.students))]
  const suggestions = staff
    ? ["Today’s schedule", "This week’s summary", "Selected student’s history"]
    : admin
      ? ["Cancelled lessons this week", "Students needing follow-up"]
      : user
        ? ["My next lesson", "My package balance", "Find availability"]
        : ["Lesson prices", "School hours", "Cancellation policy"]
  function send(value: string) {
    const q = value.trim()
    if (!q || busy) return
    if (count >= 10) {
      setFailed(
        "Demo message limit reached. Open the assistant again to start a new session."
      )
      return
    }
    setBusy(true)
    setQuestion("")
    setFailed("")
    setTimeout(() => {
      try {
        const key = q.toLowerCase()
        const result: {
          answer: string
          lines: string[]
          action?: "book" | "schedule"
        } = {
          answer:
            "I can help with school services, prices, hours, pick-up locations and policies. Choose a suggested question to get started.",
          lines: [],
        }
        if (
          user?.role === "student" &&
          /package|balance|left|remaining/.test(key) &&
          !/price|cost/.test(key)
        ) {
          result.answer = "Your active package balances:"
          result.lines = state.purchases
            .filter((p) => p.student === user.id && p.expiry >= day())
            .map(
              (p) =>
                p.name +
                ": " +
                balance(state, p).remaining +
                " remaining, including " +
                balance(state, p).reserved +
                " booked."
            )
          if (!result.lines.length)
            result.answer = "You have no active packages."
        } else if (user?.role === "student" && /availab|find|slot/.test(key)) {
          result.action = "book"
          const iso = key.match(/\d{4}-\d{2}-\d{2}/)?.[0]
          if (!iso)
            result.answer =
              "Which date would you like? Enter YYYY-MM-DD, or open booking to browse the calendar."
          else {
            result.lines = state.people
              .filter((p) => teaching(p) && p.active)
              .flatMap((p) =>
                slots(
                  state,
                  {
                    student: user.id,
                    staff: p.id,
                    service: "lesson",
                    start: 0,
                    pickup: 0,
                  },
                  iso
                ).map((t) => p.name + " · " + t + " Pacific")
              )
              .slice(0, 8)
            result.answer = result.lines.length
              ? "Available 90-minute driving lesson times for " + iso + ":"
              : "No 90-minute driving lesson slots were found for " + iso + "."
          }
        } else if (
          user?.role === "student" &&
          /next|upcoming|booking/.test(key)
        ) {
          result.lines = mine
            .filter((l) => l.status === "scheduled" && l.start > Date.now())
            .sort((a, b) => a.start - b.start)
            .slice(0, 3)
            .map(
              (l) =>
                stamp(l.start) +
                " · " +
                serviceName(state, l.service) +
                " · " +
                pickups[l.pickup][1]
            )
          result.answer = result.lines.length
            ? "Your upcoming lessons:"
            : "You have no upcoming lessons."
          result.action = "schedule"
        } else if ((staff || admin) && /history/.test(key)) {
          result.answer = !student
            ? "Select a student before asking about their history."
            : !assigned.includes(student)
              ? "That student is outside your assigned lessons."
              : "Lesson history for " + person(state, student) + ":"
          if (assigned.includes(student))
            result.lines = mine
              .filter((l) => l.students.includes(student) && l.end < Date.now())
              .map(
                (l) =>
                  stamp(l.start) +
                  " · " +
                  l.status +
                  " · " +
                  serviceName(state, l.service)
              )
          if (assigned.includes(student) && !result.lines.length)
            result.answer = "No past lessons found for this student."
        } else if ((staff || admin) && /schedule|summary|cancel/.test(key)) {
          const start = /tomorrow/.test(key)
            ? datePlus(1)
            : /week/.test(key)
              ? datePlus(-6)
              : day()
          const end = /tomorrow/.test(key)
            ? datePlus(2)
            : /week/.test(key)
              ? datePlus(7)
              : datePlus(1)
          const matching = mine.filter(
            (l) =>
              day(l.start) >= start &&
              day(l.start) < end &&
              (!/cancel/.test(key) || l.status === "cancelled")
          )
          result.answer = matching.length
            ? matching.length + " matching lessons in your scope:"
            : "No matching lessons in your scope."
          result.lines = matching.map(
            (l) =>
              stamp(l.start) +
              " · " +
              l.status +
              " · " +
              serviceName(state, l.service)
          )
          result.action = "schedule"
        } else if (admin && /follow.up/.test(key)) {
          result.lines = state.purchases
            .filter(
              (p) =>
                p.expiry >= day() &&
                balance(state, p).available > 0 &&
                !mine.some(
                  (l) =>
                    l.students.includes(p.student) &&
                    l.status === "scheduled" &&
                    l.start > Date.now()
                )
            )
            .map(
              (p) =>
                person(state, p.student) +
                " · " +
                balance(state, p).available +
                " unbooked"
            )
          result.answer = result.lines.length
            ? "Students with unused lessons and no upcoming booking:"
            : "No students need package follow-up."
        } else if (/price|cost|service|package/.test(key)) {
          result.answer = "Prices in Canadian dollars:"
          result.lines = [
            ...state.catalog.map(
              (s) =>
                s.name +
                " · " +
                s.tag +
                " · " +
                s.minutes +
                " min · " +
                money(s.price)
            ),
            ...state.offers.map(
              (p) => p.lessons + " lessons · " + money(p.price)
            ),
          ]
        } else if (/hour|open/.test(key))
          result.answer =
            "Monday to Friday, 9:00 AM–6:00 PM. Saturday and Sunday, 10:00 AM–5:00 PM. All times are Pacific."
        else if (/location|pickup|pick.up/.test(key)) {
          result.answer = "Meet at one of these designated locations:"
          result.lines = pickups.map((p) => p[1] + " · " + p[2])
        } else if (/policy|policies|cancel|refund|reschedul/.test(key)) {
          result.answer = "School policies:"
          result.lines = policies
            .filter(
              ([t]) =>
                !/cancel|reschedul/.test(key) || t.startsWith("Cancellation")
            )
            .map(([t, p]) => t + ": " + p)
        }
        setMessages((m) => [...m, { question: q, ...result, time: Date.now() }])
        setCount((c) => c + 1)
      } catch {
        setFailed(q)
      } finally {
        setBusy(false)
      }
    }, 180)
  }
  return (
    <section className="card chat" aria-label="School assistant">
      <div className="section-head">
        <div>
          <div className="eyebrow">
            <i /> READ-ONLY · DEMO
          </div>
          <h3 className="assistant-title">
            AI Assistant <Sparkles />
          </h3>
        </div>
        {close && (
          <button
            className="secondary"
            aria-label="Close assistant"
            onClick={close}
          >
            ×
          </button>
        )}
      </div>
      <p>
        Ask about{" "}
        {staff
          ? "assigned lessons and students"
          : user
            ? "your lessons or the school"
            : "lessons, prices and school policies"}
        .
      </p>
      {(staff || admin) && (
        <label>
          Student for history
          <select value={student} onChange={(e) => setStudent(e.target.value)}>
            <option value="">Select a student</option>
            {assigned.map((s) => (
              <option value={s} key={s}>
                {person(state, s)}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="chips">
        {suggestions.map((q) => (
          <button
            className="secondary"
            key={q}
            disabled={busy}
            onClick={() => send(q)}
          >
            {q}
          </button>
        ))}
      </div>
      <div className="transcript" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i}>
            <p className="bubble question">{m.question}</p>
            <div className="bubble">
              <p>{m.answer}</p>
              {m.lines.length > 0 && (
                <ul>
                  {m.lines.map((line, j) => (
                    <li key={j}>{line}</li>
                  ))}
                </ul>
              )}
              <small>Retrieved {stamp(m.time)} Pacific</small>
              {m.action === "book" && onBook && (
                <button className="secondary" onClick={onBook}>
                  Review booking ↗
                </button>
              )}
              {m.action === "schedule" && onSchedule && (
                <button className="secondary" onClick={onSchedule}>
                  Open records ↗
                </button>
              )}
            </div>
          </div>
        ))}
        {busy && <p>Checking records…</p>}
        {failed && (
          <p role="status">
            {count >= 10 ? (
              failed
            ) : (
              <>
                Assistant unavailable.{" "}
                <button className="secondary" onClick={() => send(failed)}>
                  Retry
                </button>
              </>
            )}
          </p>
        )}
      </div>
      <form
        className="ask"
        onSubmit={(e) => {
          e.preventDefault()
          send(question)
        }}
      >
        <input
          aria-label="Question"
          maxLength={400}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question…"
        />
        <button className="primary" disabled={!question.trim() || busy}>
          Send ↑
        </button>
      </form>
    </section>
  )
}
