import type { services, packages } from "./catalog.ts"
export type Role = "student" | "driver" | "instructor" | "admin"
export type Status = "scheduled" | "completed" | "cancelled" | "no-show"
export type Person = {
  id: string
  role: Role
  name: string
  email: string
  phone: string
  active: boolean
  joined: number
}
export type Lesson = {
  id: string
  students: string[]
  staff: string
  service: string
  start: number
  end: number
  pickup: number
  address?: string
  canChange?: boolean
  booked?: number
  status: Status
  purchase?: string
  note?: string
  observer?: boolean
  price?: number
}
export type Purchase = {
  id: string
  student: string
  name: string
  allowance: number
  used?: number
  reserved?: number
  remaining?: number
  available?: number
  price: number
  service: string
  created: number
  expiry: string
}
export type RecordNote = {
  lesson: string
  student: string
  attendance: string
  topics: string
  strengths: string
  improve: string
  focus: string
  score: string
  visible: boolean
  privateNote: string
}
export type Request = {
  id: string
  by: string
  type: "special" | "group" | "schedule" | "cancel" | "reschedule"
  lesson?: string
  reason: string
  booking?: Booking
  status: "pending" | "approved" | "declined"
  decision?: string
}
export type Booking = {
  student: string
  staff: string
  service: string
  start: number
  pickup: number
  purchase?: string
  observer?: boolean
  note?: string
  group?: string[]
}
export type State = {
  people: Person[]
  lessons: Lesson[]
  purchases: Purchase[]
  records: RecordNote[]
  requests: Request[]
  payments: {
    id: string
    student: string
    amount: number
    note: string
    date: number
  }[]
  catalog: ((typeof services)[number] & { publicKey?: string })[]
  offers: ((typeof packages)[number] & { service?: string; name?: string })[]
  paymentBalances?: Record<string, number>
  unavailable: { staff: string; date: string }[]
}
export const hour = 3600000
export const person = (s: State, id: string) =>
  s.people.find((p) => p.id === id)?.name ?? "Unknown"
export const serviceName = (s: State, id: string) =>
  s.catalog.find((p) => p.id === id)?.name ?? "Lesson"
export const balance = (s: State, p: Purchase) => {
  if (
    p.used != null &&
    p.reserved != null &&
    p.remaining != null &&
    p.available != null
  )
    return {
      used: p.used,
      reserved: p.reserved,
      remaining: p.remaining,
      available: p.available,
    }
  const used = s.lessons.filter(
    (l) => l.purchase === p.id && ["completed", "no-show"].includes(l.status)
  ).length
  const reserved = s.lessons.filter(
    (l) => l.purchase === p.id && l.status === "scheduled"
  ).length
  return {
    used,
    reserved,
    remaining: p.allowance - used,
    available: p.allowance - used - reserved,
  }
}
export const teaching = (p: Person) =>
  p.role === "driver" || p.role === "instructor"
export const scoped = (s: State, p: Person) =>
  s.lessons.filter(
    (l) =>
      p.role === "admin" ||
      (p.role === "student" ? l.students.includes(p.id) : l.staff === p.id)
  )
export const due = (s: State, student: string) =>
  s.paymentBalances?.[student] ??
  s.purchases
    .filter((p) => p.student === student)
    .reduce((a, p) => a + p.price, 0) +
    s.lessons
      .filter((l) => l.students.includes(student) && l.status !== "cancelled")
      .reduce(
        (a, l) =>
          a +
          (l.purchase
            ? 0
            : (l.price ??
              s.catalog.find((x) => x.id === l.service)?.price ??
              0)) +
          (l.observer ? 20 : 0),
        0
      ) -
    s.payments
      .filter((p) => p.student === student)
      .reduce((a, p) => a + p.amount, 0)
