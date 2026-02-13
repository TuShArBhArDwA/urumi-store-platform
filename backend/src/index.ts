import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { storeRouter } from './routes/storeRoutes';
import { healthRouter } from './routes/healthRoutes';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
}));
app.use(express.json());

// Request logging
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('user-agent')
    });
    next();
});

// Routes
app.get('/api', (_req, res) => {
    res.json({
        service: 'store-platform-api',
        status: 'ok',
        endpoints: {
            health: '/api/health/live',
            stores: '/api/stores'
        }
    });
});
app.use('/api/health', healthRouter);
app.use('/api/stores', storeRouter);

// Error handling
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
    logger.info(`Store Platform API running on port ${PORT}`);
});

export default app;
