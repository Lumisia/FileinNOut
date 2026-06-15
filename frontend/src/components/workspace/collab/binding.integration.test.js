import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as Y from 'yjs'
import { createBlockBinding, LOCAL_ORIGIN } from './editorBinding.js'

const b = (id, text) => ({ id, type: 'paragraph', data: { text } })
const texts = (arr) => Object.fromEntries(arr.map((x) => [x.id, x.data.text]))

function makeFakeEditor(initial = []) {
  const arr = initial.map((x) => ({ ...x }))
  const blocks = {
    getBlockIndex: (id) => arr.findIndex((x) => x.id === id),
    getBlocksCount: () => arr.length,
    delete: (i) => arr.splice(i, 1),
    insert: (type, data, _c, index, _f, _r, id) => arr.splice(index, 0, { id, type, data }),
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
  return { blocks, _arr: arr, save: async () => ({ blocks: arr.map((x) => ({ ...x })) }) }
}

const tick = () => new Promise((r) => setTimeout(r, 0))
const exchange = (docA, docB) => {
  Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA), 'remote')
  Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB), 'remote')
}

test('통합: 각자 push 후 교환되는 동시 편집은 무손실 수렴', async () => {
  const docA = new Y.Doc()
  const docB = new Y.Doc()
  const edA = makeFakeEditor([b('a', 'A0'), b('x', 'X0')])
  const edB = makeFakeEditor()
  const bindA = createBlockBinding({ editor: edA, ydoc: docA, getSavedBlocks: () => edA.save().then((d) => d.blocks) })
  const bindB = createBlockBinding({ editor: edB, ydoc: docB, getSavedBlocks: () => edB.save().then((d) => d.blocks) })

  await bindA.seed([b('a', 'A0'), b('x', 'X0')])
  Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA), 'remote') // B 초기 수신
  await tick()
  assert.deepEqual(edB._arr, [b('a', 'A0'), b('x', 'X0')], 'B 초기 내용 수신')

  // 동시 편집 — 각자 로컬에 반영하고 자기 Y 에 push (교환 전)
  edA._arr[0].data = { text: 'A1' }
  await bindA.pushLocal()
  edB._arr[1].data = { text: 'X1' }
  await bindB.pushLocal()

  exchange(docA, docB)
  await tick()
  await tick()

  assert.equal(texts(edA._arr).a, 'A1', 'A 편집 보존')
  assert.equal(texts(edA._arr).x, 'X1', 'B 편집 반영(무손실)')
  assert.equal(texts(edB._arr).a, 'A1', 'A 편집 반영')
  assert.equal(texts(edB._arr).x, 'X1', 'B 편집 보존')
  assert.deepEqual(edA._arr, edB._arr, '수렴')

  bindA.dispose()
  bindB.dispose()
})

// 라이브 중계: LOCAL_ORIGIN 업데이트만 상대 문서로 즉시 전달(applyRemote 는 Y 미변경 → 에코 없음)
function connect(d1, d2) {
  d1.on('update', (u, origin) => {
    if (origin === LOCAL_ORIGIN) Y.applyUpdate(d2, u, 'remote')
  })
  d2.on('update', (u, origin) => {
    if (origin === LOCAL_ORIGIN) Y.applyUpdate(d1, u, 'remote')
  })
}

test('통합: 미-push 로컬 편집이 원격 적용 도착해도 살아남음 (Phase 1.5)', async () => {
  const docA = new Y.Doc()
  const docB = new Y.Doc()
  connect(docA, docB)

  const edA = makeFakeEditor([b('a', 'A0'), b('x', 'X0')])
  const edB = makeFakeEditor()
  const bindA = createBlockBinding({ editor: edA, ydoc: docA, getSavedBlocks: () => edA.save().then((d) => d.blocks) })
  const bindB = createBlockBinding({ editor: edB, ydoc: docB, getSavedBlocks: () => edB.save().then((d) => d.blocks) })

  await bindA.seed([b('a', 'A0'), b('x', 'X0')])
  await tick()
  assert.deepEqual(edB._arr, [b('a', 'A0'), b('x', 'X0')], 'B 초기 수신')

  // 둘 다 로컬 편집(둘 다 아직 push 전). A 가 먼저 push → B 로 즉시 중계되어
  // B 의 x 가 아직 push 안 된 상태에서 applyRemote 가 실행됨.
  edA._arr[0].data = { text: 'A1' }
  edB._arr[1].data = { text: 'X1' }
  await bindA.pushLocal()
  await tick()
  await bindB.pushLocal()
  await tick()
  await tick()

  assert.equal(texts(edA._arr).a, 'A1', 'A 편집 보존')
  assert.equal(texts(edA._arr).x, 'X1', 'B 편집 반영')
  assert.equal(texts(edB._arr).a, 'A1', 'A 편집 반영')
  assert.equal(texts(edB._arr).x, 'X1', 'B 의 미-push 편집이 원격 적용에 살아남음')
  assert.deepEqual(edA._arr, edB._arr, '수렴')

  bindA.dispose()
  bindB.dispose()
})
