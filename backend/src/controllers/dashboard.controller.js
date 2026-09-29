/**
 * ============================================================================
 * File: backend/src/controllers/dashboard.controller.js
 * Purpose: Express controller for Dashboard endpoints (UC-32).
 * Why it exists: Receives authenticated HTTP requests, delegates metric retrieval
 * to dashboardService with the user's role context, and sends standardized envelopes.
 * ============================================================================
 */

import { dashboardService } from '../services/dashboard.service.js';
import { sendSuccess } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export class DashboardController {
  /**
   * UC-32: GET /api/dashboard/summary
   * Retrieves high-level operational and inventory metrics for the dashboard.
   */
  getSummary = asyncHandler(async (req, res) => {
    const summary = await dashboardService.getSummary(req.user.role);
    return sendSuccess(res, summary);
  });
}

export const dashboardController = new DashboardController();
