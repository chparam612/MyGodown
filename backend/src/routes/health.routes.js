/**
 * ============================================================================
 * File: backend/src/routes/health.routes.js
 * Purpose: System health check API route.
 * Why it exists: Probes API and database availability using harmless SELECT 1 query.
 * ============================================================================
 */

import { Router } from 'express';
import { checkDbHealth } from '../config/db.js';
import { sendSuccess, sendError } from '../utils/response.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const isDbHealthy = await checkDbHealth();
    if (!isDbHealthy) {
      return sendError(res, {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Database connection probe failed',
      }, 503);
    }

    return sendSuccess(res, {
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  } catch (error) {
    return sendError(res, {
      code: 'SERVICE_UNAVAILABLE',
      message: 'Service health check failed',
      details: error.message,
    }, 503);
  }
});

export default router;
