import { useEffect, useRef } from "react"
import {
  AddSquareIcon,
  Cancel01Icon,
  Share03Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

type InstallStep = {
  title: string
  detail: string
  icon?: typeof Share03Icon
}

const iosSteps: InstallStep[] = [
  {
    icon: Share03Icon,
    title: "Open Safari’s Share menu.",
    detail:
      "Tap Share in the three-dot menu, or tap the Share icon directly if it’s visible in the toolbar.",
  },
  {
    icon: AddSquareIcon,
    title: "Tap Add to Home Screen.",
    detail:
      "Scroll down in the Share menu. If the option is missing, look for it under Edit Actions at the bottom.",
  },
  {
    icon: Tick02Icon,
    title: "Tap Add.",
    detail:
      "Make sure Open as Web App is turned on if Safari shows that option.",
  },
]

const androidSteps: InstallStep[] = [
  {
    title: "Tap the three-dot menu in the top-right corner.",
    detail:
      "If you opened the site from a link inside another app, open it in Chrome first.",
  },
  {
    title:
      "Tap Install and create shortcut, Install app, or Add to Home screen.",
    detail:
      "The wording depends on your browser and device. If Chrome offers both Install and Create shortcut, choose Install.",
  },
  {
    title: "Tap Install or Add to confirm.",
    detail: "Follow any remaining prompts from your browser.",
  },
]

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
  const android = platform === "android"
  const steps = android ? androidSteps : iosSteps
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  return (
    <dialog
      ref={dialog}
      className="install-help"
      aria-labelledby="install-title"
      aria-describedby="install-intro"
      onClose={close}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close()
      }}
    >
      <div>
        <form method="dialog">
          <button
            className="install-help-close"
            aria-label="Close install instructions"
            autoFocus
          >
            <HugeiconsIcon icon={Cancel01Icon} size={20} aria-hidden="true" />
          </button>
        </form>
        <span className="install-help-icon" aria-hidden="true">
          <HugeiconsIcon icon={AddSquareIcon} size={26} />
        </span>
        <p className="eyebrow">
          {android ? "Android web app" : "iPhone & iPad web app"}
        </p>
        <h2 id="install-title">Add L.A.C. to your Home Screen!</h2>
        <p id="install-intro">
          {android
            ? "Android requires this final step from your browser. It only takes a few taps."
            : "Apple requires this final step from Safari. It only takes a few taps."}
        </p>
        <ol className="install-help-steps" role="list">
          {steps.map((step, index) => (
            <li key={step.title}>
              <span className="install-help-icon" aria-hidden="true">
                {step.icon ? (
                  <HugeiconsIcon icon={step.icon} size={20} />
                ) : (
                  index + 1
                )}
              </span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="install-help-finish">
          <img src="/brand/icon-192.png" alt="" width="32" height="32" />
          <span>
            Tap the L.A.C. icon on your Home Screen to get back to your lessons.
          </span>
        </p>
      </div>
    </dialog>
  )
}
