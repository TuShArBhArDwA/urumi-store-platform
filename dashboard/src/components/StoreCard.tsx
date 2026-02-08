import { Store } from '../services/api';

interface StoreCardProps {
    store: Store;
    onDelete: (id: string) => void;
}

export function StoreCard({ store, onDelete }: StoreCardProps) {
    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString();
    };

    const getStatusClass = (status: string) => {
        return `status-badge status-${status}`;
    };

    const getEngineLabel = (engine: string) => {
        switch (engine) {
            case 'woocommerce':
                return 'WooCommerce';
            case 'medusa':
                return 'MedusaJS';
            default:
                return engine;
        }
    };

    return (
        <div className="store-card">
            <div className="store-header">
                <div>
                    <h3 className="store-name">{store.name}</h3>
                    <p className="store-engine">{getEngineLabel(store.engine)}</p>
                </div>
                <span className={getStatusClass(store.status)}>
                    {store.status}
                </span>
            </div>

            <div className="store-info">
                {store.urls.storefront && (
                    <div className="store-info-row">
                        <span className="store-info-label">Store:</span>
                        <a
                            href={store.urls.storefront}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="store-url"
                        >
                            {store.urls.storefront}
                        </a>
                    </div>
                )}

                {store.urls.admin && store.status === 'ready' && (
                    <div className="store-info-row">
                        <span className="store-info-label">Admin:</span>
                        <a
                            href={store.urls.admin}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="store-url"
                        >
                            {store.urls.admin}
                        </a>
                    </div>
                )}

                <div className="store-info-row">
                    <span className="store-info-label">Created:</span>
                    <span>{formatDate(store.createdAt)}</span>
                </div>

                <div className="store-info-row">
                    <span className="store-info-label">Namespace:</span>
                    <span style={{ fontFamily: 'monospace' }}>{store.namespace}</span>
                </div>

                {store.error && (
                    <div className="store-info-row" style={{ color: 'var(--error)' }}>
                        <span className="store-info-label">Error:</span>
                        <span>{store.error}</span>
                    </div>
                )}
            </div>

            <div className="store-actions">
                {store.status === 'ready' && (
                    <a
                        href={store.urls.storefront}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-primary"
                    >
                        Open Store
                    </a>
                )}

                <button
                    className="btn btn-danger"
                    onClick={() => onDelete(store.id)}
                    disabled={store.status === 'deleting'}
                >
                    {store.status === 'deleting' ? 'Deleting...' : 'Delete'}
                </button>
            </div>
        </div>
    );
}
