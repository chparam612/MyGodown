/**
 * ============================================================================
 * File: backend/src/server.js
 * Purpose: Application HTTP server bootstrap entry point.
 * Why it exists: Binds the Express application to configured network port
 * and handles graceful shutdown signals.
 * ============================================================================
 */

import app from './app.js';
import { checkDbHealth, pool } from './config/db.js';

const PORT = parseInt(process.env.PORT || '5000', 10);

async function startServer() {
  try {
    // Verify database connectivity prior to listening
    const dbOk = await checkDbHealth();
    if (!dbOk) {
      console.error('[server Error]: Initial database health check failed.');
      process.exit(1);
    }
    console.log('[server] Database connectivity verified.');

    const server = app.listen(PORT, () => {
      console.log(`[server] RIMS Backend API listening on port ${PORT} [NODE_ENV=${process.env.NODE_ENV || 'development'}]`);
    });

    // Graceful shutdown handling
    const shutdown = async (signal) => {
      console.log(`\n[server] Received ${signal}. Closing HTTP server and database pool...`);
      server.close(async () => {
        try {
          await pool.end();
          console.log('[server] Database pool closed. Process terminating cleanly.');
          process.exit(0);
        } catch (err) {
          console.error('[server Error]: Error closing database pool:', err);
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('[server Fatal Error]: Server failed to start:', error);
    process.exit(1);
  }
}

startServer();
