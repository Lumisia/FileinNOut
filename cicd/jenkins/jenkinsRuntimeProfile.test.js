import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')

const readRepoFile = (relativePath) => readFileSync(resolve(repoRoot, relativePath), 'utf8')
const fileExists = (relativePath) => existsSync(resolve(repoRoot, relativePath))

test('Jenkins controller image includes the CI deploy toolchain', () => {
  assert.equal(fileExists('cicd/jenkins/Dockerfile'), true)
  assert.equal(fileExists('cicd/jenkins/plugins.txt'), true)

  const dockerfile = readRepoFile('cicd/jenkins/Dockerfile')
  const plugins = readRepoFile('cicd/jenkins/plugins.txt')

  assert.match(dockerfile, /FROM\s+jenkins\/jenkins:lts/)
  assert.match(dockerfile, /jenkins-plugin-cli\s+--plugin-file/)
  assert.match(dockerfile, /docker-ce-cli/)
  assert.match(dockerfile, /docker-compose-plugin/)
  assert.match(dockerfile, /dl\.k8s\.io\/release\/\$\{KUBECTL_VERSION\}/)
  assert.match(dockerfile, /get\.helm\.sh\/helm-\$\{HELM_VERSION\}-linux-amd64\.tar\.gz/)
  assert.match(plugins, /^workflow-aggregator$/m)
  assert.match(plugins, /^git$/m)
  assert.match(plugins, /^github$/m)
  assert.match(plugins, /^credentials-binding$/m)
  assert.match(plugins, /^matrix-auth$/m)
})

test('Jenkins Compose profile persists state and reaches the host Docker daemon', () => {
  assert.equal(fileExists('cicd/jenkins/docker-compose.oci.yml'), true)

  const compose = readRepoFile('cicd/jenkins/docker-compose.oci.yml')
  assert.match(compose, /dockerfile:\s*cicd\/jenkins\/Dockerfile/)
  assert.match(compose, /127\.0\.0\.1:8081:8080/)
  assert.match(compose, /jenkins_home:\/var\/jenkins_home/)
  assert.match(compose, /\/var\/run\/docker\.sock:\/var\/run\/docker\.sock/)
  assert.match(compose, /restart:\s*unless-stopped/)
  assert.match(compose, /JENKINS_OPTS=--prefix=\//)
})

test('Cloudflare Tunnel example routes public domains to local services', () => {
  assert.equal(fileExists('cicd/cloudflare/cloudflared-config.example.yml'), true)

  const config = readRepoFile('cicd/cloudflare/cloudflared-config.example.yml')
  assert.match(config, /hostname:\s*jenkins\.example\.com[\s\S]*service:\s*http:\/\/localhost:8081/)
  assert.match(config, /hostname:\s*app\.example\.com[\s\S]*service:\s*http:\/\/localhost:80/)
  assert.match(config, /hostname:\s*api\.example\.com[\s\S]*service:\s*http:\/\/localhost:80/)
  assert.match(config, /hostname:\s*swagger\.example\.com[\s\S]*service:\s*http:\/\/localhost:80/)
  assert.match(config, /hostname:\s*kiali\.example\.com[\s\S]*service:\s*http:\/\/localhost:80/)
  assert.match(config, /hostname:\s*jaeger\.example\.com[\s\S]*service:\s*http:\/\/localhost:80/)
  assert.match(config, /service:\s*http_status:404/)
})

test('Cloudflare docs describe Tunnel routing and protected admin apps', () => {
  assert.equal(fileExists('cicd/cloudflare/README.md'), true)

  const readme = readRepoFile('cicd/cloudflare/README.md')
  assert.match(readme, /cloudflared tunnel create fileinnout-portfolio/)
  assert.match(readme, /cloudflared tunnel route dns fileinnout-portfolio jenkins\.example\.com/)
  assert.match(readme, /cloudflared tunnel run fileinnout-portfolio/)
  assert.match(readme, /jenkins\.example\.com/)
  assert.match(readme, /kiali\.example\.com/)
  assert.match(readme, /jaeger\.example\.com/)
  assert.match(readme, /Cloudflare Access/)
  assert.match(readme, /visitor email/)
})

test('Jenkins runtime docs describe the required secure setup steps', () => {
  assert.equal(fileExists('cicd/jenkins/README.md'), true)

  const readme = readRepoFile('cicd/jenkins/README.md')
  assert.match(readme, /docker compose -f cicd\/jenkins\/docker-compose\.oci\.yml up -d --build/)
  assert.match(readme, /https:\/\/jenkins\.example\.com\/github-webhook\//)
  assert.match(readme, /dockerhub-lumisia/)
  assert.match(readme, /oci-k3s-kubeconfig/)
  assert.match(readme, /fileinnout-values-private/)
  assert.match(readme, /Matrix Authorization/)
  assert.match(readme, /Overall\/Read/)
  assert.match(readme, /disable concurrent builds/i)
  assert.match(readme, /do not expose port 8081 directly/i)
})
