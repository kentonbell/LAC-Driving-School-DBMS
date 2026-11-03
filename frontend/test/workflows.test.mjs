import assert from 'node:assert/strict'
import {test} from 'node:test'
import {day,startAt} from '../src/catalog.ts'
import {balance,createLesson,seed,scoped,slots,hour} from '../src/domain.ts'

test('a package reserve remains part of the balance and a no-show consumes it',()=>{
  const s=seed(), p=s.purchases[0], l=s.lessons[0]
  assert.deepEqual(balance(s,p),{used:1,reserved:1,remaining:5,available:4})
  l.status='no-show'
  assert.deepEqual(balance(s,p),{used:2,reserved:0,remaining:4,available:4})
  l.status='cancelled'
  assert.deepEqual(balance(s,p),{used:1,reserved:0,remaining:5,available:5})
})
test('staff and student overlap are both rejected, including group participants',()=>{
  const s=seed(), start=s.lessons[0].start
  const b={student:'2',staff:'3',service:'lesson',start,pickup:0}
  assert.throws(()=>createLesson(s,b),/overlap/)
  assert.throws(()=>createLesson(s,{...b,student:'1',staff:'4'}),/overlap/)
  assert.throws(()=>createLesson(s,{...b,staff:'4',group:['1']}),/overlap/)
  assert.throws(()=>createLesson(s,{...b,staff:'4',purchase:'pack-demo'}),/package/)
  const l=createLesson(s,{...b,staff:'4'})
  assert.equal(l.end-l.start,1.5*hour)
  s.lessons.push(l)
  assert.throws(()=>createLesson(s,{...b,staff:'4'}),/overlap/)
  assert.ok(!slots(s,b,day(start)).includes('13:00'))
})
test('scoping confines student records and assigned staff records',()=>{
  const s=seed()
  for (const user of s.people) {
    const expected = s.lessons.filter((lesson) =>
      user.role === 'admin' || (user.role === 'student' ? lesson.students.includes(user.id) : lesson.staff === user.id))
    assert.deepEqual(scoped(s,user), expected)
  }
})
test('Pacific local times resolve correctly in both summer and winter',()=>{
  assert.equal(new Date(startAt('2027-01-03','10:00')).toISOString(),'2027-01-03T18:00:00.000Z')
  assert.equal(new Date(startAt('2027-07-03','10:00')).toISOString(),'2027-07-03T17:00:00.000Z')
})

test('demo calendar has busy dates in three months without booking conflicts',()=>{
  const s=seed()
  const dates=new Map()
  for (const lesson of s.lessons) {
    const date=day(lesson.start)
    dates.set(date,(dates.get(date) ?? 0)+1)
    if (lesson.status === 'cancelled') continue
    assert.ok(!s.lessons.some((other) =>
      other !== lesson && other.status !== 'cancelled' &&
      other.start < lesson.end && other.end > lesson.start &&
      (other.staff === lesson.staff || other.students.some((id) => lesson.students.includes(id)))))
  }
  const busyMonths=new Set([...dates].filter(([,count])=>count>=3).map(([date])=>date.slice(0,7)))
  assert.ok(busyMonths.size>=3)
  assert.ok(s.lessons.length>=45)
  const dayOff=s.requests.find((request)=>request.type==='schedule')
  assert.match(dayOff.reason,/^\d{4}-\d{2}-\d{2} · /)
  assert.ok(!s.lessons.some((lesson)=>lesson.staff===dayOff.by && day(lesson.start)===dayOff.reason.slice(0,10)))
})

test('November 2026 has lessons with both new instructors on every weekday', () => {
  const s = seed()
  const instructors = s.people.filter((person) =>
    person.role === 'instructor' && ['Nina Flores', 'Owen Scott'].includes(person.name))
  assert.equal(instructors.length, 2)
  for (let number = 1; number <= 30; number++) {
    const date = '2026-11-' + String(number).padStart(2, '0')
    const weekday = new Date(date).getUTCDay()
    if (weekday === 0 || weekday === 6) continue
    for (const instructor of instructors) {
      assert.ok(s.lessons.some((lesson) =>
        lesson.staff === instructor.id && day(lesson.start) === date && lesson.status !== 'cancelled'),
      instructor.name + ' on ' + date)
    }
  }
})
