import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const __dirname = dirname(fileURLToPath(import.meta.url))

const readFrontendFile = (relativePath) => readFileSync(resolve(__dirname, relativePath), 'utf8')
const readFrontendBytes = (relativePath) => readFileSync(resolve(__dirname, relativePath))
const fileExists = (relativePath) => existsSync(resolve(__dirname, relativePath))

test('frontend uses the project ico favicon in built assets', () => {
  assert.equal(fileExists('public/favicon.ico'), true)

  const favicon = readFrontendBytes('public/favicon.ico')
  assert.equal(favicon[0], 0x00)
  assert.equal(favicon[1], 0x00)
  assert.equal(favicon[2], 0x01)
  assert.equal(favicon[3], 0x00)
  assert.ok(favicon.length > 1000)

  const index = readFrontendFile('index.html')
  assert.match(index, /<link rel="icon" type="image\/x-icon" href="\/favicon\.ico" \/>/)
  assert.match(index, /<title>FileInNOut<\/title>/)
})

test('service worker notification icons use the same favicon asset', () => {
  const serviceWorker = readFrontendFile('public/sw.js')

  assert.match(serviceWorker, /icon:\s*'\/favicon\.ico'/)
  assert.match(serviceWorker, /badge:\s*'\/favicon\.ico'/)
})
