# Urumi Store Platform
<img width="1600" height="792" alt="image" src="https://github.com/user-attachments/assets/472fd910-4ce9-4d30-8e7e-5d7cb036bf63" />

A Kubernetes-native multi-tenant store provisioning platform that creates isolated e-commerce stores on demand.

## Repository Layout

```text
.
├── backend/                     # Node.js API + orchestration
├── dashboard/                   # React dashboard
├── helm/
│   ├── store-platform/          # Platform chart (dashboard + API)
│   └── store-woocommerce/       # Store chart artifacts/reference
├── scripts/                     # Local setup scripts
├── docs/
│   ├── HLD.md
│   ├── LLD.md
│   ├── system-design.md
│   ├── production-setup.md
│   └── demo-script.md
└── docker/wordpress-woocommerce/# WordPress+Woo custom image definition
```

## Local Setup (Kind)

Prerequisites:
- Docker
- kind
- kubectl
- helm
- Node.js 18+

Fast path:

```bash
./scripts/setup-local.sh
```

Manual path:

```bash
# 1) Create cluster
kind create cluster --name urumi-stores --config kind-config.yaml

# 2) Install ingress-nginx
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
kubectl patch deployment ingress-nginx-controller -n ingress-nginx --type=merge \
  -p '{"spec":{"template":{"spec":{"nodeSelector":{"kubernetes.io/os":"linux","ingress-ready":"true"}}}}}'
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s

# 3) Preload runtime images
docker pull mariadb:10.11
docker pull busybox:1.36
docker pull wordpress:cli
kind load docker-image mariadb:10.11 --name urumi-stores
kind load docker-image busybox:1.36 --name urumi-stores
kind load docker-image wordpress:cli --name urumi-stores

# 4) Build WordPress+Woo runtime image and load
docker build -t store-platform-wordpress-woocommerce:latest -f docker/wordpress-woocommerce/Dockerfile .
kind load docker-image store-platform-wordpress-woocommerce:latest --name urumi-stores

# 5) Build/load platform images
(cd backend && npm run build && docker build --pull=false -t store-platform-api:latest .)
(cd dashboard && npm run build && docker build --pull=false -t store-platform-dashboard:latest .)
kind load docker-image store-platform-api:latest --name urumi-stores
kind load docker-image store-platform-dashboard:latest --name urumi-stores

# 6) Deploy platform
helm upgrade --install store-platform ./helm/store-platform \
  -f ./helm/store-platform/values-local.yaml \
  --namespace ingress-nginx
```

Access:
- Dashboard: `http://dashboard.localhost`
- API: `http://dashboard.localhost/api`

## VPS / Production-like Setup (k3s)

Detailed guide: `docs/production-setup.md`

Minimum path:

```bash
# On VPS
curl -sfL https://get.k3s.io | sh -
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Deploy
helm upgrade --install store-platform ./helm/store-platform \
  -f ./helm/store-platform/values-prod.yaml \
  --create-namespace
```

Production changes vs local:
- real domain + DNS (`*.yourdomain.com`)
- TLS (cert-manager + issuer)
- registry images with pull secrets
- production storage class and backup plan
- stronger secret management strategy

## Create a Store and Place an Order (WooCommerce)

1. Open `http://dashboard.localhost`
2. Create store with engine `woocommerce`
3. Wait until status becomes `ready`
4. Open storefront URL (`http://<store-id>.localhost`)
5. Open `Sample Product`, click `Add to cart`
6. Go to checkout and complete using:
   - `Cash on delivery`, or
   - `Cheque payments`
7. Open admin and verify order:
   - URL: `http://<store-id>.localhost/wp-admin`
   - Username: `admin`
   - Password: `admin123`
   - Menu: WooCommerce -> Orders

## System Design & Tradeoffs (Short)

Architecture choice:
- Namespace-per-store isolation, platform API orchestrates Kubernetes resources directly.

Idempotency / failure / cleanup:
- Resource creation handles common idempotent conflicts (`already exists`).
- Provisioning is step-based with explicit waits and timeout-driven failure states.
- Store deletion is namespace deletion for strong cleanup guarantees.

What changes for production:
- DNS/domain, ingress/tls, storage class, secret strategy, image registry policies, scaling/HA values.

See:
- [High Level Design (HLD)](docs/HLD.md)
- [Low Level Design (LLD)](docs/LLD.md)
- [System Design](docs/system-design.md)

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Connect with me

If you'd like to connect, feel free to reach out — [Click here](https://minianonlink.vercel.app/tusharbhardwaj)




