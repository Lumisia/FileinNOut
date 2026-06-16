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
