/**
 * ============================================================================
 * File: backend/src/middleware/validate.js
 * Purpose: Reusable request validation middleware using Joi.
 * Why it exists: Validates request body, query params, and route parameters
 * with abortEarly: false and stripUnknown: true, throwing field-level 400 errors.
 * ============================================================================
 */

import { ValidationError } from '../utils/errors.js';

/**
 * Validates request schemas (body, query, params) against Joi schemas.
 * @param {Object} schemas - Object containing optional body, query, and params Joi schemas.
 * @returns {Function} Express middleware handler.
 */
export function validate(schemas, defaultTarget = 'body') {
  return (req, res, next) => {
    // If a single Joi schema is passed directly instead of an object map
    const schemaMap = (schemas && (schemas.body || schemas.query || schemas.params))
      ? schemas
      : { [defaultTarget]: schemas };

    const targets = ['body', 'query', 'params'];
    const errorDetails = [];

    for (const target of targets) {
      if (schemaMap[target]) {
        const { error, value } = schemaMap[target].validate(req[target], {
          abortEarly: false,
          stripUnknown: true,
        });

        if (error) {
          error.details.forEach((detail) => {
            errorDetails.push({
              target,
              field: detail.path.join('.'),
              message: detail.message.replace(/['"]/g, ''),
            });
          });
        } else {
          // Replace with sanitized/stripped value
          if (target === 'query') {
            // In Express 5, req.query is a getter. Clear old keys and assign sanitized values
            for (const key of Object.keys(req.query)) {
              delete req.query[key];
            }
            Object.assign(req.query, value);
          } else {
            req[target] = value;
          }
        }
      }
    }

    if (errorDetails.length > 0) {
      return next(new ValidationError('Request validation failed', errorDetails));
    }

    next();
  };
}
