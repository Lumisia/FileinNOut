import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

const readRepoFile = (relativePath) => readFileSync(resolve(repoRoot, relativePath), 'utf8')
const fileExists = (relativePath) => existsSync(resolve(repoRoot, relativePath))

test('Spring backend source and Gradle wrapper live under backend folder', () => {
  assert.equal(fileExists('backend/build.gradle'), true)
  assert.equal(fileExists('backend/settings.gradle'), true)
  assert.equal(fileExists('backend/gradlew'), true)
  assert.equal(fileExists('backend/gradlew.bat'), true)
  assert.equal(fileExists('backend/gradle/wrapper/gradle-wrapper.jar'), true)
  assert.equal(fileExists('backend/src/main/java/com/example/WaffleBear/WaffleBearApplication.java'), true)
  assert.equal(fileExists('backend/src/main/resources/application.yml'), true)
  assert.equal(fileExists('backend/src/test/java/com/example/WaffleBear/WaffleBearApplicationTests.java'), true)
  assert.equal(fileExists('backend/ngrinder/README.md'), true)

  assert.equal(fileExists('build.gradle'), false)
  assert.equal(fileExists('settings.gradle'), false)
  assert.equal(fileExists('src/main/java/com/example/WaffleBear/WaffleBearApplication.java'), false)
  assert.equal(fileExists('ngrinder/README.md'), false)
})

test('backend Dockerfile builds from the backend folder while keeping root context', () => {
  const dockerfile = readRepoFile('cicd/backend.dockerfile')
  const compose = readRepoFile('docker-compose.yml')
  const gradleBuild = readRepoFile('backend/build.gradle')

  assert.match(dockerfile, /COPY backend\/gradlew \./)
  assert.match(dockerfile, /COPY backend\/gradle gradle/)
  assert.match(dockerfile, /COPY backend\/build\.gradle backend\/settings\.gradle \.\//)
  assert.match(dockerfile, /COPY backend\/src \.\/src/)
  assert.match(dockerfile, /COPY --from=builder \/app\/backend\/build\/libs\/\*\.jar app\.jar/)
  assert.match(compose, /backend-app:[\s\S]*dockerfile:\s*cicd\/backend\.dockerfile/)
  assert.match(gradleBuild, /dockerfile file\('\.\.\/cicd\/backend\.dockerfile'\)/)
})
