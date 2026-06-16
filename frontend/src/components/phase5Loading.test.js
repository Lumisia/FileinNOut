import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const __dirname = dirname(fileURLToPath(import.meta.url))
const srcRoot = resolve(__dirname, '..')

const readSource = (relativePath) => readFileSync(resolve(srcRoot, relativePath), 'utf8')

const collectSourceFiles = (relativeDir) => {
  const dir = resolve(srcRoot, relativeDir)
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const childRelativePath = `${relativeDir}/${entry.name}`

    if (entry.isDirectory()) {
      return collectSourceFiles(childRelativePath)
    }

    return /\.(js|vue)$/.test(entry.name) ? [childRelativePath] : []
  })
}

test('file list has skeleton loading, visible error, and retry without silent catch', () => {
  const baseFileView = readSource('components/BaseFileView.vue')

  assert.match(baseFileView, /file-list-skeleton/)
  assert.match(baseFileView, /file-error-panel/)
  assert.match(baseFileView, /retryFileList/)
  assert.doesNotMatch(baseFileView, /fetchDrivePage\(query\)\.catch\(\(\) => \{\}\)/)
  assert.doesNotMatch(baseFileView, /fetchFiles\(\)\.catch\(\(\) => \{\}\)/)
})

test('storage view has skeleton loading and retry handler without silent catch', () => {
  const storageView = readSource('views/dashboard/StorageView.vue')

  assert.match(storageView, /storage-skeleton/)
  assert.match(storageView, /storage-error-panel/)
  assert.match(storageView, /retryStorageSummary/)
  assert.doesNotMatch(storageView, /fetchStorageSummary\(\)\.catch\(\(\) => \{\}\)/)
})

test('workspace version panel separates loading, error, and empty states', () => {
  const workspace = readSource('views/workspace/WorkSpace.vue')

  assert.match(workspace, /version-skeleton/)
  assert.match(workspace, /version-error-panel/)
  assert.match(workspace, /versionLoadError/)
  assert.match(workspace, /retryVersionList/)
  assert.doesNotMatch(workspace, /catch\s*\{\s*versions\.value = \[\]/)
})

test('header storage summary fetch failures are handled explicitly', () => {
  const header = readSource('components/Header.vue')

  assert.match(header, /handleStorageSummaryError/)
  assert.doesNotMatch(header, /fetchStorageSummary\(\)\.catch\(\(\) => \{\}\)/)
})

test('frontend source has no empty catch handlers in components, views, or stores', () => {
  const files = [
    ...collectSourceFiles('components'),
    ...collectSourceFiles('views'),
    ...collectSourceFiles('stores'),
  ]

  for (const file of files) {
    const source = readSource(file)
    assert.doesNotMatch(source, /\.catch\(\(\) => \{\}\)/, `${file} should not silently swallow promise failures`)
    assert.doesNotMatch(source, /catch\s*\{\s*\}/, `${file} should not silently swallow caught failures`)
  }
})
