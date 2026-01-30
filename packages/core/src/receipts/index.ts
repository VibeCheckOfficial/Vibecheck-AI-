/**
 * Receipts Module
 * 
 * Provides Reality Receipt generation and verification.
 * 
 * @module receipts
 */

export {
  ReceiptGenerator,
  createReceiptGenerator,
  generateReceipt,
  verifyReceipt,
  formatReceiptSummary,
  exportReceiptJson,
} from './receipt-generator.js';
