import { useState } from "react"
import { call } from "./api"
import {
  day,
  stamp,
  money,
  policies,
  type services as schoolServices,
} from "./catalog"
import { teaching, type Person, type State } from "./domain"

export type BookingPrefill = {
  staff: string
  service: string
  date: string
  time: string
}
type Reply = {
  message: string
  rows: Record<string, unknown>[]
  retrievedAt?: string
  operation?: string
}
export function WorkspaceChat({
  state,
  user,
  token,
  onBook,
  onSchedule,
}: {
  state: State
  user: Person
  token: string
  onBook: (prefill: BookingPrefill) => void
  onSchedule: () => void
}) {
  const student = user.role === "student"
  const [question, setQuestion] = useState("")
  const [date, setDate] = useState("")
  const [service, setService] = useState(state.catalog[0]?.id ?? "")
  const [selected, setSelected] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [reply, setReply] = useState<Reply>()
  async function send(value: string) {
    if (!value.trim() || busy) return
    setBusy(true)
    setError("")
    setReply(undefined)
    setQuestion(value)
    try {
      setReply(
        await call("chat", token, {
          question: value,
          student: selected,
          date,
          service,
        })
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <article className="card chat">
      <h3>
        {student
          ? "Lesson Assistant"
          : teaching(user)
            ? "Instructor Assistant"
            : "School Assistant"}
      </h3>
      <p>Ask about school information or records available to your account.</p>
      {student ? (
        <div className="actions">
          <label>
            Service{" "}
            <select
              value={service}
              onChange={(e) => setService(e.target.value)}
            >
              {state.catalog.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Availability date{" "}
            <input
              type="date"
              min={day()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        </div>
      ) : (
        <>
          <label>
            Schedule date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            Student for history{" "}
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Choose a student</option>
              {state.people
                .filter((p) => p.role === "student")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
        </>
      )}
      <div className="actions">
        {(student
          ? ["My next lesson", "My package balance", "Find availability"]
          : [
              "My teaching schedule",
              "This week’s lesson summary",
              "Selected student’s history",
            ]
        ).map((q) => (
          <button
            key={q}
            type="button"
            disabled={busy}
            onClick={() => void send(q)}
          >
            {q}
          </button>
        ))}
      </div>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          void send(question)
        }}
      >
        <label>
          Question{" "}
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            required
            maxLength={400}
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? "Looking up records…" : error ? "Retry" : "Ask"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {reply && (
        <div role="status">
          <p>{reply.message}</p>
          {reply.retrievedAt && (
            <small>
              Retrieved {stamp(Date.parse(reply.retrievedAt))} Pacific
            </small>
          )}
          {reply.rows.map((row, i) => (
            <dl className="card" key={i}>
              {Object.entries(row)
                .filter(([key, value]) => !key.endsWith("_id") && value != null)
                .map(([key, value]) => (
                  <div className="line" key={key}>
                    <dt>{key.replaceAll("_", " ")}</dt>
                    <dd>
                      {key.endsWith("_at")
                        ? stamp(Date.parse(String(value))) + " Pacific"
                        : String(value)}
                    </dd>
                  </div>
                ))}
              {reply.operation === "find_available_slots" && (
                <button
                  onClick={() => {
                    const start = Date.parse(String(row.start_at))
                    const time = new Intl.DateTimeFormat("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hourCycle: "h23",
                      timeZone: "America/Vancouver",
                    }).format(start)
                    onBook({
                      staff: "staff:" + row.instructor_id,
                      service: String(row.service_id),
                      date: day(start),
                      time,
                    })
                  }}
                >
                  Review booking
                </button>
              )}
            </dl>
          ))}
          {reply.rows.length > 0 &&
            reply.operation !== "find_available_slots" && (
              <button onClick={onSchedule}>Open records</button>
            )}
        </div>
      )}
    </article>
  )
}

export function PublicAssistant({
  services,
}: {
  services: typeof schoolServices
}) {
  const [mode, setMode] = useState("")
  return (
    <article className="card chat">
      <h3>School Assistant</h3>
      <p>
        Find school information or <a href="/login">sign in</a> for help with
        your records.
      </p>
      <div className="actions">
        {["Services and prices", "Hours", "Policies"].map((topic) => (
          <button
            key={topic}
            aria-pressed={mode === topic}
            onClick={() => setMode(topic)}
          >
            {topic}
          </button>
        ))}
      </div>
      <div role="status">
        {mode === "Hours" && (
          <p>Monday–Friday 9 AM–6 PM · Saturday–Sunday 10 AM–5 PM Pacific.</p>
        )}
        {mode === "Services and prices" &&
          services.map((s) => (
            <p key={s.id}>
              {s.name} · {s.minutes} min · {money(s.price)}
            </p>
          ))}
        {mode === "Policies" &&
          policies.map(([name, body]) => (
            <details key={name}>
              <summary>{name}</summary>
              <p>{body}</p>
            </details>
          ))}
      </div>
    </article>
  )
}
