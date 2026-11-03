import { Tabs } from "@base-ui/react/tabs"
import { useState, type ReactNode } from "react"
import { day, zone } from "./catalog"

const monthLabel = new Intl.DateTimeFormat("en-CA", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})
const dateLabel = new Intl.DateTimeFormat("en-CA", {
  dateStyle: "full",
  timeZone: "UTC",
})
const timeLabel = new Intl.DateTimeFormat("en-CA", {
  timeStyle: "short",
  timeZone: zone,
})

type CalendarEvent = {
  id: string
  start: number
  title: string
  status: string
}

export function MonthCalendar<T extends CalendarEvent>({
  events,
  renderEvent,
  month,
  onMonthChange,
  message,
}: {
  events: T[]
  renderEvent: (event: T) => ReactNode
  month?: string
  onMonthChange?: (month: string) => void
  message?: ReactNode
}) {
  const today = day()
  const [selection, setSelection] = useState({
    month: today.slice(0, 7),
    date: today,
  })
  const [eventId, setEventId] = useState("")
  const visibleMonth = month ?? selection.month
  const first = new Date(visibleMonth + "-01T00:00:00Z")
  const year = first.getUTCFullYear()
  const index = first.getUTCMonth()
  const count = new Date(Date.UTC(year, index + 1, 0)).getUTCDate()
  const byDay = new Map<string, T[]>()
  for (const event of [...events].sort((a, b) => a.start - b.start)) {
    const date = day(event.start)
    const entries = byDay.get(date) ?? []
    entries.push(event)
    byDay.set(date, entries)
  }
  function select(date: string) {
    setEventId("")
    setSelection({ month: date.slice(0, 7), date })
    onMonthChange?.(date.slice(0, 7))
  }
  function move(offset: number) {
    const next = new Date(Date.UTC(year, index + offset, 1))
      .toISOString()
      .slice(0, 10)
    setEventId("")
    onMonthChange?.(next.slice(0, 7))
    setSelection({
      month: next.slice(0, 7),
      date: next.startsWith(today.slice(0, 7)) ? today : "",
    })
  }
  const selected =
    (selection.month === visibleMonth && selection.date) ||
    [...byDay.keys()].find((date) => date.startsWith(visibleMonth)) ||
    visibleMonth + "-01"
  const selectedEvents = byDay.get(selected) ?? []
  const activeEvent =
    selectedEvents.find((event) => event.id === eventId) ?? selectedEvents[0]
  return (
    <section className="card month-calendar" aria-label="Lesson calendar">
      <div className="month-toolbar">
        <div>
          <p className="eyebrow">Lesson schedule · Pacific time</p>
          <h3 aria-live="polite">{monthLabel.format(first)}</h3>
        </div>
        <div className="month-controls">
          <button
            className="secondary"
            aria-label="Previous month"
            onClick={() => move(-1)}
          >
            ‹
          </button>
          <button className="secondary" onClick={() => select(today)}>
            Today
          </button>
          <button
            className="secondary"
            aria-label="Next month"
            onClick={() => move(1)}
          >
            ›
          </button>
        </div>
      </div>
      <div className="month-grid">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((name) => (
          <span className="month-weekday" key={name}>
            {name}
          </span>
        ))}
        {Array.from({ length: first.getUTCDay() }, (_, i) => (
          <span className="month-padding" key={i} aria-hidden="true" />
        ))}
        {Array.from({ length: count }, (_, i) => {
          const date = visibleMonth + "-" + String(i + 1).padStart(2, "0")
          const entries = byDay.get(date) ?? []
          return (
            <button
              className="month-date"
              key={date}
              aria-label={
                dateLabel.format(new Date(date)) +
                (entries.length
                  ? `, ${entries.length} ${entries.length === 1 ? "lesson" : "lessons"}`
                  : "")
              }
              aria-current={date === today ? "date" : undefined}
              aria-pressed={date === selected}
              onClick={() => select(date)}
            >
              <span className="month-number">{i + 1}</span>
              {entries.slice(0, 2).map((event) => (
                <span
                  key={event.id}
                  className="month-event"
                  data-status={event.status}
                  title={event.title}
                >
                  {timeLabel.format(event.start)} · {event.title}
                </span>
              ))}
              {entries.length > 2 && (
                <span className="month-more">+{entries.length - 2} more</span>
              )}
              {entries.length > 0 && (
                <span className="month-count" aria-hidden="true">
                  {entries.length}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div className="month-agenda">
        <div className="agenda-heading">
          <p className="eyebrow">Daily agenda</p>
          <h4 aria-live="polite">{dateLabel.format(new Date(selected))}</h4>
          {!message && (
            <p>
              {selectedEvents.length}{" "}
              {selectedEvents.length === 1 ? "lesson" : "lessons"}
            </p>
          )}
        </div>
        {message ??
          (activeEvent ? (
            <Tabs.Root
              value={activeEvent.id}
              onValueChange={(id) => setEventId(String(id))}
            >
              <Tabs.List
                className="agenda-tabs"
                aria-label="Lessons on the selected day"
              >
                {selectedEvents.map((event) => (
                  <Tabs.Tab
                    key={event.id}
                    value={event.id}
                    className="agenda-tab"
                  >
                    <span>{timeLabel.format(event.start)}</span>
                    {event.title}
                  </Tabs.Tab>
                ))}
              </Tabs.List>
              {selectedEvents.map((event) => (
                <Tabs.Panel
                  key={event.id}
                  value={event.id}
                  className="agenda-panel"
                >
                  {event.id === activeEvent.id && renderEvent(event)}
                </Tabs.Panel>
              ))}
            </Tabs.Root>
          ) : (
            <p>No lessons on this day. Choose another date on the calendar.</p>
          ))}
      </div>
    </section>
  )
}
