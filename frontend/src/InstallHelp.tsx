import { useEffect, useRef } from "react"

export function installPlatform() {
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  const safari =
    /Version\/[\d.]+.*Safari\//.test(navigator.userAgent) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA/.test(navigator.userAgent)
  if (
    matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone
  )
    return
  if (/Android/i.test(navigator.userAgent)) return "android"
  if (ios && safari) return "ios"
}

export function InstallHelp({
  platform,
  close,
}: {
  platform: "ios" | "android"
  close: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  return (
    <dialog
      ref={dialog}
      className="install-help"
      aria-labelledby="install-title"
      onClose={close}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close()
      }}
    >
      <div>
        <img src="/brand/icon-192.png" alt="" width="56" height="56" />
        <h2 id="install-title">Add L.A.C. to your Home Screen</h2>
        <p>Open the app from your home screen to get back to your lessons.</p>
        {platform === "android" ? (
          <ol>
            <li>Tap the three-dot menu in your browser.</li>
            <li>
              Choose <strong>Install app</strong> or{" "}
              <strong>Add to Home screen</strong>.
            </li>
            <li>
              Tap <strong>Install</strong> or <strong>Add</strong> to confirm.
            </li>
          </ol>
        ) : (
          <ol>
            <li>
              Open Safari’s <strong>Share</strong> menu.
            </li>
            <li>
              Scroll down and tap <strong>Add to Home Screen</strong>.
            </li>
            <li>
              Keep <strong>Open as Web App</strong> on if shown, then tap{" "}
              <strong>Add</strong>.
            </li>
          </ol>
        )}
        <form method="dialog">
          <button className="secondary" autoFocus>
            Done
          </button>
        </form>
      </div>
    </dialog>
  )
}
