# Demo Script (Video Walkthrough)

Use this script as a recording checklist. It is aligned to assignment requirements.

## 0. Prep (before recording)

- Ensure cluster is up and platform is deployed.
- Open terminals:
  - Terminal A: commands/observability
  - Browser: dashboard + storefront + admin
- Keep these paths ready to show:
  - `docs/HLD.md`
  - `docs/LLD.md`
  - `README.md`

## 1. System Design & Implementation (2-3 min)

1. Open `docs/HLD.md` and explain:
   - components: dashboard, API, ingress, per-store namespace resources
   - responsibilities of each component
2. Open `docs/LLD.md` and explain:
   - provisioning flow implementation in `storeService`/`k8sService`
   - Woo bootstrap job and readiness gates

## 2. End-to-End Flow Demo (4-6 min)

1. Open dashboard: `http://dashboard.localhost`
2. Create store (`woocommerce`) from UI.
3. In Terminal A, show resource creation:
   - `kubectl get ns | rg '^store-'`
   - `kubectl get all -n store-<id>`
   - `kubectl get jobs -n store-<id>`
4. Wait for status `ready` in dashboard.
5. Open storefront URL and show:
   - site loads
   - `Sample Product` exists
   - add to cart
6. Go to checkout and show:
   - checkout page
   - payment options include COD/Cheque
7. Place order (COD).
8. Open admin:
   - `http://<store-id>.localhost/wp-admin`
   - login: `admin / admin123`
   - WooCommerce -> Orders, show newly created order.
9. Delete store from dashboard.
10. Show cleanup:
   - `kubectl get ns | rg 'store-<id>'` (should be gone shortly)

## 3. Isolation, Resources, Reliability (2-3 min)

Show and explain:
- Isolation:
  - namespace-per-store
  - separate secrets/PVCs/services/ingress
- Resource controls:
  - `kubectl get resourcequota,limitrange -n store-<id>`
  - requests/limits in pod specs
- Reliability:
  - idempotent creates (`409` handling)
  - provisioning steps + timeouts + `failed` state
  - cleanup by namespace deletion

## 4. Security Posture (2-3 min)

Show and explain:
- Secret handling:
  - `kubectl get secret -n store-<id>`
- RBAC:
  - `kubectl get clusterrole store-platform-provisioner -o yaml`
  - least privilege intent and `batch/jobs` for bootstrap
- Exposure model:
  - public: ingress hosts
  - internal: DB service/private resources
- Container hardening:
  - API non-root/security context via Helm templates

## 5. Horizontal Scaling Plan (1-2 min)

Explain:
- What scales horizontally:
  - dashboard + API (stateless)
- Provisioning throughput:
  - scale API replicas; future queue/worker model
- Stateful constraints:
  - per-store DB/PVC and handling approach

## 6. Abuse Prevention / Guardrails (1-2 min)

Explain and show:
- Namespace quotas/limits as blast-radius control
- Provisioning timeouts and explicit failed state
- Action/event logs in API (or store events endpoint)
- Mention future: rate limiting + per-user quotas

## 7. Local -> VPS Story + Helm Ops (2-3 min)

1. Show `README.md` sections for local and VPS.
2. Show `docs/production-setup.md`.
3. Explain values differences:
   - local vs prod ingress/domain/tls/storage/imagePullPolicy/secrets
4. Show Helm upgrade/rollback commands:
   - `helm upgrade ...`
   - `helm rollback ...`

## 8. Suggested Closing Statement (30 sec)

"Round 1 fully implements WooCommerce provisioning and order flow end-to-end. Medusa is intentionally stubbed, and the engine abstraction is already in place for adding it next."

