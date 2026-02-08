const API_BASE = '/api';

export interface Store {
    id: string;
    name: string;
    engine: 'woocommerce' | 'medusa';
    status: 'pending' | 'provisioning' | 'ready' | 'failed' | 'deleting';
    namespace: string;
    urls: {
        storefront?: string;
        admin?: string;
    };
    createdAt: string;
    updatedAt: string;
    error?: string;
}

export interface StoreEvent {
    id: string;
    storeId: string;
    type: 'info' | 'warning' | 'error';
    message: string;
    timestamp: string;
}

export interface CreateStoreRequest {
    name: string;
    engine: 'woocommerce' | 'medusa';
}

interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: {
        message: string;
        code: string;
    };
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
        },
    });

    const json: ApiResponse<T> = await response.json();

    if (!response.ok || !json.success) {
        throw new Error(json.error?.message || 'Request failed');
    }

    return json.data as T;
}

export const storeApi = {
    listStores: (): Promise<Store[]> => request('/stores'),

    getStore: (id: string): Promise<Store> => request(`/stores/${id}`),

    createStore: (data: CreateStoreRequest): Promise<Store> =>
        request('/stores', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    deleteStore: (id: string): Promise<void> =>
        request(`/stores/${id}`, { method: 'DELETE' }),

    getStoreEvents: (id: string): Promise<StoreEvent[]> =>
        request(`/stores/${id}/events`),
};
