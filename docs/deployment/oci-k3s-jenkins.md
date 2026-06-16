# OCI k3s Jenkins Deployment

This profile targets a single OCI node with 4 OCPU and 24 GiB RAM. It is a
portfolio deployment that keeps the production deployment flow while excluding
high-availability features that do not fit the budget.

## Runtime Shape

- Kubernetes distribution: k3s single node
- CI/CD: Jenkins detects pushes to `main`
- Image tags: first 12 characters of the Git commit SHA
- Deployment: Helm upgrade with standard Kubernetes Deployments
- Rollout behavior: Kubernetes rolling update
- StorageClass: `local-path`
- App runtime services: frontend, backend, websocket, MariaDB, Redis, MinIO
- Disabled for this profile: Argo Rollouts, Longhorn, Redis Sentinel, HPA

## Jenkins Flow

1. GitHub sends a webhook to Jenkins on `main` push.
2. Jenkins checks out `main`.
3. Jenkins sets `IMAGE_TAG` from `GIT_COMMIT.take(12)`.
4. Jenkins builds and pushes:
   - `lumisia/backend:${IMAGE_TAG}`
   - `lumisia/frontend:${IMAGE_TAG}`
   - `lumisia/websocket-server:${IMAGE_TAG}`
5. Jenkins runs `helm upgrade --install` with:
   - `cicd/helm/values.yaml`
   - `cicd/helm/values-oci-k3s.yaml`
   - private values from Jenkins credentials
6. Helm sets the three image tags to `${IMAGE_TAG}`.
7. Kubernetes updates pods through rolling updates.

Do not deploy by overwriting only `latest`. Kubernetes may not restart pods when
the manifest image tag does not change.

## Jenkins Credentials

Create these Jenkins credentials before enabling the job:

| ID | Type | Purpose |
|---|---|---|
| `dockerhub-lumisia` | Username with password | Docker Hub push access |
| `oci-k3s-kubeconfig` | Secret file | kubeconfig for the OCI k3s cluster |
| `fileinnout-values-private` | Secret file | Helm private values with secrets |

The Jenkins agent must have:

- `git`
- `docker`
- Docker Compose v2
- `helm`
- `kubectl`
- access to the Docker daemon

On the OCI node, call out before installing Jenkins or wiring the kubeconfig.
That is the point where cloud access is required.

Install k3s with Traefik disabled and include `host.docker.internal` in the API
server TLS SANs. Jenkins runs in Docker, so its kubeconfig should point at
`https://host.docker.internal:6443` instead of `https://127.0.0.1:6443`.

The reproducible Jenkins controller profile lives in `cicd/jenkins`:

```bash
docker compose -f cicd/jenkins/docker-compose.oci.yml up -d --build
```

It builds a Jenkins image with Docker CLI, Docker Compose, Helm, kubectl, and
the required Pipeline/GitHub/Matrix Authorization plugins.

## Cloudflare DNS Plan

Replace the placeholders in `cicd/helm/values-oci-k3s.yaml` when domains are
ready.

| Domain | Target |
|---|---|
| `app.example.com` | Frontend site |
| `api.example.com` | Backend API and realtime HTTP endpoints |
| `swagger.example.com` | Backend Swagger UI and OpenAPI docs |
| `jenkins.example.com` | Jenkins UI, usually outside this app Helm chart |
| `kiali.example.com` | Kiali UI, installed with the Istio/Kiali stack |
| `jaeger.example.com` | Jaeger tracing UI, installed with the observability stack |

Suggested public URLs:

- Site: `https://app.example.com`
- API: `https://api.example.com/api`
- Swagger: `https://swagger.example.com/swagger-ui/index.html`
- Kiali: `https://kiali.example.com`
- Jaeger: `https://jaeger.example.com`

Protect `jenkins.example.com`, `kiali.example.com`, and `jaeger.example.com`
with Cloudflare Access or an equivalent authentication layer. These are operator
surfaces, not public product pages.

If using Cloudflare Tunnel, start from
`cicd/cloudflare/cloudflared-config.example.yml`. Jenkins routes to
`localhost:8081`; app, API, Swagger, Kiali, and Jaeger route through the local
k3s ingress on `localhost:80`.

## Visitor Read-only Accounts

Use Cloudflare Access in front of `jenkins.example.com`, `kiali.example.com`,
and `jaeger.example.com` so only approved visitor emails can reach those tools.
After that, still keep each tool read-only.

For Jenkins:

1. Install the Matrix Authorization Strategy plugin.
2. Keep Jenkins' own user database or another explicit security realm enabled.
3. Create a `visitor` user, or create one visitor user per reviewer.
4. In Matrix Authorization, grant the visitor only:
   - `Overall/Read`
   - `Job/Read`
   - `View/Read`
5. Do not grant `Overall/Administer`, `Job/Build`, `Job/Configure`,
   `Job/Delete`, `Credentials/*`, or `Agent/*`.

This lets visitors see the Jenkins dashboard and job history without starting a
deployment, editing a pipeline, or reading deployment secrets.

For Kiali, keep Cloudflare Access enabled and set `deployment.view_only_mode:
true` in `cicd/observability/values-kiali-operator-k3s.yaml`. This profile uses
Kiali anonymous auth behind Access, so the visitor account lives at Cloudflare
Access and Kiali itself stays read-only.

For Jaeger, use Cloudflare Access instead of an in-app visitor account. Jaeger
all-in-one does not provide a separate visitor account in this profile. Only
expose the `jaeger-query` UI service, and do not expose the `jaeger-collector`
service or OTLP ports to the public internet.

## Observability Stack

Install the observability layer from `cicd/observability` after k3s is ready and
before using Kiali:

1. Istio ambient with a Jaeger OpenTelemetry provider
2. Prometheus with short retention
3. Jaeger all-in-one with memory storage
4. Kiali operator
5. Cloudflare-protected ingress for Kiali and Jaeger

Follow: `cicd/observability/README.md`
- Jenkins: `https://jenkins.example.com`

## Helm Command

Jenkins runs the same shape as this command:

```bash
helm upgrade --install fileinnout ./cicd/helm \
  --namespace fileinnout \
  --create-namespace \
  -f cicd/helm/values.yaml \
  -f cicd/helm/values-oci-k3s.yaml \
  -f values.private.yaml \
  --set-string backend.image.tag="$IMAGE_TAG" \
  --set-string frontend.image.tag="$IMAGE_TAG" \
  --set-string websocket.image.tag="$IMAGE_TAG" \
  --wait \
  --timeout 10m
```

## Resource Notes

The profile is intentionally small. Jenkins builds should run with concurrency
set to 1. Do not run heavy load tests, Argo Rollouts, Longhorn, and Jenkins
Docker builds concurrently on the same 4 OCPU node.

MinIO is deployed inside the app namespace for the portfolio profile because
the backend defaults to the `minio` storage provider. Keep the MinIO service
internal; expose only the frontend, API, Swagger, Jenkins, Kiali, and Jaeger
domains.
