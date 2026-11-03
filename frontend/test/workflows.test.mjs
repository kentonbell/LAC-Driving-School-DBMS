import assert from "node:assert/strict"
import { test } from "node:test"
import { startAt } from "../src/catalog.ts"
import { balance, due, scoped } from "../src/domain.ts"

test("the workspace displays database totals even if not all lessons are in view", () => {
  const state = { lessons: [], paymentBalances: { 1: 380 } }
  const purchase = {
    id: "1",
    allowance: 6,
    used: 2,
    reserved: 1,
    remaining: 4,
    available: 3,
  }
  assert.deepEqual(balance(state, purchase), {
    used: 2,
    reserved: 1,
    remaining: 4,
    available: 3,
  })
  assert.equal(due(state, "1"), 380)
})

test("group lessons appear for both participants and only the assigned staff member", () => {
  const session = { id: "10", staff: "staff:1", students: ["1", "2"] }
  const state = { lessons: [session] }
  assert.deepEqual(scoped(state, { role: "student", id: "2" }), [session])
  assert.deepEqual(scoped(state, { role: "student", id: "3" }), [])
  assert.deepEqual(scoped(state, { role: "instructor", id: "staff:1" }), [
    session,
  ])
  assert.deepEqual(scoped(state, { role: "driver", id: "staff:2" }), [])
})

test("Pacific local times resolve correctly in both summer and winter", () => {
  assert.equal(
    new Date(startAt("2027-01-03", "10:00")).toISOString(),
    "2027-01-03T18:00:00.000Z"
  )
  assert.equal(
    new Date(startAt("2027-07-03", "10:00")).toISOString(),
    "2027-07-03T17:00:00.000Z"
  )
})
