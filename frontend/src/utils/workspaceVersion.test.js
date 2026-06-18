import { test } from 'node:test'
import assert from 'node:assert/strict'

test('버전 스냅샷은 Editor.js 블록을 비교 화면용으로 파싱한다', async () => {
  const module = await import('./workspaceVersion.js').catch(() => ({}))

  assert.equal(typeof module.parseVersionSnapshot, 'function')
  assert.deepEqual(
    module.parseVersionSnapshot({
      versionNum: 2,
      titleSnapshot: '변경된 제목',
      contentSnapshot: JSON.stringify({ blocks: [{ id: 'p1', type: 'paragraph', data: { text: '내용' } }] }),
    }),
    {
      versionNum: 2,
      title: '변경된 제목',
      createdAt: null,
      blocks: [{ id: 'p1', type: 'paragraph', data: { text: '내용' } }],
    },
  )
})

test('이미지는 최신 에셋 URL을 우선하고 없으면 스냅샷 URL을 사용한다', async () => {
  const module = await import('./workspaceVersion.js').catch(() => ({}))
  const block = {
    type: 'image',
    data: { file: { assetIdx: 42, url: 'https://old.example/image.png' } },
  }

  assert.equal(typeof module.resolveVersionImageUrl, 'function')
  assert.equal(
    module.resolveVersionImageUrl(block, new Map([['42', 'https://fresh.example/image.png']])),
    'https://fresh.example/image.png',
  )
  assert.equal(module.resolveVersionImageUrl(block), 'https://old.example/image.png')
})

test('손상된 버전 내용은 빈 블록으로 안전하게 처리한다', async () => {
  const module = await import('./workspaceVersion.js').catch(() => ({}))

  assert.equal(typeof module.parseVersionSnapshot, 'function')
  assert.deepEqual(module.parseVersionSnapshot({ contentSnapshot: '{broken' }).blocks, [])
})

test('복구용 이미지 블록은 원본을 바꾸지 않고 최신 URL로 교체한다', async () => {
  const module = await import('./workspaceVersion.js').catch(() => ({}))
  const blocks = [{
    id: 'image-1',
    type: 'image',
    data: { caption: '샘플', file: { assetIdx: 42, url: 'https://old.example/image.png' } },
  }]

  assert.equal(typeof module.hydrateVersionImageUrls, 'function')
  const hydrated = module.hydrateVersionImageUrls(
    blocks,
    new Map([['42', 'https://fresh.example/image.png']]),
  )

  assert.equal(hydrated[0].data.file.url, 'https://fresh.example/image.png')
  assert.equal(blocks[0].data.file.url, 'https://old.example/image.png')
})
