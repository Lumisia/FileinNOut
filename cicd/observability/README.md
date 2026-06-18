# Observability on OCI k3s

This folder adds the observability layer for the FileInNOut portfolio
deployment on a single OCI 4 OCPU / 24 GiB k3s node.

The goal is to demonstrate a real deployment flow with service mesh,
metrics, topology, and tracing while keeping the node stable.

## Components

| Component | Purpose | Exposure |
|---|---|---|
| Istio ambient | Mesh traffic capture without per-pod sidecars | internal |
| Prometheus | Metrics backend for Kiali, Grafana, and Istio metrics | public status/query UI |
| Grafana | Dashboards over Prometheus/Jaeger | public read-only (anonymous Viewer) + admin curation |
| Kiali | Mesh graph and service health UI | public read-only domain |
| Jaeger all-in-one | Request tracing demo | public query UI |
| Kubernetes Dashboard | Cluster/workload viewer | public read-only (view RBAC) |

Kiali, Jaeger, Prometheus, and the Kubernetes Dashboard are intentionally
public for this portfolio deployment. Kiali uses
`deployment.view_only_mode: true`, Prometheus exposes status/query pages with
admin and lifecycle APIs disabled by default, and the Kubernetes Dashboard is
bound to the built-in `view` ClusterRole. Grafana shows dashboards read-only to
anonymous visitors (Viewer role), and the generated admin login is for curating
dashboards. Jenkins must remain private and must not be directly public.

## Install Order

Run these on the OCI node after k3s, kubectl, helm, and istioctl are installed.

### 1. Install Istio ambient with Jaeger tracing provider

```bash
istioctl install \
  --set profile=ambient \
  --set values.cni.cniBinDir=/var/lib/rancher/k3s/data/cni \
  --set values.cni.cniConfDir=/var/lib/rancher/k3s/agent/etc/cni/net.d \
  --set meshConfig.extensionProviders[0].name=jaeger \
  --set meshConfig.extensionProviders[0].opentelemetry.service=jaeger-collector.observability.svc.cluster.local \
  --set meshConfig.extensionProviders[0].opentelemetry.port=4317 \
  -y
```

k3s stores CNI binaries and config under `/var/lib/rancher/k3s`, so the CNI
paths above are required for Istio ambient on this OCI node.

### 2. Create observability namespace and Jaeger

```bash
kubectl apply -f cicd/observability/namespace.yaml
kubectl apply -f cicd/observability/jaeger-all-in-one.yaml
```

Jaeger uses in-memory storage in this profile. It is enough to show traces in a
portfolio demo, but it is not a durable tracing backend.

### 3. Install Prometheus

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm upgrade --install prometheus prometheus-community/prometheus \
  --namespace observability \
  --create-namespace \
  -f cicd/observability/values-prometheus-k3s.yaml
```

Prometheus retention is intentionally short (`6h`) to protect the single node.

### 4. Enable tracing telemetry

```bash
kubectl apply -f cicd/observability/istio-telemetry.yaml
```

### 5. Install Kiali

```bash
helm repo add kiali https://kiali.org/helm-charts
helm repo update

helm upgrade --install kiali-operator kiali/kiali-operator \
  --namespace kiali-operator \
  --create-namespace \
  -f cicd/observability/values-kiali-operator-k3s.yaml
```

### 6. Add application namespace to ambient mesh

```bash
kubectl label namespace fileinnout istio.io/dataplane-mode=ambient --overwrite
```

Restart application pods after labeling the namespace:

```bash
kubectl rollout restart deployment -n fileinnout
```

### 7. Expose Kiali and Jaeger after Cloudflare DNS is ready

This manifest contains the current FileInNOut portfolio hosts:

- `kiali.fileinnout.com`
- `jaeger.fileinnout.com`

Then apply:

```bash
kubectl apply -f cicd/observability/ingress.yaml
```

Kiali serves under `web_root: /kiali`, so the Kiali ingress carries
`nginx.ingress.kubernetes.io/app-root: /kiali`. That redirects the bare host
(`https://kiali.<domain>/`) to the Kiali app instead of returning 404. Jaeger
`jaeger-query` serves at root, so no rewrite is needed.

These ingress objects were first applied manually on the cluster. They now
live in this manifest, so a cluster rebuild can restore them with the command
above. Public access is intentional, but keep traces and demo traffic free of
tokens, passwords, private file names, or personal data.

The same `ingress.yaml` also publishes the portfolio dashboards:

- `grafana.fileinnout.com` -> `grafana` (observability)
- `prometheus.fileinnout.com` -> `prometheus-server` (observability)
- `dashboard.fileinnout.com` -> `kubernetes-dashboard` (HTTPS backend)

### 8. Install Grafana

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

