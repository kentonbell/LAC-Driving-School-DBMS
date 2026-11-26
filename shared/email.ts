/** Conservative format checks, not a claim that an inbox exists. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
export function validEmail(value: string): boolean {
  if (value.length > 254 || /\s/.test(value)) return false;
  const parts = value.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  return (
    local.length > 0 &&
    local.length <= 64 &&
    /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local) &&
    !local.startsWith(".") &&
    !local.endsWith(".") &&
    !local.includes("..") &&
    domain.includes(".") &&
    domain
      .split(".")
      .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
  );
}
export function emailSuggestion(value: string): string | undefined {
  const email = normalizeEmail(value);
  const [local, domain] = email.split("@");
  if (!local || !domain) return;
  const typos: Record<string, string> = {
    "gmial.com": "gmail.com",
    "gamil.com": "gmail.com",
    gmailcom: "gmail.com",
    hotmailcom: "hotmail.com",
    outlookcom: "outlook.com",
    yahoocom: "yahoo.com",
  };
  const corrected =
    typos[domain] ?? domain.replace(/\.(con|cmo|comm)$/i, ".com");
  if (corrected !== domain) return `${local}@${corrected}`;
}
export function validPassword(value: string): boolean {
  return (
    value.length >= 12 &&
    new TextEncoder().encode(value).length <= 72 &&
    !value.includes("\0")
  );
}
