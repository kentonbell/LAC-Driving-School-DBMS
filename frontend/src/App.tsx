import { AssistantButton } from "./WorkspaceActions"
import { useEffect, useState, type MouseEvent } from "react"
import { services, pickups, policies, money } from "./catalog"
import { type Role, type State, seed, demoPeople } from "./domain"
import { Portal, Chat } from "./Portal"
import { Live, LiveSignIn, apiOrigin, type LiveUser } from "./Live"
import "./site.css"

const pages = [
  ["home", "Home"],
  ["lessons", "Lessons & Pricing"],
  ["hours", "Hours & FAQ"],
  ["locations", "Pick-up Locations"],
]
const routes = [
  ...pages.map(([key]) => key),
  "book",
  "portal",
  "login",
  "policies",
]
const legacyRoute = () =>
  location.pathname === "/" && routes.includes(location.hash.slice(1))
    ? location.hash.slice(1)
    : ""
const route = () => {
  const page =
    legacyRoute() || location.pathname.slice(1).replace(/\/$/, "") || "home"
  return page === "policies" ? "hours" : page
}
const pathFor = (page: string) => (page === "home" ? "/" : "/" + page)
const storage = "lac-demo-v1"
function load(): State {
  try {
    return JSON.parse(localStorage.getItem(storage) || "null") ?? seed()
  } catch {
    return seed()
  }
}
export default function App() {
  const [page, setPage] = useState(route),
    [menu, setMenu] = useState(false),
    [state, setState] = useState(load),
    [actor, setActor] = useState(
      () => sessionStorage.getItem("lac-role") ?? ""
    ),
    [chat, setChat] = useState(false),
    [category, setCategory] = useState("Lessons"),
    [service, setService] = useState("lesson")
  const [demoRevision, setDemoRevision] = useState(0)
  const [mapProvider, setMapProvider] = useState("google")
  const [live, setLive] = useState<{ token: string; user: LiveUser }>()
  const user = state.people.find((p) => p.id === actor && p.active)
  useEffect(() => {
    const legacy = legacyRoute()
    if (legacy === "policies" || /^\/policies\/?$/.test(location.pathname)) {
      history.replaceState(null, "", "/hours#faq")
    } else if (legacy) {
      history.replaceState(null, "", pathFor(legacy))
    }
    if (location.hash === "#faq")
      document.getElementById("faq")?.scrollIntoView()
    const change = () => {
      setPage(route())
      setMenu(false)
      setCategory("Lessons")
      if (!location.hash) window.scrollTo({ top: 0, behavior: "instant" })
    }
    const sync = (event: StorageEvent) => {
      if (event.key === storage) setState(load())
    }
    addEventListener("popstate", change)
    addEventListener("storage", sync)
    return () => {
      removeEventListener("popstate", change)
      removeEventListener("storage", sync)
    }
  }, [])
  function navigate(path: string) {
    if (location.pathname + location.hash !== path)
      history.pushState(null, "", path)
    setPage(route())
    setMenu(false)
    setCategory("Lessons")
    window.scrollTo({ top: 0, behavior: "instant" })
  }
  function followLink(event: MouseEvent<HTMLDivElement>) {
    if (
      event.defaultPrevented ||
      event.button ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return
    const link = (event.target as Element).closest<HTMLAnchorElement>("a[href]")
    const path = link?.getAttribute("href")
    if (
      !path?.startsWith("/") ||
      path.startsWith("//") ||
      link?.target ||
      link?.hasAttribute("download")
    )
      return
    event.preventDefault()
    navigate(path)
  }
  function save(fn: (s: State) => State) {
    const next = fn(load())
    localStorage.setItem(storage, JSON.stringify(next))
    setState(next)
  }
  function enter(role: Role) {
    setLive(undefined)
    const p = demoPeople.find((x) => x.role === role)!
    if (!localStorage.getItem(storage))
      localStorage.setItem(storage, JSON.stringify(state))
    sessionStorage.setItem("lac-role", p.id)
    setActor(p.id)
    navigate(page === "book" ? "/book" : "/portal")
  }
  function book(id = "lesson") {
    setService(id)
    navigate("/book")
  }
  const logo = (
    <>
      <img src="/brand/lac.jpg" alt="" />
      <span>
        L.A.C. <small>DRIVING SCHOOL</small>
      </span>
    </>
  )
  const portal = page === "portal" || page === "book"
  const workspaceUser = portal ? (live?.user ?? user) : undefined
  function logout() {
    setLive(undefined)
    sessionStorage.removeItem("lac-role")
    setActor("")
    navigate("/login")
  }

  return (
    <div className="site-shell" onClick={followLink}>
      <a
        className="skip"
        href="#main"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById("main")?.focus()
        }}
      >
        Skip to content
      </a>
      <header>
        <div
          className={
            workspaceUser ? "wrap header workspace-header" : "wrap header"
          }
        >
          <a className="brand" href="/" aria-label="L.A.C. Driving School home">
            {logo}
          </a>
          {workspaceUser ? (
            <div className="workspace-identity">
              <span className="workspace-avatar" aria-hidden="true">
                {workspaceUser.name.trim().charAt(0).toUpperCase()}
              </span>
              <span className="workspace-account">
                <strong>{workspaceUser.name}</strong>
                <small>
                  {workspaceUser.role} workspace{live ? "" : " · Demo"}
                </small>
              </span>
              <button type="button" className="secondary" onClick={logout}>
                Logout
              </button>
            </div>
          ) : (
            <>
              {" "}
              <button
                className="menu secondary"
                onClick={() => setMenu(!menu)}
                aria-expanded={menu}
              >
                Menu ☰
              </button>
              <nav className={menu ? "open" : ""} aria-label="Main navigation">
                {pages.map(([key, label]) => (
                  <a
                    key={key}
                    href={pathFor(key)}
                    aria-current={page === key ? "page" : undefined}
                  >
                    {label}
                  </a>
                ))}
                <a href={user || live ? "/portal" : "/login"}>
                  {user || live ? "Dashboard" : "Sign in"}
                </a>
                <a href="/book" className="button primary">
                  Book a lesson <span>↗</span>
                </a>
              </nav>
            </>
          )}
        </div>
      </header>
      <main id="main" tabIndex={-1} key={page}>
        {page === "home" && (
          <>
            <section className="hero">
              <div className="wrap hero-grid">
                <div className="hero-copy">
                  <div className="eyebrow">
                    <i /> LANGLEY, BC · SERVING METRO VANCOUVER
                  </div>
                  <h1>
                    Drive with
                    <br />
                    <em>confidence.</em>
                  </h1>
                  <p>
                    From your first time behind the wheel to road test day,
                    build real driving skills with patient, one-on-one
                    instruction.
                  </p>
                  <div className="actions">
                    <a href="/book" className="button primary">
                      Book your lesson <span>↗</span>
                    </a>
                    <a href="/lessons" className="button secondary">
                      Explore lessons <span>↓</span>
                    </a>
                  </div>
                  <div className="hero-note">
                    ✓ Certified instruction <span>·</span> ✓ 7 convenient
                    pick-up points
                  </div>
                </div>
                <div className="hero-visual">
                  <div className="art-caption">
                    <span>THE ROAD STARTS HERE</span>
                  </div>
                  <img
                    src="/brand/lac.jpg"
                    alt="Vintage L.A.C. Driving School poster featuring a white training car"
                  />
                </div>
              </div>
            </section>
          </>
        )}
        {(page === "home" || page === "lessons") && (
          <section className="wrap section">
            <div className="section-head">
              <div>
                <div className="eyebrow">
                  <i /> FIND YOUR FIT
                </div>
                <h2>Lessons for every turn.</h2>
                <p>
                  Start with an assessment, sharpen your skills, or get ready
                  for test day.
                </p>
              </div>
              {page === "home" && (
                <a className="button secondary" href="/lessons">
                  See all pricing ↗
                </a>
              )}
            </div>
            {page === "lessons" && (
              <div className="tabs">
                {["All", "Lessons", "Road tests", "Packages", "Extras"].map(
                  (x) => (
                    <button
                      aria-pressed={x === category}
                      className={x === category ? "primary" : "secondary"}
                      key={x}
                      onClick={() => setCategory(x)}
                    >
                      {x}
                    </button>
                  )
                )}
              </div>
            )}
            <div className="cards">
              {(page === "home"
                ? services.filter((_, i) => [0, 1, 3].includes(i))
                : state.catalog.filter((s) =>
                    category === "All"
                      ? true
                      : category === "Lessons"
                        ? !/^(test|rental|pretrip)/.test(s.id)
                        : category === "Road tests"
                          ? s.id.startsWith("test")
                          : category === "Extras"
                            ? ["rental", "pretrip"].includes(s.id)
                            : false
                  )
              ).map((s) => (
                <article className="card lesson-card" key={s.id}>
                  <div className="eyebrow">
                    {page === "lessons" && s.tag + " · "}
                    {s.minutes} MIN
                  </div>
                  <h3>
                    {page === "home" && s.id === "class4"
                      ? "Commercial driving lesson"
                      : s.name}
                  </h3>
                  <p>
                    {page === "home" && s.id === "class4"
                      ? "Prepare to drive professionally, including practice with a pre-trip inspection."
                      : s.description}
                  </p>
                  <div className="card-bottom">
                    <strong>{money(s.price)}</strong>
                    <button className="secondary" onClick={() => book(s.id)}>
                      Book ↗
                    </button>
                  </div>
                </article>
              ))}
              {page === "lessons" &&
                ["All", "Packages"].includes(category) &&
                state.offers.map((p) => (
                  <article className="card" key={p.id}>
                    <div className="eyebrow">SAVE {money(p.savings)}</div>
                    <h3>{p.lessons} lessons</h3>
                    <p>{p.lessons * 1.5} hours · 90 minutes per lesson</p>
                    <strong>{money(p.price)}</strong>
                    <p>
                      Contact the school to buy a package. Staff can record your
                      purchase in the portal.
                    </p>
                  </article>
                ))}
            </div>
            {page === "lessons" && ["All", "Extras"].includes(category) && (
              <p>One additional observer may join for $20.</p>
            )}
          </section>
        )}
        {(page === "home" || page === "locations") && (
          <section className="location-section">
            <div className="wrap section">
              <div className="section-head">
                <div>
                  <div className="eyebrow">
                    <i /> MEET US THERE
                  </div>
                  <h2>Pick up where it suits you.</h2>
                  <p>
                    Lessons start at designated locations across five cities.
                  </p>
                </div>
                {page === "home" && (
                  <a className="button secondary" href="/locations">
                    All pick-up points ↗
                  </a>
                )}
              </div>
              <div className="location-grid">
                <img src="/brand/map.jpg" alt="A model car on a road map" />
                <div>
                  <div className="map-preference">
                    <h3>Get directions</h3>
                    {page === "locations" && (
                      <div
                        className="map-picker"
                        role="radiogroup"
                        aria-label="Directions app"
                        data-provider={mapProvider}
                      >
                        {(["google", "apple"] as const).map((provider) => (
                          <label key={provider}>
                            <input
                              type="radio"
                              name="map-provider"
                              value={provider}
                              checked={mapProvider === provider}
                              onChange={() => setMapProvider(provider)}
                            />
                            <span>
                              {provider === "google"
                                ? "Google Maps"
                                : "Apple Maps"}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  <div
                    className={page === "home" ? "pickup-preview" : undefined}
                    role="region"
                    aria-label="Pick-up points"
                    tabIndex={page === "home" ? 0 : undefined}
                  >
                    {pickups.map(([city, name, address]) => (
                      <a
                        className="location-row"
                        key={name}
                        href={
                          (mapProvider === "apple"
                            ? "https://maps.apple.com/?daddr="
                            : "https://www.google.com/maps/dir/?api=1&destination=") +
                          encodeURIComponent(address)
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        <div>
                          <small>{city}</small>
                          <strong>{name}</strong>
                          <span>{address}</span>
                        </div>
                        <b aria-hidden="true">↗</b>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
        {page === "hours" && (
          <section className="wrap section narrow">
            <div className="eyebrow">
              <i /> WHEN WE DRIVE
            </div>
            <h2>Hours &amp; FAQ</h2>
            <a className="faq-jump" href="#faq">
              Jump to FAQ ↓
            </a>
            <h3>School hours</h3>
            <p>
              All times are Pacific. Available appointments depend on the
              instructor’s schedule.
            </p>
            <div className="card">
              {[
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
                "Sunday",
              ].map((d, i) => (
                <div className="line" key={d}>
                  <b>{d}</b>
                  <span>
                    {i < 5 ? "9:00 AM – 6:00 PM" : "10:00 AM – 5:00 PM"}
                  </span>
                </div>
              ))}
            </div>
            <section id="faq" className="hours-faq" aria-labelledby="faq-title">
              <h3 id="faq-title">Frequently asked questions</h3>
              <p>What to bring, when to pay and how to change your lesson.</p>
              {policies.map(([title, copy]) => (
                <details className="card" key={title}>
                  <summary>{title}</summary>
                  <p>{copy}</p>
                </details>
              ))}
            </section>
          </section>
        )}
        {(page === "login" || (portal && !user && !live)) && (
          <section className="wrap section narrow">
            <div className="eyebrow">
              <i /> L.A.C. PORTAL
            </div>
            <h2>
              {page === "book" ? "Book a driving lesson." : "Welcome back."}
            </h2>
            {apiOrigin && (
              <LiveSignIn
                enter={(token, user) => {
                  setLive({ token, user })
                  navigate(page === "book" ? "/book" : "/portal")
                }}
              />
            )}
            <p>
              Explore a sample account with fictional records. This preview does
              not make real appointments or collect payment.
            </p>
            <div className="cards role-cards">
              {(["student", "driver", "instructor", "admin"] as const).map(
                (role) => (
                  <button
                    className="card secondary"
                    key={role}
                    onClick={() => enter(role)}
                  >
                    {role} demo <span>↗</span>
                  </button>
                )
              )}
            </div>
          </section>
        )}
        {portal && live && (
          <Live
            key={page}
            token={live.token}
            user={live.user}
            booking={page === "book"}
          />
        )}
        {portal && !live && user && (
          <Portal
            key={user.id + page + demoRevision}
            state={state}
            user={user}
            save={save}
            resetDemo={() => {
              if (
                !window.confirm(
                  "Replace this browser’s demo bookings and changes with fresh sample data?"
                )
              )
                return
              for (const person of state.people)
                localStorage.removeItem("lac-inbox-" + person.id)
              save(() => seed())
              setDemoRevision((revision) => revision + 1)
            }}
            initial={page === "book" ? "Book a Session" : "Dashboard"}
            service={service}
          />
        )}
      </main>
      <footer>
        <div className="wrap footer">
          <a className="brand" href="/">
            {logo}
          </a>
          <div>
            7157 210 St, Langley, BC V2Y 0T3
            <br />
            <small>© {new Date().getFullYear()} L.A.C. Driving School</small>
          </div>
          <div className="footer-links">
            {pages.map(([key, label]) => (
              <a key={key} href={pathFor(key)}>
                {label}
              </a>
            ))}
          </div>
        </div>
      </footer>
      {!portal && (
        <div className="floating-chat">
          {chat && <Chat state={state} close={() => setChat(false)} />}
          <AssistantButton onClick={() => setChat(!chat)} expanded={chat} />
        </div>
      )}
    </div>
  )
}
