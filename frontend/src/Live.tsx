import { AssistantButton, MapDirections, Sparkles } from "./WorkspaceActions"
import { MonthCalendar } from "./MonthCalendar"
import { WorkspaceMenu } from "./WorkspaceMenu"
import { useEffect, useState } from "react"
import { day, money, pickups, stamp } from "./catalog"
import type { Role } from "./domain"
export const apiOrigin = import.meta.env.VITE_API_URL?.replace(/\/$/, "") as
  string | undefined
export type LiveUser = { name: string; role: Role; id?: string }
type Row = Record<string, string | number | null>
type Dashboard = {
  lessons: Row[]
  purchases: Row[]
  services: Row[]
  students?: Row[]
}
type Reply = { message: string; rows: Row[]; retrievedAt?: string }
export async function call<T>(
  path: string,
  token: string,
  body?: object
): Promise<T> {
  const response = await fetch(apiOrigin + "/api/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + token,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await response.json()
  if (!response.ok)
    throw Error(data.error ?? "Unable to reach the school portal.")
  return data
}
const when = (date: Row[string]) => stamp(new Date(String(date)).getTime())
export function LiveSignIn({
  enter,
}: {
  enter: (token: string, user: LiveUser) => void
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("")
  return (
    <form
      className="card form"
      onSubmit={async (e) => {
        e.preventDefault()
        const token = String(new FormData(e.currentTarget).get("code")).trim()
        setBusy(true)
        setError("")
        try {
          enter(token, await call("me", token))
        } catch (e) {
          setError((e as Error).message)
        } finally {
          setBusy(false)
        }
      }}
    >
      <label>
        School access code
        <input
          autoComplete="current-password"
          type="password"
          name="code"
          required
          pattern="[a-f0-9]{64}"
        />
      </label>
      <button className="primary" disabled={busy}>
        {busy ? "Signing in…" : "Sign in ↗"}
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </form>
  )
}
export function Live({
  user,
  token,
  booking,
  bookingConfirmed,
}: {
  user: LiveUser
  token: string
  booking: boolean
  bookingConfirmed: () => void
}) {
  const [tab, setTab] = useState(
      booking && user.role === "student" ? "Book a Session" : "Dashboard"
    ),
    [data, setData] = useState<Dashboard>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [version, refresh] = useState(0)
  const [service, setService] = useState(""),
    [date, setDate] = useState(day),
    [times, setTimes] = useState<Row[]>(),
    [selected, setSelected] = useState<Row>(),
    [question, setQuestion] = useState(""),
    [answer, setAnswer] = useState<Reply>(),
    [selectedStudent, setSelectedStudent] = useState(""),
    [confirmation, setConfirmation] = useState("")
  const student = user.role === "student"
  const [month, setMonth] = useState(() => day().slice(0, 7))
  const [loadedMonth, setLoadedMonth] = useState("")
  const [calendarError, setCalendarError] = useState("")
  useEffect(() => {
    let active = true
    call<Dashboard>("dashboard?month=" + month, token)
      .then((d) => {
        if (active) {
          setData(d)
          setLoadedMonth(month)
        }
      })
      .catch((e) => {
        if (active) setCalendarError(e.message)
      })
    return () => {
      active = false
    }
  }, [token, version, month])
  async function run(work: () => Promise<void>) {
    setError("")
    setBusy(true)
    try {
      await work()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const search = "availability?" + new URLSearchParams({ service, date })
  const calendarEvents = (
    loadedMonth === month ? (data?.lessons ?? []) : []
  ).map((lesson) => ({
    id: String(lesson.lesson_id),
    start: Date.parse(String(lesson.start_at)),
    title: String(lesson.service_name),
    status: String(lesson.status),
    lesson,
  }))
  return (
    <section className="wrap section portal">
      <WorkspaceMenu
        groups={[
          {
            title: student ? "Your lessons" : "Schedule",
            items: ["Dashboard", ...(student ? ["Book a Session"] : [])],
          },
          { title: "Support", items: ["Assistant"] },
        ]}
        active={tab}
        onSelect={(item) => {
          setTab(item)
          setError("")
        }}
      />
      <div className="portal-content">
        <div className="eyebrow">L.A.C. WORKSPACE · PACIFIC TIME</div>
        <h2>{tab}</h2>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {tab === "Dashboard" && (
          <>
            {data ? (
              <>
                {student && (
                  <div className="stats">
                    {data.purchases.map((p) => (
                      <article className="card" key={p.purchase_id}>
                        <h3>{p.package_name}</h3>
                        <p>
                          {p.remaining_lessons} remaining · {p.reserved_lessons}{" "}
                          booked
                        </p>
                      </article>
                    ))}
                  </div>
                )}
                <MonthCalendar
                  events={calendarEvents}
                  month={month}
                  onMonthChange={(next) => {
                    if (next !== month) setCalendarError("")
                    setMonth(next)
                  }}
                  message={
                    calendarError ? (
                      <p role="alert">
                        {calendarError}{" "}
                        <button
                          className="secondary"
                          onClick={() => {
                            setCalendarError("")
                            refresh((v) => v + 1)
                          }}
                        >
                          Retry
                        </button>
                      </p>
                    ) : loadedMonth !== month ? (
                      <p role="status">Loading lessons…</p>
                    ) : undefined
                  }
                  renderEvent={({ lesson, id, start, title, status }) => (
                    <article className="agenda-event" key={id}>
                      <div>
                        <div className="eyebrow">
                          {status} · {stamp(start)} Pacific
                        </div>
                        <h3>{title}</h3>
                        <dl className="event-details">
                          <div>
                            <dt>Ends</dt>
                            <dd>{when(lesson.end_at)} Pacific</dd>
                          </div>
                          {!student && (
                            <div>
                              <dt>Student</dt>
                              <dd>{lesson.student_name}</dd>
                            </div>
                          )}
                          <div>
                            <dt>Instructor</dt>
                            <dd>{lesson.instructor_name}</dd>
                          </div>
                          <div>
                            <dt>Pickup</dt>
                            <dd>{lesson.pickup_address}</dd>
                          </div>
                        </dl>
                        {lesson.pickup_address && (
                          <MapDirections
                            address={String(lesson.pickup_address)}
                          />
                        )}
                      </div>
                    </article>
                  )}
                />
              </>
            ) : calendarError ? (
              <button
                className="secondary"
                onClick={() => {
                  setCalendarError("")
                  refresh((v) => v + 1)
                }}
              >
                Retry
              </button>
            ) : (
              <p>Loading your dashboard…</p>
            )}
          </>
        )}
        {tab === "Book a Session" && (
          <article className="card">
            {confirmation ? (
              <>
                <h3>Booking confirmed ✓</h3>
                <p>{confirmation}</p>
                <button
                  className="primary"
                  onClick={() => {
                    setConfirmation("")
                    setTab("Dashboard")
                  }}
                >
                  View dashboard ↗
                </button>
              </>
            ) : selected ? (
              <>
                <h3>Review booking</h3>
                <p>
                  {selected.staff} · {when(selected.start_at)} Pacific
                </p>
                <form
                  className="form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const f = new FormData(e.currentTarget)
                    void run(async () => {
                      const result = await call<Row>("bookings", token, {
                        service,
                        instructor: selected.instructor_id,
                        start: new Date(
                          String(selected.start_at)
                        ).toISOString(),
                        pickup: Number(f.get("pickup")),
                        purchase: f.get("purchase") || null,
                      })
                      setConfirmation(when(result.start_at) + " Pacific")
                      bookingConfirmed()
                      setSelected(undefined)
                      setTimes(undefined)
                      refresh((v) => v + 1)
                    })
                  }}
                >
                  <label>
                    Pick-up location
                    <select name="pickup">
                      {pickups.map((p, i) => (
                        <option value={i} key={p[1]}>
                          {p[1]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Package
                    <select name="purchase">
                      <option value="">Pay separately</option>
                      {data?.purchases
                        .filter(
                          (p) =>
                            p.service_id === service &&
                            Number(p.unallocated_lessons) > 0 &&
                            (!p.expiry_date ||
                              String(p.expiry_date).slice(0, 10) >= date)
                        )
                        .map((p) => (
                          <option
                            key={p.purchase_id}
                            value={String(p.purchase_id)}
                          >
                            {p.package_name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="check">
                    <input type="checkbox" required /> I agree to the{" "}
                    <a href="/hours#faq" target="_blank">
                      school policies
                    </a>
                    .
                  </label>
                  <button className="primary" disabled={busy}>
                    Confirm booking ↗
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setSelected(undefined)}
                  >
                    Back to times
                  </button>
                </form>
              </>
            ) : (
              <>
                <form
                  className="form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void run(async () => {
                      setTimes(undefined)
                      setTimes(await call(search, token))
                    })
                  }}
                >
                  <label>
                    Service
                    <select
                      required
                      value={service}
                      onChange={(e) => {
                        setService(e.target.value)
                        setTimes(undefined)
                      }}
                    >
                      <option value="">Choose a service</option>
                      {data?.services.map((s) => (
                        <option value={String(s.service_id)} key={s.service_id}>
                          {s.service_name} · {s.duration_minutes} min ·{" "}
                          {money(Number(s.base_price))}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Date
                    <input
                      type="date"
                      min={day()}
                      required
                      value={date}
                      onChange={(e) => {
                        setDate(e.target.value)
                        setTimes(undefined)
                      }}
                    />
                  </label>
                  <button className="primary" disabled={busy}>
                    Find times ↗
                  </button>
                </form>
                {times &&
                  (times.length ? (
                    <div className="chips">
                      {times.map((t) => (
                        <button
                          className="secondary"
                          key={String(t.instructor_id) + t.start_at}
                          onClick={() => setSelected(t)}
                        >
                          {when(t.start_at)} · {t.staff}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p>No times available on this date.</p>
                  ))}
              </>
            )}
          </article>
        )}
        {tab === "Assistant" && (
          <article className="card chat">
            <h3 className="assistant-title">
              AI Assistant <Sparkles />
            </h3>
            <p>
              Ask about your schedule,{" "}
              {student ? "package balance, availability, " : ""}or school
              services.
            </p>
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault()
                void run(async () =>
                  setAnswer(
                    await call("chat", token, {
                      question,
                      student: selectedStudent,
                      date,
                      service,
                    })
                  )
                )
              }}
            >
              <label>
                Question
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  required
                  maxLength={400}
                />
              </label>
              {student ? (
                <>
                  <label>
                    Availability service
                    <select
                      value={service}
                      onChange={(e) => setService(e.target.value)}
                    >
                      <option value="">Choose a service</option>
                      {data?.services.map((s) => (
                        <option key={s.service_id} value={String(s.service_id)}>
                          {s.service_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Availability date
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </label>
                </>
              ) : (
                <label>
                  Student for history
                  <select
                    value={selectedStudent}
                    onChange={(e) => setSelectedStudent(e.target.value)}
                  >
                    <option value="">Choose an assigned student</option>
                    {data?.students?.map((s) => (
                      <option key={s.student_id} value={String(s.student_id)}>
                        {s.student_name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button className="primary" disabled={busy}>
                {busy ? "Checking records…" : error ? "Retry ↗" : "Ask ↗"}
              </button>
            </form>
            {answer && (
              <div className="bubble" aria-live="polite">
                <p>{answer.message}</p>
                {answer.rows.map((r, i) => (
                  <div className="line" key={i}>
                    {Object.entries(r)
                      .filter(([k, v]) => !k.endsWith("_id") && v !== null)
                      .map(([k, v]) =>
                        k.endsWith("_at")
                          ? when(v)
                          : k.replaceAll("_", " ") + ": " + v
                      )
                      .join(" · ")}
                    {student && r.instructor_id && r.start_at && (
                      <button
                        className="secondary"
                        onClick={() => {
                          setSelected(r)
                          setTab("Book a Session")
                        }}
                      >
                        Review booking ↗
                      </button>
                    )}
                  </div>
                ))}
                {answer.retrievedAt && (
                  <small>
                    Retrieved {stamp(Date.parse(answer.retrievedAt))} Pacific
                  </small>
                )}
              </div>
            )}
          </article>
        )}
        <div className="floating-chat">
          <AssistantButton
            onClick={() => {
              setError("")
              setTab("Assistant")
              window.scrollTo(0, 0)
            }}
          />
        </div>
      </div>
    </section>
  )
}
