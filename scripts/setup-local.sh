#!/bin/bash
# Setup script for local Kubernetes development environment

set -e

echo "========================================"
echo "Urumi Store Platform - Local Setup"
echo "========================================"

# Check prerequisites
echo "Checking prerequisites..."

command -v docker >/dev/null 2>&1 || { echo "ERROR: Docker is not installed."; exit 1; }
command -v kubectl >/dev/null 2>&1 || { echo "ERROR: kubectl is not installed."; exit 1; }
command -v helm >/dev/null 2>&1 || { echo "ERROR: Helm is not installed."; exit 1; }
command -v kind >/dev/null 2>&1 || { echo "ERROR: Kind is not installed."; exit 1; }

echo "All prerequisites found!"
echo

# Check if cluster exists
if kind get clusters 2>/dev/null | grep -q "urumi-stores"; then
    echo "Cluster 'urumi-stores' already exists."
    read -p "Do you want to delete and recreate it? (y/n): " RECREATE
    if [[ "$RECREATE" == "y" ]]; then
        echo "Deleting existing cluster..."
        kind delete cluster --name urumi-stores
    else
        echo "Using existing cluster."
    fi
fi

# Create Kind cluster if it doesn't exist
if ! kind get clusters 2>/dev/null | grep -q "urumi-stores"; then
    echo "Creating Kind cluster..."
    kind create cluster --name urumi-stores --config kind-config.yaml
fi

echo
echo "Installing NGINX Ingress Controller..."
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

echo "Pinning ingress controller to ingress-ready node..."
kubectl patch deployment ingress-nginx-controller -n ingress-nginx --type=merge \
  -p '{"spec":{"template":{"spec":{"nodeSelector":{"kubernetes.io/os":"linux","ingress-ready":"true"}}}}}'

echo "Waiting for ingress controller to be ready..."
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s

echo
echo "========================================"
echo "Building Docker images..."
echo "========================================"

# Preload store runtime images to avoid provisioning failures when cluster nodes
# cannot reach external registries directly.
echo "Pulling and loading store runtime images (MariaDB/WP-CLI/BusyBox)..."
docker pull mariadb:10.11
docker pull busybox:1.36
docker pull wordpress:cli
kind load docker-image mariadb:10.11 --name urumi-stores
kind load docker-image busybox:1.36 --name urumi-stores
kind load docker-image wordpress:cli --name urumi-stores

echo "Building and loading WordPress + WooCommerce runtime image..."
docker build -t store-platform-wordpress-woocommerce:latest -f docker/wordpress-woocommerce/Dockerfile .
kind load docker-image store-platform-wordpress-woocommerce:latest --name urumi-stores

# Build backend
echo "Building backend image..."
cd backend
npm install
npm run build
docker build -t store-platform-api:latest .
kind load docker-image store-platform-api:latest --name urumi-stores
cd ..

# Build dashboard
echo "Building dashboard image..."
cd dashboard
npm install
npm run build
docker build -t store-platform-dashboard:latest .
kind load docker-image store-platform-dashboard:latest --name urumi-stores
cd ..

echo
echo "========================================"
echo "Deploying Store Platform..."
echo "========================================"

helm upgrade --install store-platform ./helm/store-platform \
  --namespace store-platform \
  -f ./helm/store-platform/values-local.yaml \
  --create-namespace

echo
echo "Waiting for platform to be ready..."
kubectl wait --namespace store-platform \
  --for=condition=ready pod \
  --selector=app=store-platform-api \
  --timeout=120s

kubectl wait --namespace store-platform \
  --for=condition=ready pod \
  --selector=app=store-platform-dashboard \
  --timeout=120s

echo
echo "========================================"
echo "Setup Complete!"
echo "========================================"
echo
echo "Dashboard: http://dashboard.localhost"
echo "API:       http://dashboard.localhost/api"
echo
echo "To create a store, open the dashboard and click 'Create New Store'"
