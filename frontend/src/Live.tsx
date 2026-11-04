import { useCallback, useEffect, useRef, useState } from "react"
import { Portal, type Save } from "./Portal"
import type { Person, State } from "./domain"
import { call, type LiveUser } from "./api"
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
        if (!/^[a-f0-9]{64}$/.test(token)) {
          setError("Enter the 64-character school access code printed in Terminal.")
          return
        }
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

type Workspace = { user: Person; state: State; demoEnabled: boolean }
export function Live({
  token,
  booking,
  service,
  bookingConfirmed,
}: {
  token: string
  user: LiveUser
  booking: boolean
  service: string
  bookingConfirmed: () => void
}) {
  const [data, setData] = useState<Workspace>()
  const [error, setError] = useState("")
  const [attempt, setAttempt] = useState(0)
  const loadVersion = useRef(0)
  useEffect(() => {
    let current = true
    async function refresh(initial = false) {
      const version = ++loadVersion.current
      try {
        const next = await call<Workspace>("workspace", token)
        if (current && version === loadVersion.current) setData(next)
      } catch (e) {
        if (initial && current && version === loadVersion.current)
          setError((e as Error).message)
      }
    }
    void refresh(true)
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh()
    }, 60_000)
    return () => {
      current = false
      window.clearInterval(timer)
    }
  }, [token, attempt])
  const save: Save = async (op, values) => {
    const result = await call<Awaited<ReturnType<Save>>>(
      "workspace/action",
      token,
      { op, data: values }
    )
    if (op !== "issue-code") {
      const version = ++loadVersion.current
      try {
        const next = await call<Workspace>("workspace", token)
        if (version === loadVersion.current) setData(next)
      } catch {
        if (version === loadVersion.current)
          setError(
            "The change was saved, but the dashboard could not refresh. Reload the records before continuing."
          )
      }
    }
    return result
  }
  const findSlots = useCallback(
    (params: URLSearchParams) =>
      call<string[]>("workspace/slots?" + params, token),
    [token]
  )
  if (error || !data)
    return (
      <section className="wrap section">
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button
              onClick={() => {
                setError("")
                setAttempt(attempt + 1)
              }}
            >
              Retry
            </button>
          </>
        ) : (
          <p role="status">Loading school records…</p>
        )}
      </section>
    )
  return (
    <Portal
      state={data.state}
      user={data.user}
      save={save}
      token={token}
      demoEnabled={data.demoEnabled}
      findSlots={findSlots}
      bookingConfirmed={bookingConfirmed}
      initial={
        booking
          ? data.user.role === "admin"
            ? "Bookings"
            : "Book a Session"
          : "Dashboard"
      }
      service={service}
    />
  )
}
