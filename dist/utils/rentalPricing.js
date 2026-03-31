"use strict";
/**
 * Property `price` is monthly rent. Total for a stay is monthlyPrice × (fractional) calendar months,
 * not × number of days (which would treat the monthly figure as a daily rate).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseLocalDate = parseLocalDate;
exports.billingMonthsBetween = billingMonthsBetween;
exports.rentalTotalFromMonthlyPrice = rentalTotalFromMonthlyPrice;
const MS_PER_DAY = 86400000;
/** Parse YYYY-MM-DD as local calendar date (avoids UTC shifts from ISO strings). */
function parseLocalDate(s) {
    const part = String(s).split("T")[0];
    const [y, m, d] = part.split("-").map((x) => parseInt(x, 10));
    if (!y || !m || !d)
        return new Date(NaN);
    return new Date(y, m - 1, d);
}
/**
 * Billable months between start (inclusive) and end (exclusive): count full calendar months
 * forward from start, then prorate any remaining days against the length of that month.
 * Example: Mar 1 → Apr 1 = exactly 1 month; Mar 1 → Mar 31 = 30/31 of a month.
 */
function billingMonthsBetween(start, end) {
    const startNorm = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endNorm = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    if (endNorm.getTime() <= startNorm.getTime())
        return 0;
    let months = 0;
    let cur = new Date(startNorm);
    while (true) {
        const next = new Date(cur);
        next.setMonth(next.getMonth() + 1);
        if (next.getTime() <= endNorm.getTime()) {
            months += 1;
            cur = next;
        }
        else {
            break;
        }
    }
    const restMs = endNorm.getTime() - cur.getTime();
    if (restMs > 0) {
        const dim = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
        months += restMs / (dim * MS_PER_DAY);
    }
    return months;
}
function rentalTotalFromMonthlyPrice(monthlyPrice, startDateStr, endDateStr) {
    const start = parseLocalDate(startDateStr);
    const end = parseLocalDate(endDateStr);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
        return 0;
    const months = billingMonthsBetween(start, end);
    if (months <= 0)
        return 0;
    const p = Number(monthlyPrice);
    if (!Number.isFinite(p) || p < 0)
        return 0;
    return Math.round(p * months * 100) / 100;
}