helm upgrade --install grafana grafana/grafana \
  --namespace observability \
  --create-namespace \
  -f cicd/observability/values-grafana-k3s.yaml
```

Grafana reuses the running Prometheus, so it adds no scrape load. Anonymous
access is disabled; use the generated `admin` account to create and curate
portfolio dashboards. The admin password is generated into a Secret:

```bash
kubectl -n observability get secret grafana -o jsonpath="{.data.admin-password}" | base64 -d
```

### 9. Make the Kubernetes Dashboard read-only

```bash
kubectl apply -f cicd/observability/dashboard-readonly-rbac.yaml
```

The Dashboard is bound to the built-in `view` ClusterRole, which excludes
Secrets. `dashboard-readonly-rbac.yaml` also creates the long-lived
`dashboard-viewer-token` Secret for portfolio visitors:

```bash
kubectl -n kubernetes-dashboard get secret dashboard-viewer-token -o jsonpath="{.data.token}" | base64 -d
```

Keep sensitive values in k8s Secrets, never in ConfigMaps, because ConfigMaps
are visible to `view`.

## Cloudflare Domain Plan

Common portfolio domains:

| Domain | Use |
|---|---|
| `lumisia.fileinnout.com` | public frontend |
| `api.fileinnout.com` | backend API |
| `swagger.fileinnout.com` | Swagger UI |
| `jenkins.fileinnout.com` | Jenkins UI, private/protected only |
| `kiali.fileinnout.com` | public Kiali read-only UI |
| `jaeger.fileinnout.com` | public Jaeger query UI |
| `grafana.fileinnout.com` | Grafana login for dashboard curation |
| `prometheus.fileinnout.com` | public Prometheus target/status UI |
| `dashboard.fileinnout.com` | public Kubernetes Dashboard, read-only |

Protect `jenkins` with Cloudflare Access, SSH tunneling, or another explicit
authentication layer. Kiali, Jaeger, Grafana, Prometheus, and the Kubernetes
Dashboard are public by design for the portfolio, so keep them read-only and
keep sensitive data out of traces, dashboards, and ConfigMaps.

## Visitor Read-only Access

Use Cloudflare Access as the first gate for Jenkins visitors:

1. Create a self-hosted application for `jenkins.fileinnout.com`.
2. Add an Access policy that includes only the visitor email addresses or the
   allowed email domain.
3. Keep Jenkins permissions read-only after Access lets the visitor through.

For Kiali, this profile uses:

```yaml
auth:
  strategy: anonymous
deployment:
  view_only_mode: true
```

That means Kiali is public but cannot be used to change mesh resources through
the UI. If per-user Kiali identity is needed later, put it behind Cloudflare
Access and replace anonymous auth with OIDC or a header-based auth proxy.

For Jaeger, do not create a fake in-app visitor account. Jaeger all-in-one in
this profile does not provide a separate visitor account model. Public access
is limited to the `jaeger-query` UI; do not expose the internal
`jaeger-collector` service or OTLP ports publicly. The current ingress points
to `jaeger-query` only.

For Grafana, anonymous access is disabled. Use the generated `admin` account to
build dashboards, snapshots, or screenshots for the portfolio. The password
lives in the generated `grafana` Secret (never in this repo).

For Prometheus, there is no user/role model. The UI is read-only by default
(admin API and lifecycle endpoints stay disabled), so "visitor account" does
not apply; the only control is who can reach the host. The public ingress sends
the bare host to `/targets`, which is more useful for a portfolio than a blank
query page because it shows scrape health immediately. Limit reach with
Cloudflare Access if needed, and remember the query UI exposes internal target
addresses, service names, and label cardinality.

For the Kubernetes Dashboard, the visitor identity is a read-only
ServiceAccount bound to the built-in `view` ClusterRole (excludes Secrets) via
`dashboard-readonly-rbac.yaml`. The long-lived token is stored in the
`dashboard-viewer-token` Secret for portfolio publishing. Keep secrets in k8s
Secrets, not ConfigMaps, since `view` can read ConfigMaps.

## Resource Budget

Recommended requests and limits:

| Component | Request | Limit |
|---|---|---|
| Prometheus | `200m / 512Mi` | `800m / 1Gi` |
| Grafana | `100m / 128Mi` | `200m / 256Mi` |
| Kiali | `100m / 256Mi` | `300m / 512Mi` |
| Jaeger all-in-one | `100m / 256Mi` | `500m / 768Mi` |

Avoid Elasticsearch, Cassandra, long Prometheus retention, and high trace
sampling on this node.

## OCI Access Point

No OCI access is needed to edit these files. OCI access is needed when you are
ready to install k3s, install Istio/Kiali/Prometheus/Jaeger, register Jenkins
credentials, or point Cloudflare DNS at the node.
