# Kubernetes Dashboard 설치 + 접속 (Docker Desktop K8s, 로컬 전용)
# 사용법:
#   ./cicd/k8s/dashboard/dashboard.ps1            설치 + 토큰 출력 + port-forward
#   ./cicd/k8s/dashboard/dashboard.ps1 -Token     로그인 토큰만 출력
#   ./cicd/k8s/dashboard/dashboard.ps1 -Forward   port-forward 만 (https://localhost:8443)
param(
    [switch]$Token,
    [switch]$Forward
)

$ErrorActionPreference = "Stop"
$ScriptDir = $PSScriptRoot
$DashUrl   = "https://raw.githubusercontent.com/kubernetes/dashboard/v2.7.0/aio/deploy/recommended.yaml"
$Ns        = "kubernetes-dashboard"

kubectl config use-context docker-desktop | Out-Null

if ($Token) {
    kubectl -n $Ns create token admin-user --duration=24h
    exit $LASTEXITCODE
}

if ($Forward) {
    Write-Host "대시보드: https://localhost:8443  (자체서명 인증서 경고는 무시/진행)" -ForegroundColor Green
    Write-Host "토큰: ./cicd/k8s/dashboard/dashboard.ps1 -Token" -ForegroundColor Green
    Write-Host "(Ctrl+C 로 종료)" -ForegroundColor DarkGray
    kubectl -n $Ns port-forward svc/kubernetes-dashboard 8443:443 --address 127.0.0.1
    exit $LASTEXITCODE
}

Write-Host "==> Dashboard 설치" -ForegroundColor Cyan
kubectl apply -f $DashUrl
kubectl apply -f (Join-Path $ScriptDir "admin-user.yaml")

Write-Host "==> rollout 대기" -ForegroundColor Cyan
kubectl -n $Ns rollout status deploy/kubernetes-dashboard --timeout=180s
kubectl -n $Ns rollout status deploy/dashboard-metrics-scraper --timeout=180s

Write-Host ""
Write-Host "=== 로그인 토큰 (24h) ===" -ForegroundColor Yellow
kubectl -n $Ns create token admin-user --duration=24h
Write-Host ""
Write-Host "대시보드: https://localhost:8443  (자체서명 인증서 경고는 무시/진행, Token 방식 로그인)" -ForegroundColor Green
Write-Host "(Ctrl+C 로 종료)" -ForegroundColor DarkGray
kubectl -n $Ns port-forward svc/kubernetes-dashboard 8443:443 --address 127.0.0.1
