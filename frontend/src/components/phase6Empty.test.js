import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const __dirname = dirname(fileURLToPath(import.meta.url))
const srcRoot = resolve(__dirname, '..')

const readSource = (relativePath) => readFileSync(resolve(srcRoot, relativePath), 'utf8')

test('shared EmptyState component exposes icon/title/description', () => {
  const emptyState = readSource('components/feedback/EmptyState.vue')

  assert.match(emptyState, /icon:/)
  assert.match(emptyState, /title:/)
  assert.match(emptyState, /description:/)
  assert.match(emptyState, /empty-state__actions/)
})

test('BaseFileView renders EmptyState with filter-reset and context props', () => {
  const baseFileView = readSource('components/BaseFileView.vue')

  assert.match(baseFileView, /import EmptyState from "@\/components\/feedback\/EmptyState\.vue"/)
  assert.match(baseFileView, /emptyTitle:/)
  assert.match(baseFileView, /emptyActionLabel:/)
  assert.match(baseFileView, /"empty-action"/)
  // 필터/검색이 걸린 빈 결과는 조건 초기화 안내로 분기
  assert.match(baseFileView, /v-if="hasActiveFilters"/)
})

test('home and drive empty state requests the upload panel', () => {
  for (const view of ['views/dashboard/HomeView.vue', 'views/dashboard/DriveView.vue']) {
    const source = readSource(view)
    assert.match(source, /open-file-upload/, `${view} should dispatch the upload event`)
    assert.match(source, /empty-action-label="파일 업로드"/, `${view} should label the CTA`)
  }
})

test('upload widget listens for the empty-state upload request', () => {
  const widget = readSource('components/function/FilesUploadWidget.vue')

  assert.match(widget, /addEventListener\("open-file-upload", handleOpenUploadRequest\)/)
  assert.match(widget, /removeEventListener\("open-file-upload", handleOpenUploadRequest\)/)
})

test('shared library and collaboration empties explain their cause', () => {
  const shareView = readSource('views/dashboard/ShareFileView.vue')
  assert.match(shareView, /emptyState/)
  assert.match(shareView, /공유받은 문서가 없습니다/)

  const sidebar = readSource('components/Sidebar.vue')
  assert.match(sidebar, /초대받은 협업 문서가 여기에 표시됩니다/)
})
