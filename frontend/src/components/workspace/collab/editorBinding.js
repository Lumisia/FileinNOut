// EditorJS ↔ Yjs 블록 단위 바인딩 (Phase 1.5).
// 단일 키 blob 대신 Y.Array<Y.Map> 모델. 서로 다른 블록의 동시 편집은 유실 없이 병합된다.
//
// baseline: 블록 id -> 마지막으로 Y 와 합의된 data 의 JSON.
//   - "로컬 dirty" = editor.data !== baseline  (아직 Y 에 못 보낸 로컬 편집)
//   - pushLocal 은 로컬 dirty 블록만 Y 로 보낸다(stale 필드로 원격 변경을 되돌리지 않음).
//   - applyRemote 는 로컬 dirty 블록을 건너뛴다(미-push 로컬 편집을 원격이 덮지 않음).
//   같은 블록 동시 편집은 블록 단위 LWW(Phase 2 에서 블록당 Y.Text 로 개선).

import * as Y from 'yjs'
import { diffBlocks } from './reconcile.js'
import { yArrayToBlocks, applyOpsToYArray, reconcileYArray } from './yblocks.js'

export const LOCAL_ORIGIN = Symbol('local-block-edit')

const dataKey = (block) => JSON.stringify(block.data)

// ops 를 EditorJS Blocks API 로 적용 (순수 변환 — fake 로 테스트됨).
export async function applyOpsToEditor(blocksApi, ops) {
  for (const op of ops) {
    if (op.type === 'remove') {
      const idx = blocksApi.getBlockIndex(op.id)
      if (idx >= 0) blocksApi.delete(idx)
    } else if (op.type === 'insert') {
      blocksApi.insert(op.block.type, op.block.data, {}, op.index, false, false, op.block.id)
    } else if (op.type === 'update') {
      await blocksApi.update(op.block.id, op.block.data)
    } else if (op.type === 'move') {
      const from = blocksApi.getBlockIndex(op.id)
      if (from >= 0) blocksApi.move(op.toIndex, from)
    }
  }
}

export function createBlockBinding({ editor, ydoc, getSavedBlocks }) {
  const yBlocks = ydoc.getArray('blocks')
  const baseline = new Map() // id -> dataKey(Y 와 합의된 값)
  let applyingRemote = false
  let disposed = false

  const setBaseline = (blocks) => {
    baseline.clear()
    for (const b of blocks) baseline.set(b.id, dataKey(b))
  }

  // 로컬 editor → Y : 로컬에서 실제로 바뀐 것만 보냄.
  async function pushLocal() {
    if (applyingRemote || disposed) return
    const editorBlocks = await getSavedBlocks()
    const ops = diffBlocks(yArrayToBlocks(yBlocks), editorBlocks)

    const filtered = ops.filter((op) => {
      if (op.type === 'update') return baseline.get(op.id) !== dataKey(op.block) // 로컬 편집만
      if (op.type === 'remove') return baseline.has(op.id) // 알던 블록의 로컬 삭제만
      if (op.type === 'insert') return !baseline.has(op.block.id) // 새 로컬 블록만
      return true // move
    })

    if (filtered.length > 0) {
      const doc = yBlocks.doc
      if (doc) doc.transact(() => applyOpsToYArray(Y, yBlocks, filtered), LOCAL_ORIGIN)
      else applyOpsToYArray(Y, yBlocks, filtered)
    }
    setBaseline(editorBlocks)
  }

  // Y → 로컬 editor : 로컬 dirty 블록은 건너뜀(미-push 편집 보호).
  async function applyRemote() {
    if (disposed) return
    const target = yArrayToBlocks(yBlocks)
    const current = await getSavedBlocks()
    const curById = new Map(current.map((b) => [b.id, b]))
    const ops = diffBlocks(current, target)

    const filtered = ops.filter((op) => {
      if (op.type === 'update' || op.type === 'remove') {
        const cur = curById.get(op.id)
        const locallyDirty = cur && baseline.get(op.id) !== dataKey(cur)
        return !locallyDirty
      }
      return true
    })

    if (filtered.length === 0) return

    applyingRemote = true
    try {
      await applyOpsToEditor(editor.blocks, filtered)
    } finally {
      applyingRemote = false
    }

    for (const op of filtered) {
      if (op.type === 'insert' || op.type === 'update') baseline.set(op.block.id, dataKey(op.block))
      else if (op.type === 'remove') baseline.delete(op.id)
    }
  }

  const observer = (_events, transaction) => {
    if (transaction.origin === LOCAL_ORIGIN) return
    void applyRemote()
  }
  yBlocks.observeDeep(observer)

  async function seed(initialBlocks) {
    if (yBlocks.length === 0 && Array.isArray(initialBlocks) && initialBlocks.length) {
      const ops = diffBlocks([], initialBlocks)
      const doc = yBlocks.doc
      if (doc) doc.transact(() => applyOpsToYArray(Y, yBlocks, ops), LOCAL_ORIGIN)
      else applyOpsToYArray(Y, yBlocks, ops)
      setBaseline(initialBlocks)
    } else if (yBlocks.length > 0) {
      await applyRemote()
    }
  }

  async function replaceAll(nextBlocks = []) {
    const normalizedBlocks = Array.isArray(nextBlocks) ? nextBlocks : []
    applyingRemote = true
    try {
      await editor.render({ blocks: normalizedBlocks })
      reconcileYArray(Y, yBlocks, normalizedBlocks, LOCAL_ORIGIN)
      setBaseline(normalizedBlocks)
    } finally {
      applyingRemote = false
    }
  }

  const isApplyingRemote = () => applyingRemote
  function dispose() {
    disposed = true
    yBlocks.unobserveDeep(observer)
  }

  return { pushLocal, applyRemote, seed, replaceAll, dispose, isApplyingRemote, yBlocks }
}
