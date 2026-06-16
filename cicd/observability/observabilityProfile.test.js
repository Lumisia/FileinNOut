import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')

const readRepoFile = (relativePath) => readFileSync(resolve(repoRoot, relativePath), 'utf8')
const fileExists = (relativePath) => existsSync(resolve(repoRoot, relativePath))

test('observability profile contains lightweight Prometheus settings', () => {
  assert.equal(fileExists('cicd/observability/values-prometheus-k3s.yaml'), true)

  const values = readRepoFile('cicd/observability/values-prometheus-k3s.yaml')
  assert.match(values, /alertmanager:[\s\S]*enabled:\s*false/)
  assert.match(values, /prometheus-pushgateway:[\s\S]*enabled:\s*false/)
  assert.match(values, /retention:\s*"6h"/)
  assert.match(values, /storageClass:\s*"local-path"/)
  assert.match(values, /size:\s*4Gi/)
  assert.match(values, /requests:[\s\S]*cpu:\s*"200m"[\s\S]*memory:\s*"512Mi"/)
})

test('Kiali operator values point at Prometheus and Jaeger with small resources', () => {
  assert.equal(fileExists('cicd/observability/values-kiali-operator-k3s.yaml'), true)

  const values = readRepoFile('cicd/observability/values-kiali-operator-k3s.yaml')
  assert.match(values, /auth:[\s\S]*strategy:\s*anonymous/)
  assert.match(values, /deployment:[\s\S]*view_only_mode:\s*true/)
  assert.match(values, /prometheus:[\s\S]*url:\s*"http:\/\/prometheus-server\.observability\.svc\.cluster\.local"/)
  assert.match(values, /tracing:[\s\S]*enabled:\s*true/)
  assert.match(values, /in_cluster_url:\s*"http:\/\/jaeger-query\.observability\.svc\.cluster\.local:16686"/)
  assert.match(values, /requests:[\s\S]*cpu:\s*"100m"[\s\S]*memory:\s*"256Mi"/)
})

test('Jaeger all-in-one manifest uses memory storage and OTLP ports', () => {
  assert.equal(fileExists('cicd/observability/jaeger-all-in-one.yaml'), true)

  const manifest = readRepoFile('cicd/observability/jaeger-all-in-one.yaml')
  assert.match(manifest, /kind:\s*Deployment/)
  assert.match(manifest, /image:\s*jaegertracing\/all-in-one:1\.76\.0/)
  assert.match(manifest, /name:\s*SPAN_STORAGE_TYPE[\s\S]*value:\s*"memory"/)
  assert.match(manifest, /name:\s*COLLECTOR_OTLP_ENABLED[\s\S]*value:\s*"true"/)
  assert.match(manifest, /containerPort:\s*4317/)
  assert.match(manifest, /containerPort:\s*4318/)
  assert.match(manifest, /containerPort:\s*16686/)
  assert.match(manifest, /requests:[\s\S]*cpu:\s*"100m"[\s\S]*memory:\s*"256Mi"/)
})

test('Cloudflare-ready ingress exposes Kiali and Jaeger only via placeholder hosts', () => {
  assert.equal(fileExists('cicd/observability/ingress.yaml'), true)

  const ingress = readRepoFile('cicd/observability/ingress.yaml')
  assert.match(ingress, /namespace:\s*istio-system[\s\S]*host:\s*kiali\.example\.com/)
  assert.match(ingress, /namespace:\s*observability[\s\S]*host:\s*jaeger\.example\.com/)
  assert.match(ingress, /secretName:\s*observability-tls/)
  assert.match(ingress, /name:\s*kiali/)
  assert.match(ingress, /name:\s*jaeger-query/)
})

test('Istio telemetry manifest and docs wire traces to Jaeger without sidecar mode', () => {
  assert.equal(fileExists('cicd/observability/istio-telemetry.yaml'), true)
  assert.equal(fileExists('cicd/observability/README.md'), true)

  const telemetry = readRepoFile('cicd/observability/istio-telemetry.yaml')
  const readme = readRepoFile('cicd/observability/README.md')

  assert.match(telemetry, /apiVersion:\s*telemetry\.istio\.io\/v1/)
  assert.match(telemetry, /kind:\s*Telemetry/)
  assert.match(telemetry, /providers:[\s\S]*name:\s*jaeger/)
  assert.match(readme, /profile=ambient/)
  assert.match(readme, /extensionProviders\[0\]\.opentelemetry\.service=jaeger-collector\.observability\.svc\.cluster\.local/)
  assert.match(readme, /kubectl label namespace fileinnout istio\.io\/dataplane-mode=ambient --overwrite/)
  assert.match(readme, /Do not expose Kiali or Jaeger publicly without Cloudflare Access/)
})

test('visitor access docs keep Jenkins, Kiali, and Jaeger read-only', () => {
  assert.equal(fileExists('cicd/observability/README.md'), true)
  assert.equal(fileExists('docs/deployment/oci-k3s-jenkins.md'), true)

  const readme = readRepoFile('cicd/observability/README.md')
  const deploymentDoc = readRepoFile('docs/deployment/oci-k3s-jenkins.md')
  const combined = `${readme}\n${deploymentDoc}`

  assert.match(combined, /Cloudflare Access/)
  assert.match(combined, /Matrix Authorization/)
  assert.match(combined, /Overall\/Read/)
  assert.match(combined, /Job\/Read/)
  assert.match(combined, /View\/Read/)
  assert.match(combined, /Do not grant[\s\S]*Overall\/Administer/)
  assert.match(combined, /Do not grant[\s\S]*Job\/Build/)
  assert.match(combined, /view_only_mode:\s*true/)
  assert.match(combined, /Jaeger[\s\S]*does not provide a separate visitor account/)
  assert.match(combined, /only expose[\s\S]*jaeger-query/)
  assert.match(combined, /do not expose[\s\S]*jaeger-collector/)
})
