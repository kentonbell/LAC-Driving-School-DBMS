import { day, startAt, services, pickups, packages } from "./catalog.ts"
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
  catalog: typeof services
  offers: typeof packages
  unavailable: { staff: string; date: string }[]
}
export const id = () => crypto.randomUUID()
export const hour = 3600000
export const demoPeople: Person[] = [
  ["student", "Alex Chen"],
  ["student", "Jamie Singh"],
  ["driver", "Morgan Lee"],
  ["instructor", "Taylor Park"],
  ["admin", "Jordan Wong"],
  ["student", "Priya Patel"],
  ["student", "Noah Martin"],
  ["student", "Sofia Nguyen"],
  ["student", "Ethan Brooks"],
  ["student", "Maya Thompson"],
  ["instructor", "Avery Kim"],
  ["driver", "Sam Rivera"],
  ["instructor", "Nina Flores"],
  ["instructor", "Owen Scott"],
].map(([role, name], i) => ({
  id: String(i + 1),
  role: role as Role,
  name,
  email: name.split(" ")[0].toLowerCase() + "@example.test",
  phone: "",
  active: true,
  joined: Date.now() - i * 86400000,
}))
export function seed(): State {
  const now = Date.now()
  const today = day(now)
  const dateAtOffset = (offset: number) =>
    new Date(Date.parse(today) + offset * 86400000).toISOString().slice(0, 10)
  const start = startAt(dateAtOffset(1), "13:00")
  const past = startAt(dateAtOffset(-2), "11:00")
  const [year, month] = today.split("-").map(Number)
  const lessons: Lesson[] = []
  const sampleStudents = ["1", "2", "6", "7", "8", "9", "10"]
  const sampleStaff = ["3", "4", "11", "12"]
  const sampleServices = [
    "lesson",
    "assessment",
    "extended",
    "test120",
    "pretrip",
  ]
  for (const offset of [-1, 0, 1]) {
    const monthDate = new Date(Date.UTC(year, month - 1 + offset, 1))
      .toISOString()
      .slice(0, 7)
    const blockedDates = [day(start), day(past)]
    const busyDate = [8, 9, 10]
      .map((n) => monthDate + "-" + String(n).padStart(2, "0"))
      .find((date) => !blockedDates.includes(date))!
    const dates = [2, 4, 6, 12, 14, 16, 18, 20, 22, 24, 26, 28].map(
      (n) => monthDate + "-" + String(n).padStart(2, "0")
    )
    for (const [i, date] of [
      ...dates,
      busyDate,
      busyDate,
      busyDate,
    ].entries()) {
      const busy = i >= dates.length
      const service = sampleServices[(i + offset + 1) % sampleServices.length]
      const session = services.find((entry) => entry.id === service)!
      const time = busy
        ? ["10:00", "12:30", "15:00"][i - dates.length]
        : ["10:00", "12:30", "15:00"][i % 3]
      const begins = startAt(date, time)
      if (date === day(start) || date === day(past)) continue
      const end = begins + session.minutes * 60000
      const status =
        i === 5
          ? "cancelled"
          : end > now
            ? "scheduled"
            : i === 7
              ? "no-show"
              : "completed"
      lessons.push({
        id: "sample-" + monthDate + "-" + i,
        students: [
          busy ? "1" : sampleStudents[(i + offset + 1) % sampleStudents.length],
        ],
        staff: busy
          ? offset === 1
            ? "4"
            : "3"
          : sampleStaff[(i + offset + 1) % sampleStaff.length],
        service,
        start: begins,
        end,
        pickup: i % pickups.length,
        status,
        price: session.price,
      })
    }
  }
  for (let dateNumber = 1; dateNumber <= 30; dateNumber++) {
    const date = "2026-11-" + String(dateNumber).padStart(2, "0")
    const weekday = new Date(date).getUTCDay()
    if (weekday === 0 || weekday === 6) continue

    const bookedStudents = new Set(
      lessons
        .filter((lesson) => day(lesson.start) === date)
        .flatMap((lesson) => lesson.students)
    )
    if (date === day(start) || date === day(past)) bookedStudents.add("1")
    const availableStudents = sampleStudents.filter(
      (student) => !bookedStudents.has(student)
    )
    for (const [slot, time] of ["10:00", "14:30"].entries()) {
      const session = services.find(
        (entry) =>
          entry.id ===
          sampleServices[(dateNumber + slot) % sampleServices.length]
      )!
      const begins = startAt(date, time)
      const end = begins + session.minutes * 60000
      lessons.push({
        id: "november-2026-" + dateNumber + "-" + slot,
        students: [
          availableStudents[(dateNumber + slot) % availableStudents.length],
        ],
        staff: (dateNumber + slot) % 2 === 0 ? "13" : "14",
        service: session.id,
        start: begins,
        end,
        pickup: (dateNumber + slot) % pickups.length,
        status: end > now ? "scheduled" : "completed",
        price: session.price,
      })
    }
  }
  const extraPurchases = ["2", "6", "7"].map((student, i) => ({
    id: "sample-package-" + student,
    student,
    name: packages[i].lessons + "-lesson package",
    allowance: packages[i].lessons,
    price: packages[i].price,
    service: "lesson",
    created: Date.now() - 65 * 86400000,
    expiry: day(Date.now() + 300 * 86400000),
  }))
  for (const purchase of extraPurchases) {
    lessons
      .filter(
        (lesson) =>
          lesson.service === "lesson" &&
          lesson.students.includes(purchase.student)
      )
      .slice(0, 2)
      .forEach((lesson) => {
        lesson.purchase = purchase.id
      })
  }
  const dayOff = Array.from({ length: 14 }, (_, i) => dateAtOffset(i + 2)).find(
    (date) =>
      !lessons.some(
        (lesson) => lesson.staff === "3" && day(lesson.start) === date
      )
  )!
  return {
    people: demoPeople,
    catalog: services,
    offers: packages,
    unavailable: [],
    payments: extraPurchases.map((purchase, i) => ({
      id: "sample-payment-" + purchase.student,
      student: purchase.student,
      amount: i === 1 ? purchase.price / 2 : purchase.price,
      note: i === 1 ? "Package deposit" : "Package payment",
      date: purchase.created,
    })),
    requests: [
      {
        id: "sample-request-1",
        by: "3",
        type: "schedule",
        reason: dayOff + " · Family appointment",
        status: "pending",
      },
      {
        id: "sample-request-2",
        by: "1",
        type: "special",
        reason: "Could I arrange a lesson outside regular school hours?",
        status: "declined",
        decision: "Please choose an available daytime slot.",
      },
    ],
    records: lessons
      .filter(
        (lesson) => lesson.status === "completed" || lesson.status === "no-show"
      )
      .map((lesson, i) => ({
        lesson: lesson.id,
        student: lesson.students[0],
        attendance: lesson.status === "no-show" ? "Absent" : "Present",
        topics: [
          "Lane changes and mirror checks",
          "Parallel parking",
          "Intersection turns",
        ][i % 3],
        strengths: "Consistent speed and smooth braking.",
        improve: "Check blind spots earlier before changing lanes.",
        focus: "Practise shoulder checks on quieter streets.",
        score: lesson.status === "completed" ? String(74 + (i % 19)) : "",
        visible: i % 3 !== 0,
        privateNote: "Review the previous practice route at the next session.",
      })),
    purchases: [
      {
        id: "pack-demo",
        student: "1",
        name: "6-lesson package",
        allowance: 6,
        price: 580,
        service: "lesson",
        created: Date.now() - 7 * 86400000,
        expiry: day(Date.now() + 350 * 86400000),
      },
      ...extraPurchases,
    ],
    lessons: [
      {
        id: "demo-next",
        students: ["1"],
        staff: "3",
        service: "lesson",
        start,
        end: start + 1.5 * hour,
        pickup: 0,
        status: "scheduled",
        purchase: "pack-demo",
      },
      {
        id: "demo-past",
        students: ["1"],
        staff: "4",
        service: "lesson",
        start: past,
        end: past + 1.5 * hour,
        pickup: 1,
        status: "completed",
        purchase: "pack-demo",
      },
      ...lessons,
    ],
  }
}
export const person = (s: State, id: string) =>
  s.people.find((p) => p.id === id)?.name ?? "Unknown"
