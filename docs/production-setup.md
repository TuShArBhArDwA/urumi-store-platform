# VPS/Production Setup Guide

This guide explains how to deploy the Urumi Store Platform on a VPS using k3s.

## Prerequisites

- A VPS with at least 4GB RAM and 2 CPU cores
- Ubuntu 20.04+ or similar Linux distribution
- A domain name with DNS configured
- SSH access to your VPS

## Step 1: Install k3s

```bash
# Install k3s (lightweight Kubernetes)
curl -sfL https://get.k3s.io | sh -

# Verify installation
sudo k3s kubectl get nodes

# Configure kubectl for your user
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $USER ~/.kube/config
```

## Step 2: Install Helm

```bash
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

## Step 3: Configure DNS

Point your domain to your VPS IP. You'll need:
- `dashboard.yourdomain.com` → VPS IP
- `*.yourdomain.com` → VPS IP (wildcard for stores)

## Step 4: Install cert-manager (for TLS)

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Wait for it to be ready
kubectl wait --for=condition=ready pod -l app.kubernetes.io/instance=cert-manager -n cert-manager --timeout=120s

# Create ClusterIssuer for Let's Encrypt
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your-email@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

## Step 5: Build and Push Images

```bash
# Build images locally
cd backend && docker build -t ghcr.io/your-org/store-platform-api:latest . && cd ..
cd dashboard && docker build -t ghcr.io/your-org/store-platform-dashboard:latest . && cd ..

# Push to registry (requires authentication)
docker push ghcr.io/your-org/store-platform-api:latest
docker push ghcr.io/your-org/store-platform-dashboard:latest
```

## Step 6: Configure Production Values

Edit `helm/store-platform/values-prod.yaml`:

```yaml
image:
  api:
    repository: ghcr.io/your-org/store-platform-api
  dashboard:
    repository: ghcr.io/your-org/store-platform-dashboard

ingress:
  hosts:
    dashboard: dashboard.yourdomain.com
  tls:
    - secretName: platform-tls
      hosts:
        - dashboard.yourdomain.com

config:
  baseDomain: yourdomain.com
```

## Step 7: Deploy

```bash
# Copy Helm charts to VPS
scp -r helm/ user@your-vps:/opt/store-platform/

# SSH to VPS and deploy
ssh user@your-vps
cd /opt/store-platform
helm upgrade --install store-platform ./helm/store-platform \
  -f ./helm/store-platform/values-prod.yaml \
  --create-namespace
```

## Step 8: Verify Deployment

```bash
# Check pods
kubectl get pods -n store-platform

# Check ingress
kubectl get ingress -n store-platform

# Check certificates
kubectl get certificates -n store-platform
```

## Troubleshooting

### Certificate not issuing

```bash
# Check cert-manager logs
kubectl logs -n cert-manager -l app.kubernetes.io/name=cert-manager

# Check certificate status
kubectl describe certificate platform-tls -n store-platform
```

### Pods not starting

```bash
# Check pod logs
kubectl logs -n store-platform -l app=store-platform-api

# Check events
kubectl get events -n store-platform --sort-by='.lastTimestamp'
```

### Store not accessible

```bash
# Check store namespace
kubectl get pods -n store-<id>

# Check ingress
kubectl get ingress -n store-<id>
```

## Backup Strategy

### Database Backups

```bash
# Backup a store's database
kubectl exec -n store-<id> mariadb-0 -- mysqldump -u root -p wordpress > backup.sql
```

### PVC Snapshots (if supported)

```bash
# Create VolumeSnapshot (requires snapshot controller)
cat <<EOF | kubectl apply -f -
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshot
metadata:
  name: wordpress-snapshot
  namespace: store-<id>
spec:
  source:
    persistentVolumeClaimName: wordpress-data
EOF
```

## Monitoring (Optional)

Install Prometheus and Grafana for monitoring:

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install prometheus prometheus-community/kube-prometheus-stack --namespace monitoring --create-namespace
```
