import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')

const readRepoFile = (relativePath) => readFileSync(resolve(repoRoot, relativePath), 'utf8')

test('Jenkins pipeline deploys main with immutable commit SHA image tags', () => {
  const jenkinsfilePath = resolve(repoRoot, 'Jenkinsfile')
  assert.equal(existsSync(jenkinsfilePath), true, 'root Jenkinsfile should exist')

  const jenkinsfile = readFileSync(jenkinsfilePath, 'utf8')
  assert.match(jenkinsfile, /githubPush\(\)/)
  assert.match(jenkinsfile, /IMAGE_TAG\s*=\s*(env\.)?GIT_COMMIT\.take\(12\)/)
  assert.match(jenkinsfile, /COMPOSE_IMAGE_TAG=\$\{IMAGE_TAG\}\s+docker compose .*build backend-app websocket-server frontend/)
  assert.match(jenkinsfile, /COMPOSE_IMAGE_TAG=\$\{IMAGE_TAG\}\s+docker compose .*push backend-app websocket-server frontend/)
  assert.match(jenkinsfile, /helm upgrade --install/)
  assert.match(jenkinsfile, /--set-string backend\.image\.tag="\$\{IMAGE_TAG\}"/)
  assert.match(jenkinsfile, /--set-string frontend\.image\.tag="\$\{IMAGE_TAG\}"/)
  assert.match(jenkinsfile, /--set-string websocket\.image\.tag="\$\{IMAGE_TAG\}"/)
  assert.doesNotMatch(jenkinsfile, /--set-string .*image\.tag="latest"/)
})

test('GitHub Actions deployment is manual-only because Jenkins owns main pushes', () => {
  const workflow = readRepoFile('.github/workflows/main.yml')

  assert.match(workflow, /workflow_dispatch:/)
  assert.doesNotMatch(workflow, /push:\s*\r?\n\s*branches:\s*\["main"\]/)
})

test('GitHub Actions builds multi-arch images so they run on aarch64 OCI nodes', () => {
  const workflow = readRepoFile('.github/workflows/main.yml')

  // amd64 runner + plain build = amd64-only images that fail to pull on arm64 nodes.
  // buildx must produce a linux/amd64 + linux/arm64 manifest.
  assert.match(workflow, /docker\/setup-qemu-action/)
  assert.match(workflow, /docker\/setup-buildx-action/)
  assert.match(workflow, /buildx bake/)
  assert.match(workflow, /platform=linux\/amd64,linux\/arm64/)
})

test('OCI k3s values profile uses single-node friendly resources and domains', () => {
  const valuesPath = resolve(repoRoot, 'cicd/helm/values-oci-k3s.yaml')
  assert.equal(existsSync(valuesPath), true, 'OCI k3s values overlay should exist')

  const values = readFileSync(valuesPath, 'utf8')
  assert.match(values, /workerOnly:\s*false/)
  assert.match(values, /storageClassName:\s*local-path/)
  assert.match(values, /backend:[\s\S]*replicaCount:\s*1/)
  assert.match(values, /frontend:[\s\S]*replicaCount:\s*1/)
  assert.match(values, /websocket:[\s\S]*replicaCount:\s*1/)
  assert.match(values, /redis:[\s\S]*sentinel:[\s\S]*enabled:\s*false/)
  assert.match(values, /rollout:[\s\S]*enabled:\s*false/)
  assert.match(values, /hosts:[\s\S]*frontend:[\s\S]*api:[\s\S]*swagger:/)
})

test('OCI k3s chart deploys MinIO for the minio storage provider', () => {
  const baseValues = readRepoFile('cicd/helm/values.yaml')
  const ociValues = readRepoFile('cicd/helm/values-oci-k3s.yaml')
  const minioTemplatePath = resolve(repoRoot, 'cicd/helm/templates/minio-statefulset.yaml')

  assert.match(baseValues, /minio:[\s\S]*enabled:\s*true/)
  assert.match(baseValues, /service:[\s\S]*name:\s*minio[\s\S]*apiPort:\s*9000/)
  assert.match(ociValues, /minio:[\s\S]*storageClassName:\s*local-path/)
  assert.match(ociValues, /minio:[\s\S]*size:\s*4Gi/)
  assert.equal(existsSync(minioTemplatePath), true, 'MinIO StatefulSet template should exist')

  const source = readFileSync(minioTemplatePath, 'utf8')
  assert.match(source, /kind:\s*Service/)
  assert.match(source, /kind:\s*StatefulSet/)
  assert.match(source, /name:\s*MINIO_ROOT_USER/)
  assert.match(source, /name:\s*MINIO_ROOT_PASSWORD/)
  assert.match(source, /server[\s\S]*\/data[\s\S]*--console-address/)
  assert.match(source, /httpGet:[\s\S]*\/minio\/health\/ready/)
  assert.match(source, /minio-data/)
  assert.match(source, /wafflebear\.workerScheduling/)
})

