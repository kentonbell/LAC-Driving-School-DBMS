export const services = [
  {
    id: "assessment",
    name: "Assessment session",
    tag: "CLASS 5 / 7",
    minutes: 60,
    price: 70,
    description:
      "Start with a skills check and a clear plan for your next drive.",
  },
  {
    id: "lesson",
    name: "In-car driving lesson",
    tag: "CLASS 5 / 7",
    minutes: 90,
    price: 100,
    description: "Build confidence with one-on-one coaching at your pace.",
  },
  {
    id: "extended",
    name: "Extended driving lesson",
    tag: "CLASS 5 / 7",
    minutes: 120,
    price: 130,
    description: "Spend more time practising the routes and skills you need.",
  },
  {
    id: "class4",
    name: "Restricted licence lesson",
    tag: "CLASS 4",
    minutes: 90,
    price: 150,
    description:
      "Prepare for your Class 4 Restricted licence. Includes pre-trip inspection.",
  },
  {
    id: "test150",
    name: "Road test package",
    tag: "CLASS 5 / 7",
    minutes: 150,
    price: 200,
    description: "Includes a one-hour warm-up before your road test.",
  },
  {
    id: "test120",
    name: "Road test package",
    tag: "CLASS 5 / 7",
    minutes: 120,
    price: 180,
    description: "Includes a one-hour warm-up before your road test.",
  },
  {
    id: "test180",
    name: "Restricted road test package",
    tag: "CLASS 4",
    minutes: 180,
    price: 250,
    description: "Includes a one-hour warm-up before your road test.",
  },
  {
    id: "rental",
    name: "Road test vehicle rental",
    tag: "CLASS 5 / 7",
    minutes: 60,
    price: 100,
    description: "Use the school vehicle for your road test.",
  },
  {
    id: "pretrip",
    name: "Pre-trip practice",
    tag: "CLASS 4",
    minutes: 30,
    price: 50,
    description: "Practise the vehicle inspection on its own.",
  },
]
export const packages = [390, 580, 770, 960, 1150].map((price, i) => ({
  id: "pack" + i,
  lessons: 4 + 2 * i,
  price,
  savings: 10 + 10 * i,
}))
export const pickups = [
  [
    "Langley",
    "Willowbrook Mall (ICBC)",
    "19950 Willowbrook Drive, Langley Township, BC",
  ],
  ["Surrey", "Guildford Mall", "10355 152 Street, Surrey, BC"],
  ["Surrey", "Surrey Central Station", "10321 City Parkway, Surrey, BC"],
  [
    "Burnaby",
    "Home Depot near Gilmore Station",
    "3950 Henning Drive, Burnaby, BC",
  ],
  [
    "Burnaby",
    "Patterson SkyTrain Station",
    "4101 Beresford Street, Burnaby, BC",
  ],
  ["Vancouver", "Joyce SkyTrain Station", "5099 Joyce Street, Vancouver, BC"],
  ["Coquitlam", "Lincoln SkyTrain Station", "1140 Pinetree Way, Coquitlam, BC"],
]
export const policies = [
  [
    "Licence requirements",
    "Bring a valid British Columbia driver’s licence to every in-car lesson.",
  ],
  [
    "Lesson duration and late arrival",
    "Regular in-car lessons are at least 90 minutes and include at least 80 minutes of driving. If your instructor is late, you receive your full time or the missed time is added to a future lesson. A student’s late arrival does not extend the lesson.",
  ],
  [
    "Passengers and observers",
    "Lessons are primarily one-on-one. One observer may join for $20, with a maximum of three people in the car including the instructor.",
  ],
  [
    "Payment and refunds",
    "Pay in full before the lesson. Instalments and package upgrades are unavailable. Purchases are final, non-refundable and non-transferable.",
  ],
  [
    "Package validity",
    "Use your package lessons within 12 months of payment. Unused lessons do not qualify for a refund or replacement.",
  ],
  [
    "Cancellation and rescheduling",
    "Give at least 48 hours’ notice. A $30 fee applies when rescheduling without sufficient notice. A no-show without notice forfeits the lesson.",
  ],
  [
    "Road test outcomes",
    "The school does not guarantee a passing road test or the issue of a driver’s licence.",
  ],
]
export const money = (value: number) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value)
export const zone = "America/Vancouver"
export const day = (value = Date.now()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value)
export const stamp = (value: number) =>
  new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: zone,
  }).format(value)
export function startAt(date: string, time: string) {
  const utc = Date.parse(date + "T" + time + ":00Z")
  const offset = (x: number) =>
    Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        timeZoneName: "shortOffset",
      })
        .formatToParts(x)
        .find((p) => p.type === "timeZoneName")
        ?.value.slice(3) ?? -8
    )
  return utc - offset(utc - offset(utc) * 3600000) * 3600000
}
