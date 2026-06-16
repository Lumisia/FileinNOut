# Cloudflare Tunnel and Access

This profile uses Cloudflare Tunnel so Jenkins can stay bound to localhost while
the public portfolio domains still use normal HTTPS hostnames.

## Tunnel Setup

Run these on the OCI node after replacing `example.com` with the purchased
domain:

```bash
cloudflared tunnel login
cloudflared tunnel create fileinnout-portfolio
```

Copy `cicd/cloudflare/cloudflared-config.example.yml` to the Cloudflare config
path on the server, then replace the tunnel name, credentials file, and
hostnames.

Create DNS routes:

```bash
cloudflared tunnel route dns fileinnout-portfolio jenkins.example.com
cloudflared tunnel route dns fileinnout-portfolio app.example.com
cloudflared tunnel route dns fileinnout-portfolio api.example.com
cloudflared tunnel route dns fileinnout-portfolio swagger.example.com
cloudflared tunnel route dns fileinnout-portfolio kiali.example.com
cloudflared tunnel route dns fileinnout-portfolio jaeger.example.com
```

Start the tunnel:

```bash
cloudflared tunnel run fileinnout-portfolio
```

For a persistent server, install it as a system service after the config is
confirmed.

## Routing Model

| Hostname | Local service |
|---|---|
| `jenkins.example.com` | `http://localhost:8081` |
| `app.example.com` | `http://localhost:80` |
| `api.example.com` | `http://localhost:80` |
| `swagger.example.com` | `http://localhost:80` |
| `kiali.example.com` | `http://localhost:80` |
| `jaeger.example.com` | `http://localhost:80` |

The k3s ingress decides how to route `app`, `api`, `swagger`, `kiali`, and
`jaeger` after Cloudflare forwards the original hostname.

## Access Policies

Create Cloudflare Access self-hosted applications for these admin surfaces:

- `jenkins.example.com`
- `kiali.example.com`
- `jaeger.example.com`

For a portfolio visitor, create an Allow policy with the visitor email address
or a small list of visitor email addresses. Keep `app`, `api`, and `swagger`
public unless you intentionally want to hide the whole portfolio.

Cloudflare Access is only the first gate. Jenkins still needs Matrix
Authorization, Kiali still needs `view_only_mode: true`, and Jaeger should only
expose the query UI.
