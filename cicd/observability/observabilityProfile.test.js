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
  assert.doesNotMatch(values, /serverFiles:/)
  assert.doesNotMatch(values, /job_name:\s*prometheus/)
  // 공개 무인증 엔드포인트라 /-/quit·/-/reload(lifecycle)와 reload 사이드카는 비활성.
  // 차트가 web.enable-lifecycle를 extraFlags 기본값으로 주입하므로 빈 배열로 제거한다.
  assert.match(values, /extraFlags:\s*\[\]/)
  assert.match(values, /configmapReload:[\s\S]*prometheus:[\s\S]*enabled:\s*false/)
})

test('Kiali operator values point at Prometheus and Jaeger with small resources', () => {
  assert.equal(fileExists('cicd/observability/values-kiali-operator-k3s.yaml'), true)

  const values = readRepoFile('cicd/observability/values-kiali-operator-k3s.yaml')
  assert.match(values, /auth:[\s\S]*strategy:\s*anonymous/)
  assert.match(values, /deployment:[\s\S]*view_only_mode:\s*true/)
  assert.match(values, /prometheus:[\s\S]*url:\s*"http:\/\/prometheus-server\.observability\.svc\.cluster\.local"/)
  assert.match(values, /tracing:[\s\S]*enabled:\s*true/)
  assert.match(values, /in_cluster_url:\s*"http:\/\/jaeger-query\.observability\.svc\.cluster\.local:16686"/)
  assert.match(values, /url:\s*"https:\/\/jaeger\.fileinnout\.com"/)
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

test('public portfolio ingress persists FileInNOut Kiali and Jaeger hosts', () => {
  assert.equal(fileExists('cicd/observability/ingress.yaml'), true)

  const ingress = readRepoFile('cicd/observability/ingress.yaml')
  assert.match(ingress, /namespace:\s*istio-system[\s\S]*host:\s*kiali\.fileinnout\.com/)
  assert.match(ingress, /namespace:\s*observability[\s\S]*host:\s*jaeger\.fileinnout\.com/)
  assert.match(ingress, /name:\s*kiali/)
  assert.match(ingress, /name:\s*jaeger-query/)
  // Kiali's web_root is /kiali, so the bare host must redirect there.
  assert.match(ingress, /app-root:\s*"?\/kiali"?/)
  // Cloudflare terminates public HTTPS for these portfolio UIs; the cluster
  // manifest intentionally matches the currently applied HTTP-only ingresses.
  assert.doesNotMatch(ingress, /secretName:\s*observability-tls/)
  assert.doesNotMatch(ingress, /force-ssl-redirect/)
  assert.doesNotMatch(ingress, /ssl-redirect/)
})

test('public portfolio ingress also exposes Grafana, Prometheus, and the Dashboard', () => {
  const ingress = readRepoFile('cicd/observability/ingress.yaml')
  assert.match(ingress, /host:\s*grafana\.fileinnout\.com/)
  assert.match(ingress, /host:\s*prometheus\.fileinnout\.com/)
  assert.match(ingress, /host:\s*dashboard\.fileinnout\.com/)
  assert.match(ingress, /name:\s*grafana/)
  assert.match(ingress, /name:\s*prometheus-server/)
  assert.match(ingress, /name:\s*kubernetes-dashboard/)
  // Prometheus should show target health first, not an empty query form.
  assert.match(ingress, /name:\s*prometheus[\s\S]*app-root:\s*"?\/targets"?/)
  // Dashboard serves HTTPS on its service port, so nginx must speak HTTPS upstream.
  assert.match(ingress, /backend-protocol:\s*"?HTTPS"?/)
})

test('Grafana values stay light and expose read-only dashboards to anonymous visitors', () => {
  assert.equal(fileExists('cicd/observability/values-grafana-k3s.yaml'), true)

  const values = readRepoFile('cicd/observability/values-grafana-k3s.yaml')
  assert.match(values, /auth:[\s\S]*disable_login_form:\s*false/)
  // 포트폴리오 방문자가 로그인 없이 대시보드를 읽도록 익명 Viewer 허용. 편집/관리는 불가.
  assert.match(values, /auth\.anonymous:[\s\S]*enabled:\s*true/)
  assert.match(values, /auth\.anonymous:[\s\S]*org_role:\s*Viewer/)
  assert.match(values, /allow_sign_up:\s*false/)
  // 기존 Prometheus/Jaeger 데이터소스 재사용
  assert.match(values, /url:\s*http:\/\/prometheus-server\.observability\.svc\.cluster\.local/)
  assert.match(values, /url:\s*http:\/\/jaeger-query\.observability\.svc\.cluster\.local:16686/)
  // 작은 자원 + local-path 퍼시스턴스
  assert.match(values, /requests:[\s\S]*cpu:\s*"100m"[\s\S]*memory:\s*"128Mi"/)
  assert.match(values, /storageClassName:\s*"local-path"/)
  // 평문 admin 비밀번호 금지
  assert.doesNotMatch(values, /adminPassword:/)
})

test('Kubernetes Dashboard RBAC grants read-only view without secrets', () => {
  assert.equal(fileExists('cicd/observability/dashboard-readonly-rbac.yaml'), true)

  const rbac = readRepoFile('cicd/observability/dashboard-readonly-rbac.yaml')
  assert.match(rbac, /kind:\s*ServiceAccount[\s\S]*name:\s*dashboard-viewer/)
  assert.match(rbac, /kind:\s*Secret[\s\S]*name:\s*dashboard-viewer-token/)
  assert.match(rbac, /type:\s*kubernetes\.io\/service-account-token/)
  assert.match(rbac, /kubernetes\.io\/service-account\.name:\s*dashboard-viewer/)
  assert.match(rbac, /kind:\s*ClusterRoleBinding/)
  // 내장 view 롤(Secret 제외)에 바인딩
  assert.match(rbac, /kind:\s*ClusterRole\s*\n\s*name:\s*view/)
  assert.doesNotMatch(rbac, /name:\s*cluster-admin/)
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
  assert.match(readme, /values\.cni\.cniBinDir=\/var\/lib\/rancher\/k3s\/data\/cni/)
  assert.match(readme, /values\.cni\.cniConfDir=\/var\/lib\/rancher\/k3s\/agent\/etc\/cni\/net\.d/)
  assert.match(readme, /extensionProviders\[0\]\.opentelemetry\.service=jaeger-collector\.observability\.svc\.cluster\.local/)
  assert.match(readme, /kubectl label namespace fileinnout istio\.io\/dataplane-mode=ambient --overwrite/)
  assert.match(readme, /intentionally\s+public for this portfolio deployment/)
})

test('visitor access docs keep Jenkins private and observability UIs read-only', () => {
  assert.equal(fileExists('cicd/observability/README.md'), true)
  assert.equal(fileExists('docs/deployment/oci-k3s-jenkins.md'), true)

  const readme = readRepoFile('cicd/observability/README.md')
  const deploymentDoc = readRepoFile('docs/deployment/oci-k3s-jenkins.md')
  const combined = `${readme}\n${deploymentDoc}`

  assert.match(combined, /Cloudflare Access/)
  assert.match(combined, /Jenkins[\s\S]*directly public/)
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
  assert.match(readme, /kiali\.fileinnout\.com/)
  assert.match(readme, /jaeger\.fileinnout\.com/)
  // Grafana / Prometheus / Dashboard portfolio access docs
  assert.match(readme, /grafana\.fileinnout\.com/)
  assert.match(readme, /prometheus\.fileinnout\.com/)
  assert.match(readme, /dashboard\.fileinnout\.com/)
  assert.match(readme, /Grafana[\s\S]*admin/)
  assert.match(readme, /Prometheus[\s\S]*no user\/role model/)
  assert.match(readme, /\/targets/)
  assert.match(readme, /dashboard-viewer-token/)
  assert.match(readme, /view.*ClusterRole|ClusterRole[\s\S]*view/)
})