test('environment ConfigMaps render every value as a Kubernetes string', () => {
  for (const [file, valuesPath] of [
    ['cicd/helm/templates/backend-configmap.yaml', 'backend'],
    ['cicd/helm/templates/websocket-server-configmap.yaml', 'websocket'],
  ]) {
    const source = readRepoFile(file)
    assert.doesNotMatch(source, /tpl \(toYaml \.Values\.[^)]+\.env\)/)
    assert.match(source, new RegExp(`range \\$key, \\$value := \\.Values\\.${valuesPath}\\.env`))
    assert.match(source, /tpl \(toString \$value\) \$ \| quote/)
  }
})

test('Helm templates can render standard Deployments without Argo Rollouts', () => {
  for (const file of [
    'cicd/helm/templates/backend-deployment.yaml',
    'cicd/helm/templates/frontend-deployment.yaml',
    'cicd/helm/templates/websocket-server-deployment.yaml',
  ]) {
    const source = readRepoFile(file)
    assert.match(source, /rolloutEnabled/)
    assert.match(source, /apiVersion:\s*\{\{ ternary "argoproj\.io\/v1alpha1" "apps\/v1"/)
    assert.match(source, /kind:\s*\{\{ ternary "Rollout" "Deployment"/)
    assert.match(source, /type:\s*RollingUpdate/)
  }
})

test('single-node scheduling can disable worker-only affinity', () => {
  const helper = readRepoFile('cicd/helm/templates/_helpers.tpl')
  assert.match(helper, /scheduling\.workerOnly/)
  assert.match(helper, /labels/)

  for (const file of [
    'cicd/helm/templates/backend-deployment.yaml',
    'cicd/helm/templates/frontend-deployment.yaml',
    'cicd/helm/templates/websocket-server-deployment.yaml',
    'cicd/helm/templates/mariadb-statefulset.yaml',
    'cicd/helm/templates/redis-deployment.yaml',
  ]) {
    const source = readRepoFile(file)
    assert.match(source, /"root"\s+\./)
    assert.match(source, /"labels"\s+\(dict/)
  }
})

test('public ingress keeps API root private and exposes Swagger under backend context path', () => {
  const unified = readRepoFile('cicd/helm/templates/unified-ingress.yaml')
  assert.match(unified, /path:\s*\/api\/swagger-ui/)
  assert.match(unified, /path:\s*\/api\/swagger-ui\.html/)
  assert.match(unified, /path:\s*\/api\/v3\/api-docs/)
  assert.doesNotMatch(unified, /host:\s*\{\{ \$swaggerHost \| quote \}\}[\s\S]*path:\s*\/\r?\n\s*pathType:\s*Prefix/)

  const apiRedirect = readRepoFile('cicd/helm/templates/api-redirect-ingress.yaml')
  assert.match(apiRedirect, /permanent-redirect:\s*https:\/\/\{\{ \$frontendHost \}\}\/login/)
  assert.match(apiRedirect, /path:\s*\/\r?\n\s*pathType:\s*Exact/)
  assert.match(apiRedirect, /path:\s*\/api\/login\r?\n\s*pathType:\s*Exact/)
})

test('app Dockerfiles use ARM64-capable base images for OCI aarch64 nodes', () => {
  // OCI Ampere A1 nodes are aarch64. eclipse-temurin alpine tags are not published
  // for arm64 ("no match for platform in manifest"), so the backend image must use a
  // multi-arch (jammy) Temurin base instead.
  const backend = readRepoFile('cicd/backend.dockerfile')
  assert.doesNotMatch(backend, /eclipse-temurin:[^\s]*-alpine/)
  assert.match(backend, /FROM eclipse-temurin:17-jdk-jammy AS builder/)
  assert.match(backend, /FROM eclipse-temurin:17-jre-jammy/)

  // node and nginx alpine images are multi-arch (they include arm64), so they are fine.
  const websocket = readRepoFile('cicd/websocket.dockerfile')
  assert.match(websocket, /FROM node:/)
  const frontend = readRepoFile('cicd/frontend.dockerfile')
  assert.match(frontend, /FROM node:/)
  assert.match(frontend, /FROM nginx:/)
})
