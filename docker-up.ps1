# WaffleBear 전체 스택 기동 (Windows / PowerShell)
# 사용법: ./docker-up.ps1            전체 빌드 + 기동
#        ./docker-up.ps1 -Down      중지
#        ./docker-up.ps1 -Logs      로그 추적
param(
    [switch]$Down,
    [switch]$Logs
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

# docker 확인
try { docker compose version | Out-Null } catch {
    Write-Error "docker compose 를 찾을 수 없습니다. Docker Desktop 설치/실행 여부를 확인하세요."
    exit 1
}

if ($Down) {
    docker compose down
    exit $LASTEXITCODE
}

if ($Logs) {
    docker compose logs -f
    exit $LASTEXITCODE
}

# .env 확인
if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Write-Warning ".env 가 없어 .env.example 로 생성합니다. <...> placeholder 값을 채운 뒤 다시 실행하세요."
        Copy-Item ".env.example" ".env"
        exit 1
    } else {
        Write-Error ".env 와 .env.example 둘 다 없습니다."
        exit 1
    }
}

Write-Host "==> 전체 스택 빌드 + 기동" -ForegroundColor Cyan
docker compose up -d --build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

docker compose ps
Write-Host ""
Write-Host "프론트:      http://localhost"        -ForegroundColor Green
Write-Host "백엔드:      http://localhost:8080"   -ForegroundColor Green
Write-Host "MinIO 콘솔:  http://localhost:9001"   -ForegroundColor Green
