# Jenkins on OCI

This profile runs Jenkins as a host Docker container and deploys into the local
k3s cluster. Jenkins is intentionally outside the application Helm chart so the
CI controller can survive app redeploys.

## Start Jenkins

Run on the OCI node after Docker is installed:

```bash
docker compose -f cicd/jenkins/docker-compose.oci.yml up -d --build
```

Get the first setup password:

```bash
docker compose -f cicd/jenkins/docker-compose.oci.yml exec jenkins \
  cat /var/jenkins_home/secrets/initialAdminPassword
```

The Compose file binds Jenkins to `127.0.0.1:8081`. Do not expose port 8081 directly
to the internet. Publish it through Cloudflare Tunnel and protect it with
Cloudflare Access.

## Required Jenkins Setup

Install steps after the first login:

1. Confirm the bundled plugins are installed.
2. Create the admin user.
3. Install or verify the Matrix Authorization Strategy plugin.
4. Create the deployment Pipeline job from SCM:
   - Repository: `https://github.com/Lumisia/FileinNOut.git`
   - Branch: `main`
   - Script path: `Jenkinsfile`
5. Add the GitHub webhook:
   - `https://jenkins.example.com/github-webhook/`
6. Keep the Pipeline configured to disable concurrent builds. The Jenkinsfile
   already calls `disableConcurrentBuilds()`.

## Credentials

Create these credentials before the first deploy:

| ID | Type | Purpose |
|---|---|---|
| `dockerhub-lumisia` | Username with password | Push images to Docker Hub |
| `oci-k3s-kubeconfig` | Secret file | Deploy to the k3s cluster |
| `fileinnout-values-private` | Secret file | Private Helm values |

The private values file should contain only runtime secrets and domain-specific
values that must not be committed.

## Visitor Account

Use Cloudflare Access for the visitor gate. Inside Jenkins, use Matrix
Authorization and grant visitor users only:

- `Overall/Read`
- `Job/Read`
- `View/Read`

Do not grant build, configure, delete, credential, agent, or administrator
permissions to visitor users.

## Docker Socket Risk

This profile mounts `/var/run/docker.sock` so Jenkins can build and push Docker
images. Treat the Jenkins admin account as root-equivalent on the OCI node.
Cloudflare Access and Jenkins permissions are mandatory for this setup.
