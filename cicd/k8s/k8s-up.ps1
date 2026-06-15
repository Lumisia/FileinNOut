# WaffleBear 로컬 Kubernetes 기동 (Docker Desktop K8s)
# 사용법:
#   ./cicd/k8s/k8s-up.ps1            기동 (secret 생성 + apply + rollout 대기)
#   ./cicd/k8s/k8s-up.ps1 -Forward  접속용 port-forward (frontend → localhost:8088)
#   ./cicd/k8s/k8s-up.ps1 -Status   상태
#   ./cicd/k8s/k8s-up.ps1 -Down      전체 삭제(namespace drop)
param(
    [switch]$Down,
    [switch]$Status,
    [switch]$Forward
)

$ErrorActionPreference = "Stop"
$ScriptDir = $PSScriptRoot
$RepoRoot  = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path
$Ns        = "waffle"

# kubectl 확인
try { kubectl version --client --output=yaml | Out-Null } catch {
    Write-Error "kubectl 을 찾을 수 없습니다."
    exit 1
}

# Docker Desktop 컨텍스트 확인/전환
$ctxs = (kubectl config get-contexts -o name) 2>$null
if ($ctxs -notcontains "docker-desktop") {
    Write-Error "kube context 'docker-desktop' 가 없습니다. Docker Desktop > Settings > Kubernetes > Enable Kubernetes 활성화 후 다시 실행하세요."
    exit 1
}
kubectl config use-context docker-desktop | Out-Null

if ($Status) {
    kubectl -n $Ns get all
    exit 0
}

if ($Forward) {
    # Docker Desktop 의 kind 모드 k8s 는 NodePort 를 localhost 로 노출하지 않으므로
    # frontend 서비스를 port-forward 한다. nginx 가 /api, /wss 를 backend/websocket 으로 프록시.
    Write-Host "프론트(전체):  http://localhost:8088" -ForegroundColor Green
    Write-Host "  Swagger:     http://localhost:8088/api/swagger-ui/index.html" -ForegroundColor Green
    Write-Host "(Ctrl+C 로 종료)" -ForegroundColor DarkGray
    kubectl -n $Ns port-forward svc/frontend 8088:80
    exit $LASTEXITCODE
}

if ($Down) {
    Write-Host "==> namespace '$Ns' 삭제" -ForegroundColor Yellow
    kubectl delete namespace $Ns --ignore-not-found
    exit $LASTEXITCODE
}

# .env 확인
$envFile = Join-Path $RepoRoot ".env"
if (-not (Test-Path $envFile)) {
    Write-Error ".env 가 없습니다 ($envFile). docker compose 와 동일한 .env 가 필요합니다."
    exit 1
}

Write-Host "==> namespace 적용" -ForegroundColor Cyan
kubectl apply -f (Join-Path $ScriptDir "00-namespace.yaml")

# .env -> Secret (export 접두사/따옴표 제거)
Write-Host "==> .env 로부터 Secret(waffle-secret) 생성" -ForegroundColor Cyan
$tmp = New-TemporaryFile
try {
    $clean = foreach ($l in (Get-Content $envFile)) {
        if (-not $l -or $l -match '^\s*#') { continue }
        $line = $l -replace '^\s*export\s+', ''
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            $k = $matches[1]; $v = $matches[2].Trim()
            if ($v.Length -ge 2 -and (($v[0] -eq '"' -and $v[-1] -eq '"') -or ($v[0] -eq "'" -and $v[-1] -eq "'"))) {
                $v = $v.Substring(1, $v.Length - 2)
            }
            "$k=$v"
        }
    }
    $clean | Set-Content -Encoding ascii $tmp
    (kubectl -n $Ns create secret generic waffle-secret --from-env-file=$tmp --dry-run=client -o yaml) | kubectl apply -f -
} finally {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
}

Write-Host "==> 매니페스트 적용" -ForegroundColor Cyan
kubectl apply -f $ScriptDir

Write-Host "==> rollout 대기" -ForegroundColor Cyan
foreach ($d in @("redis", "db", "minio", "backend-app", "websocket-server", "frontend")) {
    kubectl -n $Ns rollout status deploy/$d --timeout=300s
}

Write-Host ""
kubectl -n $Ns get pods -o wide
Write-Host ""
Write-Host "전체 6개 서비스 기동 완료." -ForegroundColor Green
Write-Host "Docker Desktop kind 모드는 NodePort 를 localhost 로 노출하지 않으므로 접속은 port-forward 사용:" -ForegroundColor Yellow
Write-Host "  ./cicd/k8s/k8s-up.ps1 -Forward      → http://localhost:8088 (프론트+API)" -ForegroundColor Green
Write-Host "  kubectl -n waffle port-forward svc/minio 9001:9001   → MinIO 콘솔 http://localhost:9001" -ForegroundColor Green
