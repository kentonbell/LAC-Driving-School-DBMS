import { useState } from "react"

export type MenuGroup = { title: string; items: string[] }

const labels: Record<string, string> = {
  Dashboard: "Overview",
  "Book a Session": "Book a lesson",
  "My Progress": "Lesson progress",
  "Student Feedback": "Lesson feedback",
  "Practice-Test Scores": "Test scores",
  "Approval Requests": "Requests to review",
  Chatbot: "Lesson assistant",
}

export function WorkspaceMenu({
  groups,
  active,
  onSelect,
  unread = 0,
}: {
  groups: MenuGroup[]
  active: string
  onSelect: (item: string) => void
  unread?: number
}) {
  const [open, setOpen] = useState(false)

  return (
    <aside className="workspace-menu">
      <button
        type="button"
        className="workspace-toggle"
        aria-expanded={open}
        aria-controls="workspace-navigation"
        onClick={() => setOpen(!open)}
      >
        <span>
          <small>Workspace menu</small>
          {labels[active] ?? active}
        </span>
        <span aria-hidden="true">{open ? "−" : "＋"}</span>
      </button>
      <div
        id="workspace-navigation"
        className={open ? "workspace-links is-open" : "workspace-links"}
      >
        <div role="navigation" aria-label="Workspace">
          {groups.map(({ title, items }) => (
            <div className="workspace-group" key={title}>
              <p>{title}</p>
              {items.map((item) => (
                <button
                  type="button"
                  key={item}
                  aria-current={active === item ? "page" : undefined}
                  onClick={() => {
                    onSelect(item)
                    setOpen(false)
                  }}
                >
                  {labels[item] ?? item}
                  {item === "Inbox" && unread > 0 && (
                    <span className="workspace-count">{unread}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}
