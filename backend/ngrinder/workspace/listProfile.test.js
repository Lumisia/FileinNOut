import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(resolve(__dirname, 'list.groovy'), 'utf8')

test('workspace list script targets the direct local backend without embedded credentials', () => {
  assert.match(source, /System\.getProperty\('baseUrl', 'http:\/\/backend-app:8080\/api'\)/)
  assert.match(source, /System\.getProperty\('loginEmail', ''\)/)
  assert.match(source, /System\.getProperty\('loginPassword', ''\)/)
  assert.match(source, /assert loginEmail\s*:/)
  assert.match(source, /assert loginPassword\s*:/)
  assert.match(source, /loginRequest\.POST\(\s*fullUrl\('\/login'\)\.toString\(\),\s*jsonBytes\(\[/)
  assert.match(source, /protected static org\.ngrinder\.http\.HTTPRequest loginRequest/)
  assert.match(source, /loginRequest = new org\.ngrinder\.http\.HTTPRequest\(\)/)
  assert.match(source, /test\.record\(request\)/)
  assert.match(source, /org\.ngrinder\.http\.HTTPResponse response = loginRequest\.POST\(/)
  assert.match(source, /headers\(\['Content-Type': 'application\/json; charset=UTF-8'\]\)/)
  assert.match(source, /String normalizedBaseUrl = baseUrl\.replaceAll\('\/\+\$', ''\)/)
  assert.match(source, /return "\$\{normalizedBaseUrl\}\$\{normalizedPath\}"\.toString\(\)/)
  assert.match(source, /def response = get\('\/workspace\/list', \[/)
  assert.match(source, /page: propInt\('listPage', 0\)/)
  assert.match(source, /size: propInt\('listSize', 50\)/)

  assert.doesNotMatch(source, /192\.100\.220\.17/)
})
