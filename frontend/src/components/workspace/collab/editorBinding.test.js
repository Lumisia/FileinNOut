import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diffBlocks } from './reconcile.js'
import { applyOpsToEditor } from './editorBinding.js'

const b = (id, text) => ({ id, type: 'paragraph', data: { text } })

// EditorJS blocks API 의 최소 fake (내부 배열을 실제로 변형).
function makeFakeBlocks(initial) {
  const arr = initial.map((x) => ({ ...x }))
  return {
    _arr: arr,
    getBlockIndex: (id) => arr.findIndex((x) => x.id === id),
    getBlocksCount: () => arr.length,
    delete: (i) => arr.splice(i, 1),
    insert: (type, data, _cfg, index, _focus, _replace, id) =>
      arr.splice(index, 0, { id, type, data }),
    update: (id, data) => {
      const x = arr.find((e) => e.id === id)
      if (x) x.data = data
      return Promise.resolve()
    },
    move: (to, from) => {
      const [m] = arr.splice(from, 1)
      arr.splice(to, 0, m)
    },
  }
}

async function reach(editorBlocks, target) {
  const cur = editorBlocks._arr.map((x) => ({ ...x }))
  const ops = diffBlocks(cur, target)
  await applyOpsToEditor(editorBlocks, ops)
  return editorBlocks._arr
}

test('applyOpsToEditor: update 반영', async () => {
  const fb = makeFakeBlocks([b('a', '0'), b('x', 'X')])
  const res = await reach(fb, [b('a', '1'), b('x', 'X')])
  assert.deepEqual(res, [b('a', '1'), b('x', 'X')])
})

test('applyOpsToEditor: insert/delete/move 복합', async () => {
  const cases = [
    [[b('a', '1')], [b('a', '1'), b('c', 'N')]],
    [[b('a', '1'), b('c', 'y')], [b('a', '1')]],
    [[b('a', '1'), b('b', '2')], [b('b', '2'), b('a', '1')]],
    [[b('a', '1'), b('b', '2')], [b('a', '1x'), b('c', '3'), b('b', '2')]],
    [[b('a', '1'), b('b', '2'), b('c', '3')], [b('c', '3'), b('a', '1')]],
  ]
  for (const [start, target] of cases) {
    const fb = makeFakeBlocks(start)
    const res = await reach(fb, target)
    assert.deepEqual(res, target, `${JSON.stringify(start)} -> ${JSON.stringify(target)}`)
  }
})
