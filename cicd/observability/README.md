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
| Kiali | Mesh graph and service health UI | protected domain |
| Jaeger all-in-one | Request tracing demo | protected domain |

Do not expose Kiali or Jaeger publicly without Cloudflare Access. They are
operator/admin surfaces, not public product pages.

## Install Order

Run these on the OCI node after k3s, kubectl, helm, and istioctl are installed.

### 1. Install Istio ambient with Jaeger tracing provider

```bash
istioctl install \
  --set profile=ambient \
  --set meshConfig.extensionProviders[0].name=jaeger \
  --set meshConfig.extensionProviders[0].opentelemetry.service=jaeger-collector.observability.svc.cluster.local \
  --set meshConfig.extensionProviders[0].opentelemetry.port=4317 \
  -y
```

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

Replace placeholder hosts first:

- `kiali.example.com`
- `jaeger.example.com`

Then apply:

```bash
kubectl apply -f cicd/observability/ingress.yaml
```

## Cloudflare Domain Plan

Common portfolio domains:

| Domain | Use |
|---|---|
| `app.your-domain` | public frontend |
| `api.your-domain` | backend API |
| `swagger.your-domain` | Swagger UI |
| `jenkins.your-domain` | Jenkins UI, protected |
| `kiali.your-domain` | Kiali UI, protected |
| `jaeger.your-domain` | Jaeger UI, protected |

Protect `jenkins`, `kiali`, and `jaeger` with Cloudflare Access or another
authentication layer.

## Visitor Read-only Access

Use Cloudflare Access as the first gate for portfolio visitors:

1. Create self-hosted applications for `jenkins.your-domain`,
   `kiali.your-domain`, and `jaeger.your-domain`.
2. Add an Access policy that includes only the visitor email addresses or the
   allowed email domain.
3. Keep the product-level permissions read-only after Access lets the visitor
   through.

For Kiali, this profile uses:

```yaml
auth:
  strategy: anonymous
deployment:
  view_only_mode: true
```

That means Cloudflare Access decides who can enter, and Kiali itself stays in
read-only mode for anyone who enters. If per-user Kiali identity is needed
later, replace anonymous auth with OIDC or a header-based auth proxy.

For Jaeger, do not create a fake in-app visitor account. Jaeger all-in-one in
this profile does not provide a separate visitor account model. Make it
read-only behind Cloudflare Access: only expose the `jaeger-query` UI, and do
not expose the internal `jaeger-collector` service or OTLP ports publicly. The
current ingress points to `jaeger-query` only.

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
