export function Sparkles() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    >
      <path d="m10 3 2.2 5.8L18 11l-5.8 2.2L10 19l-2.2-5.8L2 11l5.8-2.2L10 3Z" />
      <path d="M19 2v6m-3-3h6m-3 10v6m-3-3h6" />
    </svg>
  )
}

export function AssistantButton({
  onClick,
  expanded,
}: {
  onClick: () => void
  expanded?: boolean
}) {
  return (
    <button
      type="button"
      className="primary"
      onClick={onClick}
      aria-expanded={expanded}
    >
      AI Assistant <Sparkles />
    </button>
  )
}

export function MapDirections({ address }: { address: string }) {
  const destination = encodeURIComponent(address)
  return (
    <div className="actions event-directions" aria-label="Pickup directions">
      <a
        className="button secondary"
        href={"https://maps.apple.com/?daddr=" + destination}
        target="_blank"
        rel="noreferrer"
      >
        Apple Maps ↗
      </a>
      <a
        className="button secondary"
        href={
          "https://www.google.com/maps/dir/?api=1&destination=" + destination
        }
        target="_blank"
        rel="noreferrer"
      >
        Google Maps ↗
      </a>
    </div>
  )
}
