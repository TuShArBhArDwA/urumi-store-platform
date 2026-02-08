@echo off
REM Setup script for local Kubernetes development environment

echo ========================================
echo Urumi Store Platform - Local Setup
echo ========================================

REM Check prerequisites
echo Checking prerequisites...

where docker >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Docker is not installed. Please install Docker Desktop first.
    exit /b 1
)

where kubectl >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: kubectl is not installed. Please install kubectl first.
    exit /b 1
)

where helm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Helm is not installed. Please install Helm first.
    exit /b 1
)

where kind >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Kind is not installed.
    echo Install with: choco install kind
    exit /b 1
)

echo All prerequisites found!
echo.

REM Check if cluster exists
kind get clusters 2>nul | findstr "urumi-stores" >nul
if %ERRORLEVEL% EQU 0 (
    echo Cluster 'urumi-stores' already exists.
    set /p RECREATE="Do you want to delete and recreate it? (y/n): "
    if /i "%RECREATE%"=="y" (
        echo Deleting existing cluster...
        kind delete cluster --name urumi-stores
    ) else (
        goto :skip_cluster
    )
)

REM Create Kind cluster
echo Creating Kind cluster...
kind create cluster --name urumi-stores --config kind-config.yaml
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to create Kind cluster.
    exit /b 1
)

:skip_cluster
echo.
echo Installing NGINX Ingress Controller...
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

echo Waiting for ingress controller to be ready...
kubectl wait --namespace ingress-nginx --for=condition=ready pod --selector=app.kubernetes.io/component=controller --timeout=120s

echo.
echo ========================================
echo Building Docker images...
echo ========================================

REM Build backend
echo Building backend image...
cd backend
docker build -t store-platform-api:latest .
kind load docker-image store-platform-api:latest --name urumi-stores
cd ..

REM Build dashboard
echo Building dashboard image...
cd dashboard
call npm install
call npm run build
docker build -t store-platform-dashboard:latest .
kind load docker-image store-platform-dashboard:latest --name urumi-stores
cd ..

echo.
echo ========================================
echo Deploying Store Platform...
echo ========================================

helm upgrade --install store-platform ./helm/store-platform -f ./helm/store-platform/values-local.yaml --create-namespace

echo.
echo Waiting for platform to be ready...
kubectl wait --namespace store-platform --for=condition=ready pod --selector=app=store-platform-api --timeout=120s
kubectl wait --namespace store-platform --for=condition=ready pod --selector=app=store-platform-dashboard --timeout=120s

echo.
echo ========================================
echo Setup Complete!
echo ========================================
echo.
echo Dashboard: http://dashboard.127.0.0.1.nip.io
echo API:       http://dashboard.127.0.0.1.nip.io/api
echo.
echo To create a store, open the dashboard and click "Create New Store"
echo.
pause
