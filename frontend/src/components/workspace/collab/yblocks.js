// Yjs 모델 어댑터: 블록 리스트 ↔ Y.Array<Y.Map>.
// 각 블록 = Y.Map { id, type, data }. data 는 Phase 1 에서 블록 단위 값(JSON)으로 저장.
// 핵심: 'update' 는 기존 Y.Map 을 set 으로 수정(삭제/재삽입 아님) → 서로 다른 블록의
// 동시 편집이 각각 다른 Y.Map 에 적용되어 CRDT 가 둘 다 병합한다(유실 없음).

import { diffBlocks } from './reconcile.js'

export function yMapToBlock(ymap) {
  return { id: ymap.get('id'), type: ymap.get('type'), data: ymap.get('data') }
}

export function yArrayToBlocks(yArray) {
  const out = []
  for (let i = 0; i < yArray.length; i++) out.push(yMapToBlock(yArray.get(i)))
  return out
}

function blockToYMap(Y, block) {
  const m = new Y.Map()
  m.set('id', block.id)
  m.set('type', block.type)
  m.set('data', block.data)
  return m
}

function indexOfId(yArray, id) {
  for (let i = 0; i < yArray.length; i++) {
    if (yArray.get(i).get('id') === id) return i
  }
  return -1
}

export function applyOpsToYArray(Y, yArray, ops) {
  for (const op of ops) {
    if (op.type === 'remove') {
      const i = indexOfId(yArray, op.id)
      if (i !== -1) yArray.delete(i, 1)
    } else if (op.type === 'insert') {
      yArray.insert(op.index, [blockToYMap(Y, op.block)])
    } else if (op.type === 'update') {
      const i = indexOfId(yArray, op.id)
      if (i !== -1) {
        const m = yArray.get(i)
        if (m.get('type') !== op.block.type) m.set('type', op.block.type)
        m.set('data', op.block.data)
      }
    } else if (op.type === 'move') {
      const i = indexOfId(yArray, op.id)
      if (i !== -1) {
        const blk = yMapToBlock(yArray.get(i))
        yArray.delete(i, 1)
        yArray.insert(op.toIndex, [blockToYMap(Y, blk)])
      }
    }
  }
}

// 현재 Y.Array 상태와 newBlocks 를 diff 하여 최소 변경만 트랜잭션으로 적용.
export function reconcileYArray(Y, yArray, newBlocks, origin) {
  const ops = diffBlocks(yArrayToBlocks(yArray), newBlocks)
  if (ops.length === 0) return ops

  const doc = yArray.doc
  if (doc) doc.transact(() => applyOpsToYArray(Y, yArray, ops), origin)
  else applyOpsToYArray(Y, yArray, ops)
  return ops
}
