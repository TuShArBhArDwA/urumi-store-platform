import { useState } from 'react';

interface CreateStoreModalProps {
    onClose: () => void;
    onCreate: (name: string, engine: 'woocommerce' | 'medusa') => Promise<void>;
}

export function CreateStoreModal({ onClose, onCreate }: CreateStoreModalProps) {
    const [name, setName] = useState('');
    const [engine, setEngine] = useState<'woocommerce' | 'medusa'>('woocommerce');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!name.trim()) {
            setError('Store name is required');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            await onCreate(name.trim(), engine);
        } catch (err) {
            setError((err as Error).message || 'Failed to create store');
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h2 className="modal-title">Create New Store</h2>

                {error && (
                    <div className="error-message">{error}</div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label" htmlFor="store-name">
                            Store Name
                        </label>
                        <input
                            id="store-name"
                            type="text"
                            className="form-input"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="My Awesome Store"
                            autoFocus
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label" htmlFor="store-engine">
                            Store Engine
                        </label>
                        <select
                            id="store-engine"
                            className="form-select"
                            value={engine}
                            onChange={(e) => setEngine(e.target.value as 'woocommerce' | 'medusa')}
                        >
                            <option value="woocommerce">WooCommerce (WordPress)</option>
                            <option value="medusa" disabled>MedusaJS (Coming Soon)</option>
                        </select>
                    </div>

                    <div className="modal-actions">
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={onClose}
                            disabled={loading}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={loading}
                        >
                            {loading ? 'Creating...' : 'Create Store'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