export const serviceName = (s: State, id: string) =>
  s.catalog.find((p) => p.id === id)?.name ?? "Lesson"
export const balance = (s: State, p: Purchase) => {
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
export function createLesson(
  s: State,
  b: Booking,
  replaces?: string,
  exception = false
): Lesson {
  const svc = s.catalog.find((x) => x.id === b.service)
  const students = [...new Set([b.student, ...(b.group ?? [])])]
  const staff = s.people.find(
    (x) => x.id === b.staff && x.active && teaching(x)
  )
  if (
    !svc ||
    !staff ||
    !students.every((id) =>
      s.people.some((x) => x.id === id && x.role === "student" && x.active)
    )
  )
    throw Error("Choose an active student, staff member and service.")
  if (students.length > 1 && b.observer)
    throw Error("Observers are only available for individual lessons.")
  if (!pickups[b.pickup] || !Number.isFinite(b.start) || b.start <= Date.now())
    throw Error("Choose a future time and designated pickup point.")
  const end = b.start + svc.minutes * 60000,
    date = day(b.start)
  const weekend = [0, 6].includes(new Date(date + "T12:00:00Z").getUTCDay())
  if (
    !exception &&
    (b.start < startAt(date, weekend ? "10:00" : "09:00") ||
      end > startAt(date, weekend ? "17:00" : "18:00"))
  )
    throw Error("This lesson does not fit within school hours.")
  if (s.unavailable.some((u) => u.staff === b.staff && u.date === date))
    throw Error("This staff member is unavailable on that date.")
  if (
    s.lessons.some(
      (l) =>
        l.id !== replaces &&
        l.status !== "cancelled" &&
        l.start < end &&
        l.end > b.start &&
        (l.staff === b.staff || l.students.some((x) => students.includes(x)))
    )
  )
    throw Error("This time overlaps another lesson. Choose a different slot.")
  if (b.purchase) {
    const p = s.purchases.find(
      (x) =>
        x.id === b.purchase &&
        x.student === b.student &&
        x.service === b.service
    )
    if (
      !p ||
      students.length > 1 ||
      p.expiry < date ||
      balance({ ...s, lessons: s.lessons.filter((l) => l.id !== replaces) }, p)
        .available < 1
    )
      throw Error("That package cannot cover this session.")
  }
  return {
    id: replaces ?? id(),
    students,
    staff: b.staff,
    service: b.service,
    start: b.start,
    end,
    pickup: b.pickup,
    purchase: b.purchase || undefined,
    status: "scheduled",
    observer: b.observer,
    note: b.note,
    price:
      replaces &&
      s.lessons.find((l) => l.id === replaces)?.service === b.service
        ? (s.lessons.find((l) => l.id === replaces)?.price ?? svc.price)
        : svc.price,
  }
}
export function slots(s: State, b: Booking, date: string) {
  if (!date) return []
  return ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00"].filter(
    (time) => {
      try {
        createLesson(s, { ...b, start: startAt(date, time) })
        return true
      } catch {
        return false
      }
    }
  )
}
