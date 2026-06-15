import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as Y from 'yjs'
import { reconcileYArray, yArrayToBlocks } from './yblocks.js'

const b = (id, text) => ({ id, type: 'paragraph', data: { text } })
const textMap = (blocks) => Object.fromEntries(blocks.map((bl) => [bl.id, bl.data.text]))

function fork(docA) {
  const docB = new Y.Doc()
  Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA))
  return docB
}
function sync(docA, docB) {
  Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB))
  Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA))
}

test('reconcile 후 Y.Array 가 블록 리스트를 반영', () => {
  const doc = new Y.Doc()
  const arr = doc.getArray('blocks')
  reconcileYArray(Y, arr, [b('a', 'A0'), b('x', 'X0')])
  assert.deepEqual(yArrayToBlocks(arr), [b('a', 'A0'), b('x', 'X0')])
})

test('다른 블록 동시 편집 → 둘 다 보존 (blob LWW 회귀 방지)', () => {
  const docA = new Y.Doc()
  const arrA = docA.getArray('blocks')
  reconcileYArray(Y, arrA, [b('a', 'A0'), b('x', 'X0')])

  const docB = fork(docA)
  const arrB = docB.getArray('blocks')

  // 동시 편집: A는 블록 a, B는 블록 x
  reconcileYArray(Y, arrA, [b('a', 'A1'), b('x', 'X0')])
  reconcileYArray(Y, arrB, [b('a', 'A0'), b('x', 'X1')])

  sync(docA, docB)

  const blocksA = yArrayToBlocks(arrA)
  assert.deepEqual(blocksA, yArrayToBlocks(arrB), '두 문서가 수렴해야 함')
  const t = textMap(blocksA)
  assert.equal(t.a, 'A1', 'A의 편집 보존')
  assert.equal(t.x, 'X1', 'B의 편집 보존 (유실 없음)')
})

test('동시 블록 추가 → 둘 다 보존', () => {
  const docA = new Y.Doc()
  const arrA = docA.getArray('blocks')
  reconcileYArray(Y, arrA, [b('a', 'A0')])

  const docB = fork(docA)
  const arrB = docB.getArray('blocks')

  reconcileYArray(Y, arrA, [b('a', 'A0'), b('p', 'P')])
  reconcileYArray(Y, arrB, [b('a', 'A0'), b('q', 'Q')])

  sync(docA, docB)

  assert.deepEqual(yArrayToBlocks(arrA), yArrayToBlocks(arrB), '수렴')
  const ids = yArrayToBlocks(arrA).map((bl) => bl.id).sort()
  assert.deepEqual(ids, ['a', 'p', 'q'], '추가 블록 모두 보존')
})

test('같은 블록 동시 편집 → 수렴(블록 단위 LWW, Phase 1 경계)', () => {
  const docA = new Y.Doc()
  const arrA = docA.getArray('blocks')
  reconcileYArray(Y, arrA, [b('a', 'A0')])
  const docB = fork(docA)
  const arrB = docB.getArray('blocks')

  reconcileYArray(Y, arrA, [b('a', 'A_from_A')])
  reconcileYArray(Y, arrB, [b('a', 'A_from_B')])
  sync(docA, docB)

  const ra = yArrayToBlocks(arrA)
  assert.deepEqual(ra, yArrayToBlocks(arrB), '두 문서 수렴')
  assert.ok(['A_from_A', 'A_from_B'].includes(ra[0].data.text), '둘 중 하나로 수렴(깨지지 않음)')
})

test('블록 삭제 vs 편집 동시 → 수렴(크래시 없음)', () => {
  const docA = new Y.Doc()
  const arrA = docA.getArray('blocks')
  reconcileYArray(Y, arrA, [b('a', 'A0'), b('x', 'X0')])
  const docB = fork(docA)
  const arrB = docB.getArray('blocks')

  reconcileYArray(Y, arrA, [b('a', 'A0')]) // A: x 삭제
  reconcileYArray(Y, arrB, [b('a', 'A0'), b('x', 'X1')]) // B: x 편집
  sync(docA, docB)

  assert.deepEqual(yArrayToBlocks(arrA), yArrayToBlocks(arrB), '삭제/편집 동시여도 수렴')
})
