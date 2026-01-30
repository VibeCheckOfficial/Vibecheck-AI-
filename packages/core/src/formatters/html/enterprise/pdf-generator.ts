/**
 * PDF Report Generator
 * 
 * Uses Puppeteer to generate PDF reports from HTML.
 */

import type { EnterpriseReportConfig, EnterpriseReportData, PdfOptions } from './types.js';
import { generateEnterpriseReport } from './generator.js';

// ============================================================================
// Types
// ============================================================================

export interface PdfGeneratorOptions {
  /** Path to save the PDF file */
  outputPath?: string;
  /** Return PDF as buffer instead of saving to file */
  returnBuffer?: boolean;
  /** Puppeteer launch options */
  puppeteerOptions?: PuppeteerLaunchOptions;
}

interface PuppeteerLaunchOptions {
  /** Chromium executable path */
  executablePath?: string;
  /** Run in headless mode */
  headless?: boolean;
  /** Additional arguments */
  args?: string[];
}

export interface PdfResult {
  /** PDF buffer (if returnBuffer is true) */
  buffer?: Buffer;
  /** Path to saved PDF (if outputPath is provided) */
  path?: string;
  /** Generation time in ms */
  duration: number;
  /** Page count */
  pageCount?: number;
}

// ============================================================================
// PDF Generator
// ============================================================================

/**
 * Generate a PDF report from report data
 */
export async function generatePdfReport(
  data: EnterpriseReportData,
  reportConfig: Partial<EnterpriseReportConfig> = {},
  pdfOptions: PdfGeneratorOptions = {}
): Promise<PdfResult> {
  const startTime = Date.now();
  
  // Generate HTML first
  const html = generateEnterpriseReport(data, {
    ...reportConfig,
    format: 'pdf',
  });
  
  // Generate PDF from HTML
  const result = await htmlToPdf(html, {
    ...pdfOptions,
    pdfSettings: reportConfig.pdfOptions,
  });
  
  return {
    ...result,
    duration: Date.now() - startTime,
  };
}

/**
 * Convert HTML string to PDF
 */
export async function htmlToPdf(
  html: string,
  options: PdfGeneratorOptions & { pdfSettings?: PdfOptions } = {}
): Promise<Omit<PdfResult, 'duration'>> {
  // Dynamic import to avoid issues if puppeteer isn't installed
  let puppeteer;
  try {
    puppeteer = await import('puppeteer');
  } catch {
    throw new Error(
      'Puppeteer is required for PDF generation. Install it with: npm install puppeteer'
    );
  }
  
  const browser = await puppeteer.default.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      ...(options.puppeteerOptions?.args ?? []),
    ],
    executablePath: options.puppeteerOptions?.executablePath,
  });
  
  try {
    const page = await browser.newPage();
    
    // Set content
    await page.setContent(html, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });
    
    // Wait for fonts to load
    await page.evaluateHandle('document.fonts.ready');
    
    // Configure PDF options
    const pdfSettings = options.pdfSettings ?? {};
    const format = pdfSettings.format ?? 'A4';
    const landscape = pdfSettings.orientation === 'landscape';
    const margins = pdfSettings.margins ?? { top: 20, right: 20, bottom: 20, left: 20 };
    
    const pdfBuffer = await page.pdf({
      format,
      landscape,
      printBackground: true,
      margin: {
        top: `${margins.top}mm`,
        right: `${margins.right}mm`,
        bottom: `${margins.bottom}mm`,
        left: `${margins.left}mm`,
      },
      displayHeaderFooter: pdfSettings.headerFooter ?? false,
      headerTemplate: pdfSettings.headerFooter
        ? `<div style="font-size: 10px; color: #666; width: 100%; text-align: center; padding: 5px;">
             VibeCheck Report
           </div>`
        : undefined,
      footerTemplate: pdfSettings.headerFooter
        ? `<div style="font-size: 10px; color: #666; width: 100%; text-align: center; padding: 5px;">
             Page <span class="pageNumber"></span> of <span class="totalPages"></span>
           </div>`
        : undefined,
    });
    
    // Save to file or return buffer
    if (options.outputPath) {
      const fs = await import('node:fs/promises');
      await fs.writeFile(options.outputPath, pdfBuffer);
      return { path: options.outputPath };
    }
    
    return { buffer: pdfBuffer };
  } finally {
    await browser.close();
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Generate and save a Reality Check PDF report
 */
export async function generateRealityCheckPdf(
  data: EnterpriseReportData,
  outputPath: string,
  options: Partial<EnterpriseReportConfig> = {}
): Promise<PdfResult> {
  return generatePdfReport(
    data,
    { ...options, type: 'reality-check' },
    { outputPath }
  );
}

/**
 * Generate and save a Ship Readiness PDF report
 */
export async function generateShipReadinessPdf(
  data: EnterpriseReportData,
  outputPath: string,
  options: Partial<EnterpriseReportConfig> = {}
): Promise<PdfResult> {
  return generatePdfReport(
    data,
    { ...options, type: 'ship-readiness' },
    { outputPath }
  );
}

/**
 * Generate PDF buffer for email/API response
 */
export async function generatePdfBuffer(
  data: EnterpriseReportData,
  reportConfig: Partial<EnterpriseReportConfig> = {}
): Promise<Buffer> {
  const result = await generatePdfReport(data, reportConfig, { returnBuffer: true });
  
  if (!result.buffer) {
    throw new Error('Failed to generate PDF buffer');
  }
  
  return result.buffer;
}
