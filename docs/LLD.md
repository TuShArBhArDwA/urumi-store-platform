# Low-Level Design (LLD)

## 1. Code Modules

## `backend/src/services/storeService.ts`
- Entry point for store lifecycle:
  - `createStore`
  - `deleteStore`
  - `listStores`
- Engine dispatch:
  - `provisionWooCommerce` (implemented)
  - `provisionMedusa` (stub)
- Status state machine:
  - `pending -> provisioning -> ready | failed`

## `backend/src/services/k8sService.ts`
- Kubernetes API wrapper:
  - Namespace, quota, limits, secret, PVC
  - MariaDB StatefulSet/Service
  - WordPress Deployment/Service
  - Ingress creation
  - Woo bootstrap Job creation + wait
- Wait helpers:
  - `waitForStatefulSetReady`
  - `waitForDeploymentReady`
  - `waitForJobCompletion`

## `helm/store-platform`
- Deploys dashboard + API and their ingress/services/config/rbac.
- Local/production behavior controlled through values files.

## 2. Provisioned Store Resources

Per store namespace (`store-<id>`):
- `Secret`: `mariadb-secret`
- `PVC`: `mariadb-data`
- `StatefulSet`: `mariadb`
- `Service`: `mariadb` (headless)
- `PVC`: `wordpress-data`
- `Deployment`: `wordpress`
- `Service`: `wordpress`
- `Ingress`: `store-ingress`
- `Job`: `woocommerce-bootstrap-<id>`
- `ResourceQuota`: `store-quota`
- `LimitRange`: `store-limits`

## 3. WooCommerce Bootstrap Job Logic

1. Wait for `wp-config.php`.
2. Ensure WordPress installed (`wp core install` retry loop if needed).
3. Verify WooCommerce plugin exists in bundled image.
4. Activate WooCommerce.
5. Seed `Sample Product` if catalog is empty.
6. Configure checkout-friendly options:
   - guest checkout
   - COD
   - Cheque payments
7. Flush rewrite rules.

Failure in this job marks store as `failed`.

## 4. Idempotency and Failure Handling

- API handles `409 AlreadyExists` for several resource creates.
- Store provisioning is step-based; any failure sets `failed` + error message.
- Readiness is not inferred from polling-only checks; provisioning flow controls final `ready`.
- Cleanup uses namespace deletion (cascading all owned resources).

## 5. Security and RBAC Details

ClusterRole includes:
- core resources: namespaces, pods, secrets, services, PVCs, quotas, limits, events
- apps: deployments/statefulsets
- networking: ingresses
- batch: jobs

This enables least-required provisioning actions for each store namespace.

## 6. Store Traffic Routing

- Platform ingress host: `dashboard.localhost`
  - `/` -> dashboard service
  - `/api` -> platform API service

- Per-store ingress host: `<store-id>.localhost`
  - `/` -> store `wordpress` service

## 7. Runtime Images (Local)

- `store-platform-api:latest`
- `store-platform-dashboard:latest`
- `mariadb:10.11`
- `busybox:1.36`
- `wordpress:cli`
- `store-platform-wordpress-woocommerce:latest`

The custom WordPress image includes:
- bundled WooCommerce plugin
- vendored WordPress core overlay (6.8) to satisfy WooCommerce minimum version

