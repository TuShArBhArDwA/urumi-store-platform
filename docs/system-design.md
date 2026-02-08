# System Design & Tradeoffs

## Architecture Overview

The Urumi Store Platform is a Kubernetes-native multi-tenant store provisioning system designed to run identically on local development (Kind) and production (k3s/VPS) environments.

```
┌─────────────────────────────────────────────────────────────────┐
│                     NGINX Ingress Controller                     │
│            (Handles routing to dashboard, API, stores)           │
└─────────────────┬──────────────────────┬───────────────────────┘
                  │                      │
    ┌─────────────▼──────────┐   ┌──────▼──────────────────────┐
    │   store-platform NS    │   │     store-abc123 NS         │
    │  ┌──────────────────┐  │   │  ┌─────────────────────────┐│
    │  │ Dashboard (React)│  │   │  │ WordPress + WooCommerce ││
    │  └──────────────────┘  │   │  └─────────────────────────┘│
    │  ┌──────────────────┐  │   │  ┌─────────────────────────┐│
    │  │ API (Node.js)    │──┼───┤  │ MariaDB (StatefulSet)   ││
    │  └──────────────────┘  │   │  └─────────────────────────┘│
    │  ServiceAccount + RBAC │   │  ResourceQuota + LimitRange │
    └────────────────────────┘   └─────────────────────────────┘
```

## Key Design Decisions

### 1. Namespace-per-Store Isolation

**Decision**: Each store gets its own Kubernetes namespace (`store-{id}`).

**Why**:
- Strong resource isolation between tenants
- Clean deletion (delete namespace = delete all resources)
- Per-namespace ResourceQuota and LimitRange
- Easy to apply NetworkPolicies per store
- Clear audit trail of resources

**Tradeoff**: More namespaces to manage, but Kubernetes handles this well.

### 2. Programmatic K8s Resource Creation (Not Helm CLI)

**Decision**: The backend creates Kubernetes resources directly via the K8s API client, not by shelling out to `helm install`.

**Why**:
- Better error handling and status tracking
- No Helm CLI dependency in the container
- Programmatic control over resource creation order
- Can track each step's status for detailed provisioning updates

**Tradeoff**: More code, but more control and reliability.

### 3. WooCommerce as Primary Engine

**Decision**: Fully implement WooCommerce (WordPress), stub MedusaJS.

**Why**:
- WooCommerce is battle-tested on Kubernetes
- Simpler architecture (single container + MySQL)
- More documentation and community support
- Faster to implement for demo purposes

**Architecture extensibility**: The `StoreService` has engine-specific methods (`provisionWooCommerce`, `provisionMedusa`) making it straightforward to add new engines.

### 4. In-Memory Store Registry

**Decision**: Store metadata is kept in memory (not a database).

**Why**:
- Simpler for demo purposes
- Stores are also tracked in Kubernetes (source of truth)
- Easy to extend to SQLite/PostgreSQL later

**Production upgrade**: Add SQLite or PostgreSQL for persistence. The API interface remains identical.

### 5. nip.io for Local DNS

**Decision**: Use `*.127.0.0.1.nip.io` for local development instead of modifying `/etc/hosts`.

**Why**:
- Works without admin/root privileges
- No hosts file modifications needed
- Automatic wildcard DNS for dynamic store URLs
- Demonstrates production-like domain routing

---

## Idempotency & Failure Handling

### Idempotent Resource Creation

All Kubernetes resource creation checks for existing resources:
```typescript
try {
  await this.coreApi.createNamespace({ ... });
} catch (error) {
  if (error.response?.statusCode === 409) {
    // Already exists, continue
    return;
  }
  throw error;
}
```

### Provisioning Failure Recovery

1. **Status tracking**: Each store has a status field (`pending`, `provisioning`, `ready`, `failed`)
2. **Event logging**: All provisioning steps are logged as events
3. **Error capture**: Failed stores capture the error message for debugging
4. **Retry safety**: Re-creating a store with same parameters is safe

### Cleanup Guarantees

Deleting a store:
1. Sets status to `deleting`
2. Deletes the entire namespace (cascading delete of all resources)
3. Removes from in-memory registry

