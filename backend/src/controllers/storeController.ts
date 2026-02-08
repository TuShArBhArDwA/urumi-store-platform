import { Request, Response, NextFunction } from 'express';
import { StoreService } from '../services/storeService';
import { CreateStoreRequest } from '../types/store';
import { logger } from '../utils/logger';

const storeService = new StoreService();

export class StoreController {
    async listStores(req: Request, res: Response, next: NextFunction) {
        try {
            const stores = await storeService.listStores();
            res.json({ success: true, data: stores });
        } catch (error) {
            next(error);
        }
    }

    async getStore(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const store = await storeService.getStore(id);

            if (!store) {
                return res.status(404).json({
                    success: false,
                    error: { message: 'Store not found', code: 'NOT_FOUND' }
                });
            }

            res.json({ success: true, data: store });
        } catch (error) {
            next(error);
        }
    }

    async createStore(req: Request, res: Response, next: NextFunction) {
        try {
            const { name, engine } = req.body as CreateStoreRequest;

            // Validation
            if (!name || !engine) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Name and engine are required', code: 'VALIDATION_ERROR' }
                });
            }

            if (!['woocommerce', 'medusa'].includes(engine)) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Invalid engine. Must be woocommerce or medusa', code: 'VALIDATION_ERROR' }
                });
            }

            logger.info(`Creating store: ${name} with engine: ${engine}`);

            const store = await storeService.createStore({ name, engine });

            res.status(201).json({ success: true, data: store });
        } catch (error) {
            next(error);
        }
    }

    async deleteStore(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;

            logger.info(`Deleting store: ${id}`);

            await storeService.deleteStore(id);

            res.json({ success: true, message: 'Store deletion initiated' });
        } catch (error) {
            next(error);
        }
    }

    async getStoreEvents(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const events = await storeService.getStoreEvents(id);
            res.json({ success: true, data: events });
        } catch (error) {
            next(error);
        }
    }
}
