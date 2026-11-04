import type { Role } from "./domain"
export const apiOrigin = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, "") as
  string | undefined
export type LiveUser = { name: string; role: Role; id?: string }
export async function call<T>(
  path: string,
  token: string,
  body?: object
): Promise<T> {
  const response = await fetch(apiOrigin + "/api/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => {
    throw Error("Unable to reach the school portal. Check the connection and try again.")
  })
  const data = await response.json()
  if (!response.ok)
    throw Error(data.error ?? "Unable to reach the school portal.")
  return data
}
