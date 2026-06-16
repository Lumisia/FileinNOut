import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const __dirname = dirname(fileURLToPath(import.meta.url))
const srcRoot = resolve(__dirname, '..')

const readSource = (relativePath) => readFileSync(resolve(srcRoot, relativePath), 'utf8')

const countTopLevelRule = (source, selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return [...source.matchAll(new RegExp(`^${escaped}\\s*\\{`, 'gm'))].length
}

const extractRuleBody = (source, selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`^${escaped}\\s*\\{(?<body>[\\s\\S]*?)^\\}`, 'm'))
  return match?.groups?.body ?? ''
}

test('Header styles keep one canonical rule per shared selector', () => {
  const header = readSource('components/Header.vue')
  const duplicatedSelectors = [
    '.header-container',
    '.header-search-wrap',
    '.search-input',
    '.search-input:focus',
    '.search-input::placeholder',
    '.search-icon',
    '.header-actions',
    '.icon-button',
    '.profile-trigger',
    '.dropdown-container',
  ]

  for (const selector of duplicatedSelectors) {
    assert.equal(countTopLevelRule(header, selector), 1, `${selector} should be defined once`)
  }

  assert.equal([...header.matchAll(/^@keyframes bell-swing/gm)].length, 1)
})

test('Cleanup removes broad transitions and low-contrast notification time color', () => {
  const header = readSource('components/Header.vue')
  const theme = readSource('assets/theme.css')
  const notifTimeRule = extractRuleBody(header, '.notif-time')

  assert.doesNotMatch(header, /transition:\s*all\b/)
  assert.doesNotMatch(theme, /^\*\s*\{\s*transition-property:/m)
  assert.doesNotMatch(notifTimeRule, /#999\b/i)
  assert.match(notifTimeRule, /color:\s*var\(--text-secondary\)/)
})

test('Sidebar no longer carries disabled nav or storage usage chrome', () => {
  const sidebar = readSource('components/Sidebar.vue')

  assert.doesNotMatch(sidebar, /v-if="false"/)
  assert.doesNotMatch(sidebar, /fetchStorageSummary/)
  assert.doesNotMatch(sidebar, /formatBytes/)
  assert.doesNotMatch(sidebar, /storageSummary/)
  assert.doesNotMatch(sidebar, /storageUsage/)
  assert.doesNotMatch(sidebar, /name:\s*'payment'/)
})
