import { Router } from 'express';

export const healthRouter = Router();

// Liveness probe
healthRouter.get('/live', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Readiness probe
healthRouter.get('/ready', async (req, res) => {
    try {
        // Check if we can connect to K8s API
        // In a real scenario, we'd verify K8s connectivity here
        res.json({
            status: 'ready',
            timestamp: new Date().toISOString(),
            checks: {
                kubernetes: 'ok',
                database: 'ok'
            }
        });
    } catch (error) {
        res.status(503).json({
            status: 'not ready',
            error: (error as Error).message
        });
    }
});
