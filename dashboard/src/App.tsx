import { useState, useEffect, useCallback } from 'react';
import { StoreCard } from './components/StoreCard';
import { CreateStoreModal } from './components/CreateStoreModal';
import { storeApi, Store } from './services/api';

function App() {
    const [stores, setStores] = useState<Store[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);

    const fetchStores = useCallback(async () => {
        try {
            const data = await storeApi.listStores();
            setStores(data);
            setError(null);
        } catch (err) {
            setError('Failed to fetch stores');
            console.error('Failed to fetch stores:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStores();

        // Poll for updates every 5 seconds
        const interval = setInterval(fetchStores, 5000);
        return () => clearInterval(interval);
    }, [fetchStores]);

    const handleCreateStore = async (name: string, engine: 'woocommerce' | 'medusa') => {
        try {
            await storeApi.createStore({ name, engine });
            setShowCreateModal(false);
            await fetchStores();
        } catch (err) {
            console.error('Failed to create store:', err);
            throw err;
        }
    };

    const handleDeleteStore = async (id: string) => {
        if (!confirm('Are you sure you want to delete this store? All data will be lost.')) {
            return;
        }

        try {
            await storeApi.deleteStore(id);
            await fetchStores();
        } catch (err) {
            console.error('Failed to delete store:', err);
        }
    };

    return (
        <div className="app">
            <header className="header">
                <div className="logo">⚡ Urumi Store Platform</div>
                <div className="header-actions">
                    <button className="btn btn-secondary" onClick={fetchStores}>
                        ↻ Refresh
                    </button>
                </div>
            </header>

            <main className="main">
                <div className="page-header">
                    <h1 className="page-title">Stores</h1>
                    <button
                        className="btn btn-primary"
                        onClick={() => setShowCreateModal(true)}
                    >
                        + Create New Store
                    </button>
                </div>

                {error && (
                    <div className="error-message">
                        {error}
                    </div>
                )}

                {loading ? (
                    <div className="loading">
                        <div className="spinner"></div>
                        Loading stores...
                    </div>
                ) : stores.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">🏪</div>
                        <h2 className="empty-state-title">No stores yet</h2>
                        <p>Create your first store to get started</p>
                    </div>
                ) : (
                    <div className="stores-grid">
                        {stores.map((store) => (
                            <StoreCard
                                key={store.id}
                                store={store}
                                onDelete={handleDeleteStore}
                            />
                        ))}
                    </div>
                )}
            </main>

            {showCreateModal && (
                <CreateStoreModal
                    onClose={() => setShowCreateModal(false)}
                    onCreate={handleCreateStore}
                />
            )}
        </div>
    );
}

export default App;
