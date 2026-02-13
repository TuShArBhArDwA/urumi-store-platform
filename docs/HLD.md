# High-Level Design (HLD)

## 1. Goal
Build a Kubernetes-native multi-tenant platform that can provision isolated e-commerce stores on demand, starting with WooCommerce (fully implemented) and keeping the architecture extensible for Medusa.

## 2. Top-Level Architecture

```
Internet
   |
NGINX Ingress
   |
   +-- dashboard.localhost          -> Dashboard (React)
   +-- dashboard.localhost/api      -> Platform API (Node.js)
   +-- <store-id>.localhost         -> Storefront (WordPress/WooCommerce)

store-platform namespace:
  - store-platform-dashboard (Deployment)
  - store-platform-api (Deployment)
  - store-platform ServiceAccount + ClusterRoleBinding

per-store namespace (store-<id>):
  - mariadb (StatefulSet + PVC + Service)
  - wordpress (Deployment + PVC + Service)
  - store-ingress (Ingress)
  - woocommerce-bootstrap-<id> (Job, one-time setup)
  - ResourceQuota + LimitRange
```

## 3. Components and Responsibilities

- Dashboard:
  - Create/list/delete stores
  - Show store status (`pending`, `provisioning`, `ready`, `failed`)
  - Open storefront/admin URLs

- Platform API:
  - Orchestrates provisioning lifecycle
  - Creates K8s resources via official client
  - Tracks status/events
  - Performs engine-specific bootstrap

- Kubernetes:
  - Isolation boundary (namespace per store)
  - Resource governance (quota/limits)
  - Storage persistence (PVCs)
  - Ingress routing

- Woo bootstrap job:
  - Initializes WordPress admin
  - Activates WooCommerce
  - Seeds sample product
  - Enables checkout-friendly payment methods (COD/Cheque)

## 4. Request/Provisioning Flow

1. User creates store via dashboard.
2. API creates `store-<id>` namespace.
3. API applies quota + limit range.
4. API deploys MariaDB, waits ready.
5. API deploys WordPress (Woo-ready image), creates store ingress.
6. API waits WordPress ready.
7. API runs Woo bootstrap job, waits successful completion.
8. API marks store `ready`.

## 5. Isolation and Reliability Strategy

- Isolation:
  - Namespace-per-store
  - Dedicated secrets/PVCs/services/ingress per store

- Reliability:
  - Idempotent create behavior for many resources (`409` handled)
  - Explicit wait loops for StatefulSet/Deployment/Job readiness
  - Timeouts convert to controlled `failed` state
  - Namespace deletion for deterministic cleanup

## 6. Security Posture (High-Level)

- Platform API runs with dedicated ServiceAccount.
- RBAC grants only required resource verbs (including `batch/jobs` for bootstrap).
- Secrets stored in K8s Secret objects, never exposed in API payloads.
- API container hardened (non-root, restricted security context).

## 7. Horizontal Scaling Plan

- Dashboard/API are stateless and horizontally scalable.
- Provisioning throughput scales with API replicas (or can move to queue-based workers).
- Stateful components (per-store DB/PVC) remain single-instance by default.

## 8. Local vs VPS/Production Differences

- Local:
  - `kind`
  - `.localhost` domains
  - Local preloaded images
  - TLS typically disabled

- VPS (k3s):
  - Real DNS (`*.yourdomain.com`)
  - Public ingress + TLS (`cert-manager`)
  - Registry-pulled images
  - Stronger secret management and backups

