import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diffBlocks, applyOps } from './reconcile.js'

// 블록 = { id, type, data }
const b = (id, text) => ({ id, type: 'paragraph', data: { text } })

test('동일 리스트는 ops 없음', () => {
  const list = [b('a', 'hi')]
  assert.deepEqual(diffBlocks(list, list), [])
})

test('한 블록 data 변경 → update op 하나', () => {
  const oldList = [b('a', 'hello')]
  const newList = [b('a', 'hello world')]
  assert.deepEqual(diffBlocks(oldList, newList), [
    { type: 'update', id: 'a', block: newList[0] },
  ])
})

test('블록 추가 → insert op', () => {
  const oldList = [b('a', 'x')]
  const newList = [b('a', 'x'), b('c', 'new')]
  assert.deepEqual(diffBlocks(oldList, newList), [
    { type: 'insert', index: 1, block: newList[1] },
  ])
})

test('블록 삭제 → remove op', () => {
  const oldList = [b('a', 'x'), b('c', 'y')]
  const newList = [b('a', 'x')]
  assert.deepEqual(diffBlocks(oldList, newList), [{ type: 'remove', id: 'c' }])
})

test('순서 변경 → move op (전체 재작성 아님)', () => {
  const oldList = [b('a', '1'), b('c', '2')]
  const newList = [b('c', '2'), b('a', '1')]
  const ops = diffBlocks(oldList, newList)
  // 전체 rebuild(remove 2 + insert 2)면 안 됨. move 위주.
  assert.ok(ops.length <= 1, `move 1개여야 함, got ${JSON.stringify(ops)}`)
})

// 속성: 어떤 old/new든 diff를 적용하면 new와 같아져야 한다.
const apply = (oldList, newList) => applyOps(oldList, diffBlocks(oldList, newList))

test('속성: 적용 결과는 항상 newList와 동일', () => {
  const cases = [
    [[], [b('a', '1')]],
    [[b('a', '1')], []],
    [[b('a', '1'), b('b', '2')], [b('b', '2'), b('a', '1')]],
    [[b('a', '1'), b('b', '2')], [b('a', '1x'), b('c', '3'), b('b', '2')]],
    [[b('a', '1'), b('b', '2'), b('c', '3')], [b('c', '3'), b('a', '1')]],
  ]
  for (const [oldList, newList] of cases) {
    assert.deepEqual(apply(oldList, newList), newList, `case ${JSON.stringify(oldList)} -> ${JSON.stringify(newList)}`)
  }
})
