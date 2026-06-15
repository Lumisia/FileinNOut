// EditorJS 블록 배열을 키(id) 기준으로 diff 하여 최소 ops 산출.
// 순수 함수 — Yjs 의존 없음. ops 는 Y.Array / 일반 배열 양쪽에 동일 의미로 적용된다.
//
// 블록 형태: { id, type, data }
// op 형태:
//   { type: 'remove', id }
//   { type: 'update', id, block }
//   { type: 'insert', index, block }
//   { type: 'move',   id, toIndex }

function blockChanged(o, n) {
  return o.type !== n.type || JSON.stringify(o.data) !== JSON.stringify(n.data)
}

export function diffBlocks(oldList, newList) {
  const ops = []
  const oldById = new Map(oldList.map((b) => [b.id, b]))
  const newById = new Map(newList.map((b) => [b.id, b]))

  // 1) 삭제: old 에만 있는 id
  for (const o of oldList) {
    if (!newById.has(o.id)) ops.push({ type: 'remove', id: o.id })
  }

  // 2) 수정: 양쪽에 있고 내용이 바뀐 블록 (위치는 안 건드림)
  for (const n of newList) {
    const o = oldById.get(n.id)
    if (o && blockChanged(o, n)) ops.push({ type: 'update', id: n.id, block: n })
  }

  // 3) 구조: 삭제 후 생존 블록을 old 순서로 두고 target 순서로 정렬
  const current = oldList.filter((o) => newById.has(o.id)).map((o) => ({ id: o.id }))
  for (let i = 0; i < newList.length; i++) {
    const desired = newList[i].id
    if (i < current.length && current[i].id === desired) continue

    const fromIdx = current.findIndex((c) => c.id === desired)
    if (fromIdx === -1) {
      ops.push({ type: 'insert', index: i, block: newList[i] })
      current.splice(i, 0, { id: desired })
    } else {
      ops.push({ type: 'move', id: desired, toIndex: i })
      const [m] = current.splice(fromIdx, 1)
      current.splice(i, 0, m)
    }
  }

  return ops
}

// 일반 배열에 ops 를 순서대로 적용 (참조 구현 + 테스트용).
export function applyOps(list, ops) {
  const arr = list.slice()
  for (const op of ops) {
    if (op.type === 'remove') {
      const idx = arr.findIndex((b) => b.id === op.id)
      if (idx !== -1) arr.splice(idx, 1)
    } else if (op.type === 'update') {
      const idx = arr.findIndex((b) => b.id === op.id)
      if (idx !== -1) arr[idx] = op.block
    } else if (op.type === 'insert') {
      arr.splice(op.index, 0, op.block)
    } else if (op.type === 'move') {
      const idx = arr.findIndex((b) => b.id === op.id)
      if (idx !== -1) {
        const [m] = arr.splice(idx, 1)
        arr.splice(op.toIndex, 0, m)
      }
    }
  }
  return arr
}
