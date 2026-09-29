/**
 * ============================================================================
 * File: backend/src/services/dashboard.service.js
 * Purpose: Business logic service for Dashboard metrics (UC-32).
 * Why it exists: Orchestrates repository retrieval and enforces BR-05 role-based
 * data masking by completely omitting the stockValue metric for staff users.
 * ============================================================================
 */

import { defaultDashboardRepository } from '../repositories/dashboard.repository.js';

export class DashboardService {
  /**
   * @param {import('../repositories/dashboard.repository.js').DashboardRepository} [dashboardRepository]
   */
  constructor(dashboardRepository = defaultDashboardRepository) {
    this.dashboardRepository = dashboardRepository;
  }

  /**
   * Retrieves dashboard summary metrics.
   * Enforces BR-05 financial confidentiality:
   * - admin and manager receive stockValue.
   * - staff users have stockValue strictly omitted from the response object.
   *
   * @param {string} userRole - Role of the requesting user ('admin', 'manager', 'staff')
   * @returns {Promise<object>}
   */
  async getSummary(userRole) {
    const summary = await this.dashboardRepository.getSummary();

    // BR-05: Staff are strictly prohibited from viewing stock valuation
    if (userRole === 'staff') {
      delete summary.stockValue;
    }

    return summary;
  }
}

export const dashboardService = new DashboardService();