If deletion fails mid-way, the namespace label (`store-platform/type: store`) allows identification and manual cleanup.

---

## What Changes for Production

| Aspect | Local (Kind) | Production (k3s/VPS) |
|--------|--------------|----------------------|
| **Cluster** | Kind in Docker | k3s on VPS |
| **Ingress** | NGINX + nip.io | NGINX + real domain |
| **TLS** | None | cert-manager + Let's Encrypt |
| **DNS** | `*.127.0.0.1.nip.io` | `*.yourdomain.com` |
| **Storage Class** | `standard` (hostPath) | `local-path` or cloud |
| **Secrets** | Generated at deploy | External Secrets/Vault |
| **Replicas** | 1 | 2+ for HA |
| **Image Pull** | `Never` (local) | `Always` from registry |

### Helm Values Differences

```yaml
# values-local.yaml
ingress:
  hosts:
    dashboard: dashboard.127.0.0.1.nip.io
config:
  baseDomain: 127.0.0.1.nip.io

# values-prod.yaml
ingress:
  hosts:
    dashboard: dashboard.yourdomain.com
  tls:
    - secretName: platform-tls
      hosts: [dashboard.yourdomain.com]
config:
  baseDomain: yourdomain.com
```

---

## Security Posture

### RBAC (Least Privilege)

The API runs with a ServiceAccount that has only necessary permissions:
- Create/delete namespaces (for store lifecycle)
- Create/manage deployments, services, ingresses, secrets, PVCs (within store namespaces)
- Read pods and events (for status monitoring)

### Secrets Handling

- Database passwords generated randomly at provisioning time
- Stored as Kubernetes Secrets (base64 encoded)
- Never logged or exposed via API
- Deleted with namespace on store deletion

### Container Hardening

- API runs as non-root user (UID 1001)
- Read-only root filesystem where possible
- Resource limits on all containers

---

## Horizontal Scaling

### What Scales Horizontally

| Component | Scaling Strategy |
|-----------|------------------|
| Dashboard | Stateless, scale replicas freely |
| API | Stateless (with external DB), scale replicas |
| Store provisioning | Concurrent, but rate-limited to avoid K8s API overload |

### Provisioning Throughput

Current: Synchronous provisioning (one store at a time per API instance).

Scaling options:
1. Multiple API replicas (each can provision independently)
2. Job queue (Redis/RabbitMQ) for background processing
3. Kubernetes Jobs for provisioning (completely async)

### Stateful Constraints

- Each store's MariaDB is a StatefulSet (not horizontally scalable)
- WordPress is single-replica (could scale reads with caching)

---

## Abuse Prevention

### Current Implementation

- **Input validation**: Name and engine type validated
- **Status tracking**: Prevents duplicate creates
- **Resource quotas**: Per-namespace limits prevent resource exhaustion

### Future Enhancements

- **Rate limiting**: Add express-rate-limit to API
- **Per-user quotas**: Max stores per user (requires auth)
- **Provisioning timeout**: Fail stores that don't become ready
- **Audit logging**: Log who created/deleted what and when

---

## Upgrade & Rollback

### Helm-based Upgrades

```bash
# Upgrade platform
helm upgrade store-platform ./helm/store-platform -f values-prod.yaml

# Rollback if needed
helm rollback store-platform 1
```

### Store Upgrades

Individual stores can be upgraded by:
1. Updating the WooCommerce Helm chart
2. Rolling restart of affected namespaces

```bash
# Upgrade all stores (example)
for ns in $(kubectl get ns -l store-platform/type=store -o name); do
  kubectl rollout restart deployment/wordpress -n $ns
done
```

---

## Future Improvements

1. **MedusaJS support**: Complete the stub implementation
2. **PostgreSQL registry**: Replace in-memory store with persistent DB
3. **Prometheus metrics**: Store creation/deletion/failure counts
4. **NetworkPolicies**: Deny-by-default per store namespace
5. **Backup/restore**: Automated PVC snapshots
6. **Domain linking**: Allow custom domains per store
