# Observability on OCI k3s

This folder adds the observability layer for the FileInNOut portfolio
deployment on a single OCI 4 OCPU / 24 GiB k3s node.

The goal is to demonstrate a real deployment flow with service mesh,
metrics, topology, and tracing while keeping the node stable.

## Components

| Component | Purpose | Exposure |
|---|---|---|
| Istio ambient | Mesh traffic capture without per-pod sidecars | internal |
| Prometheus | Metrics backend for Kiali and Istio metrics | internal |
| Kiali | Mesh graph and service health UI | public read-only domain |
| Jaeger all-in-one | Request tracing demo | public query UI |

Kiali and Jaeger are intentionally public for this portfolio deployment.
Kiali stays read-only through `deployment.view_only_mode: true`, and Jaeger
exposes only the query UI. Jenkins must remain private and must not be directly
public.

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

These two ingress objects were first applied manually on the cluster. They now
live in this manifest, so a cluster rebuild can restore them with the command
above. Public access is intentional, but keep traces and demo traffic free of
tokens, passwords, private file names, or personal data.

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

Protect `jenkins` with Cloudflare Access, SSH tunneling, or another explicit
authentication layer. Kiali and Jaeger are public by design for the portfolio,
so keep them read-only and keep sensitive data out of traces.

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

## Resource Budget

Recommended requests and limits:

| Component | Request | Limit |
|---|---|---|
| Prometheus | `200m / 512Mi` | `800m / 1Gi` |
| Kiali | `100m / 256Mi` | `300m / 512Mi` |
| Jaeger all-in-one | `100m / 256Mi` | `500m / 768Mi` |

Avoid Elasticsearch, Cassandra, long Prometheus retention, and high trace
sampling on this node.

## OCI Access Point

No OCI access is needed to edit these files. OCI access is needed when you are
ready to install k3s, install Istio/Kiali/Prometheus/Jaeger, register Jenkins
credentials, or point Cloudflare DNS at the node.
