# Urumi Store Platform

A Kubernetes-native multi-tenant store provisioning platform that enables on-demand deployment of e-commerce stores (WooCommerce/MedusaJS).

## Quick Start (Local Development)

### Prerequisites
- Docker Desktop
- Node.js 18+
- kubectl
- Helm 3
- Kind

### 1. Install Kind (if not installed)
```bash
# Windows (PowerShell as Admin)
choco install kind

# Or download from: https://kind.sigs.k8s.io/docs/user/quick-start/#installation
```

### 2. Create Local Cluster
```bash
# Create cluster with ingress support
kind create cluster --name urumi-stores --config kind-config.yaml

# Install NGINX Ingress Controller
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

# Ensure ingress controller runs on ingress-ready control-plane node
kubectl patch deployment ingress-nginx-controller -n ingress-nginx --type=merge \
  -p '{"spec":{"template":{"spec":{"nodeSelector":{"kubernetes.io/os":"linux","ingress-ready":"true"}}}}}'

# Wait for ingress controller
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=90s

# Preload runtime images used by dynamically created WooCommerce stores
docker pull mariadb:10.11
docker pull busybox:1.36
docker pull wordpress:cli
kind load docker-image mariadb:10.11 --name urumi-stores
kind load docker-image busybox:1.36 --name urumi-stores
kind load docker-image wordpress:cli --name urumi-stores

# Build and load local WordPress image with WooCommerce pre-bundled
docker build -t store-platform-wordpress-woocommerce:latest -f docker/wordpress-woocommerce/Dockerfile .
kind load docker-image store-platform-wordpress-woocommerce:latest --name urumi-stores
```

### 3. Deploy the Platform
```bash
# Install platform components
helm install store-platform ./helm/store-platform \
  --namespace store-platform \
  -f ./helm/store-platform/values-local.yaml \
  --create-namespace

# Verify deployment
kubectl get pods -n store-platform
```

### 4. Access Dashboard
Open: http://dashboard.localhost

## Creating a Store

1. Open the dashboard
2. Click "Create New Store"
3. Enter store name and select engine (WooCommerce)
4. Wait for status to change to "Ready"
5. Click the store URL to access your store

## Placing an Order (WooCommerce)

1. Open the store URL
2. Open the seeded `Sample Product` and add it to cart
3. Proceed to checkout
4. Complete order using `Cash on delivery` (or `Cheque payments`)
5. Access WooCommerce admin at `/wp-admin` (admin/admin123)
6. View order in WooCommerce > Orders

## Deleting a Store

1. Click the delete button on a store
2. Confirm deletion
3. All resources (namespace, pods, PVCs) are cleaned up

## VPS/Production Deployment (k3s)

See [docs/production-setup.md](docs/production-setup.md) for detailed instructions.

### Quick Overview
```bash
# On VPS, install k3s
curl -sfL https://get.k3s.io | sh -

# Deploy with production values
helm install store-platform ./helm/store-platform -f ./helm/store-platform/values-prod.yaml
```

### Key Differences (Local vs Production)
| Setting | Local | Production |
|---------|-------|------------|
| Ingress | `.localhost` subdomains | Real domain |
| TLS | Disabled | cert-manager |
| Storage | hostPath | local-path-provisioner |
| Replicas | 1 | 2+ |

## Architecture

See [docs/system-design.md](docs/system-design.md) for detailed architecture.

```
┌─────────────────────────────────────────────────────────────┐
│                    Ingress Controller                        │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
        ▼             ▼             ▼
   Dashboard       Backend     Store URLs
   (React)        (Node.js)    (WooCommerce)
                      │
                      ▼
              ┌───────────────┐
              │ Kubernetes    │
              │ API Server    │
              └───────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
   store-abc     store-xyz     store-123
   namespace     namespace     namespace
```

## Project Structure

```
urumi/
├── dashboard/          # React frontend
├── backend/            # Node.js API server
├── helm/
│   ├── store-platform/ # Platform Helm chart
│   └── store-woocommerce/ # Per-store chart
├── scripts/            # Setup scripts
├── docs/               # Documentation
└── kind-config.yaml    # Kind cluster config
```

## License

MIT
