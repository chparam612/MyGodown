/**
 * ============================================================================
 * File: backend/tests/health.test.js
 * Purpose: Integration tests for Module 0 (Health & Foundation).
 * Why it exists: Probes base Express pipeline, standard response envelopes,
 * and database connection check against isolated test DB.
 * ============================================================================
 */

import request from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';

describe('Module 0: Foundation & Health Check', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('GET /api/health returns 200 with standard success envelope and healthy database', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data.status).toBe('healthy');
    expect(res.body.data.database).toBe('connected');
    expect(res.body.data).toHaveProperty('timestamp');
  });

  test('GET /api/non-existent-route returns 404 with standard error envelope', async () => {
    const res = await request(app).get('/api/non-existent-route');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toMatch(/Endpoint not found/i);
  });
});
