import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface ApiError extends Error {
    statusCode?: number;
    code?: string;
}

export function errorHandler(
    err: ApiError,
    req: Request,
    res: Response,
    next: NextFunction
) {
    logger.error('API Error', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method
    });

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    res.status(statusCode).json({
        success: false,
        error: {
            message,
            code: err.code || 'INTERNAL_ERROR'
        }
    });
}
