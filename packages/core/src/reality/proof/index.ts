/**
 * Proof Receipt Module for Reality Mode
 * 
 * Creates and verifies tamper-evident proof receipts.
 */

export {
  createProofReceipt,
  verifyReceiptSignature,
  formatReceipt,
  calculateReceiptSummary,
  type CreateReceiptOptions,
} from './receipt.js';
