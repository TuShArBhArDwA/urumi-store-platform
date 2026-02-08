import { Router } from 'express';
import { StoreController } from '../controllers/storeController';

export const storeRouter = Router();
const controller = new StoreController();

// List all stores
storeRouter.get('/', controller.listStores);

// Get store by ID
storeRouter.get('/:id', controller.getStore);

// Create new store
storeRouter.post('/', controller.createStore);

// Delete store
storeRouter.delete('/:id', controller.deleteStore);

// Get store events/logs
storeRouter.get('/:id/events', controller.getStoreEvents);
