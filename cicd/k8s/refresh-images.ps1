# 로컬 이미지 재빌드 → Docker Desktop kind 노드에 주입 → k8s rollout
# 사용법: ./cicd/k8s/refresh-images.ps1 [-Apps backend,frontend,websocket-server]
#   -Apps 생략 시 전체.
#
# 배경: Docker Desktop k8s 는 kind 모드(노드가 별도 containerd)라 로컬 빌드 이미지를
# 직접 못 본다. 노드에 ctr import 로 주입한다. imagePullPolicy: IfNotPresent + :latest 는
# 옛 이미지(특히 Hub pull 본)를 캐시로 재사용하므로, 주입 전 노드의 해당 이미지 ref 를
# 전부 제거(clean-slate)한 뒤 import 해야 새 콘텐츠가 확실히 반영된다.
param(
    [string[]]$Apps = @("backend", "frontend", "websocket-server")
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Ns       = "waffle"
$Node     = "desktop-control-plane"   # Docker Desktop kind 노드 컨테이너

$Img = @{ "backend" = "lumisia/backend"; "frontend" = "lumisia/frontend"; "websocket-server" = "lumisia/websocket-server" }
$Svc = @{ "backend" = "backend-app";     "frontend" = "frontend";        "websocket-server" = "websocket-server" }
$Dep = $Svc  # deployment·container 이름 == service 이름

kubectl config use-context docker-desktop | Out-Null

Write-Host "==> 이미지 빌드: $($Apps -join ', ')" -ForegroundColor Cyan
$svcs = $Apps | ForEach-Object { $Svc[$_] }
Push-Location $RepoRoot
try { docker compose build @svcs } finally { Pop-Location }

foreach ($a in $Apps) {
    $img = "$($Img[$a]):latest"; $dep = $Dep[$a]
    Write-Host "==> [$a] 노드 기존 ref 제거" -ForegroundColor Cyan
    $refs = (docker exec $Node ctr -n k8s.io images ls -q) | Where-Object { $_ -match [regex]::Escape($Img[$a]) + '(:|@)' }
    foreach ($r in $refs) { docker exec $Node ctr -n k8s.io images rm $r 2>&1 | Out-Null }
    Write-Host "==> [$a] 노드로 import: $img" -ForegroundColor Cyan
    docker save $img | docker exec -i $Node ctr -n k8s.io images import --digests=true - | Out-Null
    Write-Host "==> [$a] rollout restart" -ForegroundColor Cyan
    kubectl -n $Ns rollout restart "deploy/$dep"
}

foreach ($a in $Apps) { kubectl -n $Ns rollout status "deploy/$($Dep[$a])" --timeout=240s }
Write-Host "==> 완료. Pod imageID:" -ForegroundColor Green
foreach ($a in $Apps) {
    $p = kubectl -n $Ns get pod -l "app=$($Dep[$a])" --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}'
    $iid = kubectl -n $Ns get pod $p -o jsonpath='{.status.containerStatuses[0].imageID}'
    Write-Host "  $($Dep[$a]): $iid"
}
