import { emailSuggestion, normalizeEmail, validEmail } from "../../shared/email"
import { useCallback, useEffect, useRef, useState } from "react"
import { Portal, type Save } from "./Portal"
import type { Person, State } from "./domain"
import { call, type LiveUser } from "./api"
export function LiveSignIn({
  enter,
}: {
  enter: (token: string, user: LiveUser) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [email, setEmail] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const suggestion = emailSuggestion(email)
  return (
    <form
      className="card form"
      noValidate
      onSubmit={async (event) => {
        event.preventDefault()
        if (busy) return
        const address = normalizeEmail(email)
        const password = String(
          new FormData(event.currentTarget).get("password") ?? ""
        )
        if (!validEmail(address)) {
          setError("Enter a valid email, such as name@example.com.")
          return
        }
        if (!password) {
          setError("Enter your password.")
          return
        }
        setBusy(true)
        setError("")
        try {
          const result = await call<{ token: string; user: LiveUser }>(
            "auth/login",
            "",
            { email: address, password }
          )
          enter(result.token, result.user)
        } catch (error) {
          setError((error as Error).message)
        } finally {
          setBusy(false)
        }
      }}
    >
      <label>
        Email
        <input
          type="email"
          name="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={254}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value)
            setError("")
          }}
          aria-describedby={suggestion ? "email-suggestion" : undefined}
        />
      </label>
      {suggestion && (
        <p id="email-suggestion" role="status">
          Did you mean{" "}
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setEmail(suggestion)
              setError("")
            }}
          >
            {suggestion}
          </button>
          ? You can also keep the address you entered.
        </p>
      )}
      <label>
        Password
        <input
          type={showPassword ? "text" : "password"}
          name="password"
          autoComplete="current-password"
          required
          maxLength={72}
        />
      </label>
      <button
        type="button"
        className="secondary"
        aria-pressed={showPassword}
        onClick={() => setShowPassword(!showPassword)}
      >
        {showPassword ? "Hide password" : "Show password"}
      </button>
      <button className="primary" disabled={busy}>
        {busy ? "Signing in…" : "Sign in ↗"}
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p>Need an account or a password reset? Contact the school.</p>
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
    if (op !== "set-login") {
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
