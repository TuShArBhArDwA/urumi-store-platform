export type StoreEngine = 'woocommerce' | 'medusa';
export type StoreStatus = 'pending' | 'provisioning' | 'ready' | 'failed' | 'deleting';

export interface Store {
    id: string;
    name: string;
    engine: StoreEngine;
    status: StoreStatus;
    namespace: string;
    urls: {
        storefront?: string;
        admin?: string;
    };
    createdAt: Date;
    updatedAt: Date;
    error?: string;
}

export interface StoreEvent {
    id: string;
    storeId: string;
    type: 'info' | 'warning' | 'error';
    message: string;
    timestamp: Date;
}

export interface CreateStoreRequest {
    name: string;
    engine: StoreEngine;
}
