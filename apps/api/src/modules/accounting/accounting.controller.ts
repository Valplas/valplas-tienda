import type { Request, Response, NextFunction } from 'express';
import { getDailySummary } from './accounting.repository.js';
import { AppError } from '../../shared/middleware/error.middleware.js';
import { isDateOnly, isValidDateInput } from '../../shared/utils/date-range.js';

/**
 * GET /api/accounting/daily-summary?date=YYYY-MM-DD
 * Returns daily sales summary grouped by product and price list.
 * Defaults to today in Argentina timezone (UTC-3).
 */
export async function getDailySummaryHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const date =
      (req.query.date as string) ||
      new Date().toLocaleDateString('sv', { timeZone: 'America/Argentina/Buenos_Aires' });

    if (!isDateOnly(date) || !isValidDateInput(date)) {
      throw new AppError('VALIDATION_ERROR', 'date debe tener formato YYYY-MM-DD', 400);
    }

    const summary = await getDailySummary(date);

    res.json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
}
