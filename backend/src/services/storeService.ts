import { v4 as uuidv4 } from 'uuid';
import { Store, StoreEvent, CreateStoreRequest, StoreStatus } from '../types/store';
import { K8sService } from './k8sService';
import { logger } from '../utils/logger';

// In-memory store registry (in production, use a database)
const stores: Map<string, Store> = new Map();
const storeEvents: Map<string, StoreEvent[]> = new Map();

export class StoreService {
    private k8sService: K8sService;

    constructor() {
        this.k8sService = new K8sService();
    }

    async listStores(): Promise<Store[]> {
        // Refresh status from K8s
        for (const store of stores.values()) {
            if (store.status === 'provisioning') {
                await this.refreshStoreStatus(store.id);
            }
        }
        return Array.from(stores.values()).sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
        );
    }

    async getStore(id: string): Promise<Store | null> {
        const store = stores.get(id);
        if (store && store.status === 'provisioning') {
            await this.refreshStoreStatus(id);
        }
        return stores.get(id) || null;
    }

    async createStore(request: CreateStoreRequest): Promise<Store> {
        const id = uuidv4().split('-')[0]; // Short ID
        const namespace = `store-${id}`;
        const baseDomain = process.env.BASE_DOMAIN || 'localhost';

        const store: Store = {
            id,
            name: request.name,
            engine: request.engine,
            status: 'pending',
            namespace,
            urls: {
                storefront: `http://${id}.${baseDomain}`,
                admin: `http://${id}.${baseDomain}/wp-admin`
            },
            createdAt: new Date(),
            updatedAt: new Date()
        };

        stores.set(id, store);
        storeEvents.set(id, []);

        this.addEvent(id, 'info', `Store creation initiated: ${request.name}`);

        // Start async provisioning
        this.provisionStore(store).catch(error => {
            logger.error(`Failed to provision store ${id}:`, error);
            this.updateStoreStatus(id, 'failed', error.message);
        });

        return store;
    }

    async deleteStore(id: string): Promise<void> {
        const store = stores.get(id);
        if (!store) {
            throw new Error('Store not found');
        }

        this.updateStoreStatus(id, 'deleting');
        this.addEvent(id, 'info', 'Store deletion initiated');

        try {
            await this.k8sService.deleteNamespace(store.namespace);
            stores.delete(id);
            storeEvents.delete(id);
            logger.info(`Store ${id} deleted successfully`);
        } catch (error) {
            logger.error(`Failed to delete store ${id}:`, error);
            this.updateStoreStatus(id, 'failed', (error as Error).message);
            throw error;
        }
    }

    async getStoreEvents(id: string): Promise<StoreEvent[]> {
        return storeEvents.get(id) || [];
    }

    private async provisionStore(store: Store): Promise<void> {
        this.updateStoreStatus(store.id, 'provisioning');
        this.addEvent(store.id, 'info', 'Starting Kubernetes resource provisioning');

        try {
            // Step 1: Create namespace
            this.addEvent(store.id, 'info', `Creating namespace: ${store.namespace}`);
            await this.k8sService.createNamespace(store.namespace);

            // Step 2: Create resource quota
            this.addEvent(store.id, 'info', 'Applying resource quota');
            await this.k8sService.createResourceQuota(store.namespace);

            // Step 3: Deploy store based on engine type
            if (store.engine === 'woocommerce') {
                await this.provisionWooCommerce(store);
            } else if (store.engine === 'medusa') {
                await this.provisionMedusa(store);
            }

            // Step 4: Wait for pods to be ready
            this.addEvent(store.id, 'info', 'Waiting for pods to be ready');
            await this.k8sService.waitForDeploymentReady(store.namespace, 'wordpress', 300000); // 5 min timeout

            // Step 5: Finalize engine-specific bootstrap
            if (store.engine === 'woocommerce') {
                this.addEvent(store.id, 'info', 'Bootstrapping WooCommerce (plugins, sample catalog, checkout)');
                await this.k8sService.bootstrapWooCommerceStore(
                    store.namespace,
                    store.id,
                    store.name
                );
            }

            this.updateStoreStatus(store.id, 'ready');
            this.addEvent(store.id, 'info', 'Store is ready!');

        } catch (error) {
            logger.error(`Provisioning failed for store ${store.id}:`, error);
            this.updateStoreStatus(store.id, 'failed', (error as Error).message);
            this.addEvent(store.id, 'error', `Provisioning failed: ${(error as Error).message}`);
            throw error;
        }
    }

    private async provisionWooCommerce(store: Store): Promise<void> {
        this.addEvent(store.id, 'info', 'Deploying MariaDB database');
        await this.k8sService.deployWooCommerceDatabase(store.namespace, store.id);

        this.addEvent(store.id, 'info', 'Deploying WordPress with WooCommerce');
        await this.k8sService.deployWordPress(store.namespace, store.id);

        this.addEvent(store.id, 'info', 'Creating ingress for store');
        await this.k8sService.createStoreIngress(store.namespace, store.id);
    }

    private async provisionMedusa(store: Store): Promise<void> {
        // Stub implementation - architecture ready for future
        this.addEvent(store.id, 'warning', 'MedusaJS provisioning is not yet implemented');
        throw new Error('MedusaJS engine is not yet implemented. Please use WooCommerce.');
    }

    private async refreshStoreStatus(id: string): Promise<void> {
        // Provisioning completion is controlled by the async provision flow.
        // Avoid marking a store as ready from polling-only checks.
        return;
    }

    private updateStoreStatus(id: string, status: StoreStatus, error?: string): void {
        const store = stores.get(id);
        if (store) {
            store.status = status;
            store.updatedAt = new Date();
            if (error) {
                store.error = error;
            }
        }
    }

    private addEvent(storeId: string, type: StoreEvent['type'], message: string): void {
        const events = storeEvents.get(storeId) || [];
        events.push({
            id: uuidv4(),
            storeId,
            type,
            message,
            timestamp: new Date()
        });
        storeEvents.set(storeId, events);

        logger.info(`[Store ${storeId}] ${type}: ${message}`);
    }
}
