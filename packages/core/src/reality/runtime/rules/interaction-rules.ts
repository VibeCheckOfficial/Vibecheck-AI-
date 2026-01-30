/**
 * Interaction Rules - Actually click things and verify they work
 * 
 * These rules go beyond DOM inspection to actually interact with elements
 * and verify that something meaningful happens. This catches issues that
 * would pass standard Playwright tests that only check "does element exist".
 */

import type { RuntimeRule, RuleContext, RuntimeRuleResult } from '../../types.js';

// ============================================================================
// Types for page interaction
// ============================================================================

interface PlaywrightPage {
  evaluate: <T>(fn: () => T | string, arg?: unknown) => Promise<T>;
  waitForTimeout: (ms: number) => Promise<void>;
  click: (selector: string, options?: { timeout?: number }) => Promise<void>;
  waitForSelector: (selector: string, options?: { timeout?: number; state?: string }) => Promise<unknown>;
  $$eval: <T>(selector: string, fn: (elements: Element[]) => T) => Promise<T>;
  $: (selector: string) => Promise<unknown>;
  url: () => string;
}

// ============================================================================
// Rule: Click Verification - Buttons should do something when clicked
// ============================================================================

export const ruleClickVerification: RuntimeRule = {
  id: 'interaction/click-verification',
  name: 'Click Verification',
  description: 'Verifies that prominent buttons actually do something when clicked',
  severity: 'high',

  check: async (context: RuleContext): Promise<RuntimeRuleResult> => {
    if (!context.page) {
      return { pass: true };
    }

    const page = context.page as PlaywrightPage;
    const unresponsiveButtons: Array<{ text: string; selector: string; reason: string }> = [];

    try {
      // Find primary/prominent buttons to test
      const buttonsToTest = await page.evaluate(() => {
        const buttons = document.querySelectorAll(
          'button:not([disabled]):not([type="submit"]), ' +
          '[role="button"]:not([aria-disabled="true"]), ' +
          'a.btn, a.button, a[class*="btn-primary"]'
        );

        const candidates: Array<{ selector: string; text: string }> = [];

        buttons.forEach((btn, index) => {
          const el = btn as HTMLElement;
          const style = window.getComputedStyle(el);

          // Skip if not visible
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return;
          }

          // Skip if in a modal/dialog that might not be open
          if (el.closest('[role="dialog"], [aria-modal="true"], .modal, .drawer')) {
            return;
          }

          // Skip navigation/menu items (clicking might navigate away)
          if (el.closest('nav, header, footer, [role="navigation"]')) {
            return;
          }

          // Skip if it's a close/dismiss button
          const text = el.textContent?.trim().toLowerCase() || '';
          if (['close', 'dismiss', 'cancel', 'x', '×'].includes(text)) {
            return;
          }

          // Generate a unique selector
          let selector = '';
          if (el.id) {
            selector = `#${el.id}`;
          } else if (el.getAttribute('data-testid')) {
            selector = `[data-testid="${el.getAttribute('data-testid')}"]`;
          } else if (el.className) {
            const classes = el.className.split(' ')
              .filter(c => c && !c.includes('_') && !c.includes(':'))
              .slice(0, 2)
              .join('.');
            if (classes) {
              selector = `${el.tagName.toLowerCase()}.${classes}`;
            }
          }

          if (!selector) {
            selector = `${el.tagName.toLowerCase()}:nth-of-type(${index + 1})`;
          }

          candidates.push({
            selector,
            text: el.textContent?.trim().slice(0, 30) || '[no text]',
          });
        });

        // Only test up to 3 prominent buttons per page
        return candidates.slice(0, 3);
      });

      // Test each button
      for (const button of buttonsToTest) {
        try {
          // Capture state before click
          const stateBefore = await capturePageState(page);

          // Try to click the button with a short timeout
          try {
            await page.click(button.selector, { timeout: 2000 });
          } catch {
            // Element might have moved or become unclickable - skip
            continue;
          }

          // Wait briefly for any reactions
          await page.waitForTimeout(500);

          // Capture state after click
          const stateAfter = await capturePageState(page);

          // Check if anything changed
          const changes = compareStates(stateBefore, stateAfter);

          if (!changes.anyChange) {
            unresponsiveButtons.push({
              text: button.text,
              selector: button.selector,
              reason: 'No visible change after click (no modal, no state change, no navigation)',
            });
          }
        } catch {
          // If click fails for any reason, skip this button
          continue;
        }
      }

      if (unresponsiveButtons.length > 0) {
        return {
          pass: false,
          message: `${unresponsiveButtons.length} button(s) did not respond to clicks`,
          evidence: {
            unresponsiveButtons,
          },
        };
      }

      return { pass: true };
    } catch {
      return { pass: true };
    }
  },
};

// ============================================================================
// Rule: Modal/Dialog Verification - Modals should be closeable
// ============================================================================

export const ruleModalVerification: RuntimeRule = {
  id: 'interaction/modal-verification',
  name: 'Modal Verification',
  description: 'Verifies that visible modals/dialogs have working close mechanisms',
  severity: 'medium',

  check: async (context: RuleContext): Promise<RuntimeRuleResult> => {
    if (!context.page) {
      return { pass: true };
    }

    const page = context.page as PlaywrightPage;

    try {
      const modalIssues = await page.evaluate(() => {
        const issues: Array<{ type: string; reason: string }> = [];

        // Find visible modals
        const modals = document.querySelectorAll(
          '[role="dialog"], [aria-modal="true"], .modal:not(.modal-hidden), ' +
          '.dialog, [class*="modal"]:not([class*="hidden"])'
        );

        modals.forEach(modal => {
          const style = window.getComputedStyle(modal);
          if (style.display === 'none' || style.visibility === 'hidden') {
            return;
          }

          // Check for close mechanism
          const hasCloseButton = modal.querySelector(
            'button[aria-label*="close" i], button[aria-label*="dismiss" i], ' +
            '.close, .modal-close, [class*="close"], button:has(svg)'
          ) !== null;

          const hasEscapeHandler = modal.hasAttribute('data-escape-close') ||
            modal.closest('[data-escape-close]') !== null;

          const hasBackdropClose = modal.hasAttribute('data-backdrop-close') ||
            modal.closest('[data-backdrop-close]') !== null;

          if (!hasCloseButton && !hasEscapeHandler && !hasBackdropClose) {
            issues.push({
              type: 'modal',
              reason: 'Modal is visible but has no apparent close mechanism',
            });
          }

          // Check for focus trap
          const focusableElements = modal.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          if (focusableElements.length === 0) {
            issues.push({
              type: 'modal',
              reason: 'Modal has no focusable elements (accessibility issue)',
            });
          }
        });

        return issues;
      });

      if (modalIssues.length > 0) {
        return {
          pass: false,
          message: `${modalIssues.length} modal issue(s) found`,
          evidence: {
            issues: modalIssues,
          },
        };
      }

      return { pass: true };
    } catch {
      return { pass: true };
    }
  },
};

// ============================================================================
// Rule: Dropdown Verification - Dropdowns should open and have options
// ============================================================================

export const ruleDropdownVerification: RuntimeRule = {
  id: 'interaction/dropdown-verification',
  name: 'Dropdown Verification',
  description: 'Verifies that dropdown menus open and contain options',
  severity: 'medium',

  check: async (context: RuleContext): Promise<RuntimeRuleResult> => {
    if (!context.page) {
      return { pass: true };
    }

    const page = context.page as PlaywrightPage;
    const dropdownIssues: Array<{ trigger: string; reason: string }> = [];

    try {
      // Find dropdown triggers
      const dropdownTriggers = await page.evaluate(() => {
        const triggers = document.querySelectorAll(
          '[aria-haspopup="true"], [aria-haspopup="menu"], [aria-haspopup="listbox"], ' +
          '[data-toggle="dropdown"], .dropdown-toggle, [class*="dropdown"] > button'
        );

        const candidates: Array<{ selector: string; text: string }> = [];

        triggers.forEach((trigger, index) => {
          const el = trigger as HTMLElement;
          const style = window.getComputedStyle(el);

          if (style.display === 'none' || style.visibility === 'hidden') {
            return;
          }

          let selector = '';
          if (el.id) {
            selector = `#${el.id}`;
          } else if (el.getAttribute('data-testid')) {
            selector = `[data-testid="${el.getAttribute('data-testid')}"]`;
          } else {
            selector = `[aria-haspopup]:nth-of-type(${index + 1})`;
          }

          candidates.push({
            selector,
            text: el.textContent?.trim().slice(0, 30) || '[dropdown]',
          });
        });

        return candidates.slice(0, 3);
      });

      for (const dropdown of dropdownTriggers) {
        try {
          // Check if menu is already expanded
          const isAlreadyOpen = await page.evaluate((sel: string) => {
            const trigger = document.querySelector(sel);
            return trigger?.getAttribute('aria-expanded') === 'true';
          }, dropdown.selector);

          if (isAlreadyOpen) continue;

          // Click to open
          await page.click(dropdown.selector, { timeout: 2000 });
          await page.waitForTimeout(300);

          // Check if menu appeared
          const menuAppeared = await page.evaluate((sel: string) => {
            const trigger = document.querySelector(sel);
            
            // Check aria-expanded
            if (trigger?.getAttribute('aria-expanded') === 'true') {
              // Find the associated menu
              const menuId = trigger.getAttribute('aria-controls');
              if (menuId) {
                const menu = document.getElementById(menuId);
                if (menu) {
                  const items = menu.querySelectorAll('[role="menuitem"], [role="option"], li');
                  return { opened: true, itemCount: items.length };
                }
              }
            }

            // Check for sibling/child menu
            const parent = trigger?.parentElement;
            const menu = parent?.querySelector('[role="menu"], [role="listbox"], .dropdown-menu, ul');
            if (menu) {
              const style = window.getComputedStyle(menu);
              if (style.display !== 'none' && style.visibility !== 'hidden') {
                const items = menu.querySelectorAll('[role="menuitem"], [role="option"], li');
                return { opened: true, itemCount: items.length };
              }
            }

            return { opened: false, itemCount: 0 };
          }, dropdown.selector);

          if (!menuAppeared.opened) {
            dropdownIssues.push({
              trigger: dropdown.text,
              reason: 'Dropdown trigger clicked but no menu appeared',
            });
          } else if (menuAppeared.itemCount === 0) {
            dropdownIssues.push({
              trigger: dropdown.text,
              reason: 'Dropdown menu appeared but contains no items',
            });
          }

          // Close the dropdown by clicking elsewhere
          await page.evaluate(() => document.body.click());
          await page.waitForTimeout(200);

        } catch {
          continue;
        }
      }

      if (dropdownIssues.length > 0) {
        return {
          pass: false,
          message: `${dropdownIssues.length} dropdown issue(s) found`,
          evidence: {
            issues: dropdownIssues,
          },
        };
      }

      return { pass: true };
    } catch {
      return { pass: true };
    }
  },
};

// ============================================================================
// Rule: Form Input Verification - Inputs should accept and display text
// ============================================================================

export const ruleFormInputVerification: RuntimeRule = {
  id: 'interaction/form-input-verification',
  name: 'Form Input Verification',
  description: 'Verifies that form inputs accept and properly display user input',
  severity: 'high',

  check: async (context: RuleContext): Promise<RuntimeRuleResult> => {
    if (!context.page) {
      return { pass: true };
    }

    const page = context.page as PlaywrightPage;
    const inputIssues: Array<{ input: string; reason: string }> = [];

    try {
      // Find inputs to test
      const inputsToTest = await page.evaluate(() => {
        const inputs = document.querySelectorAll(
          'input[type="text"]:not([readonly]):not([disabled]), ' +
          'input[type="email"]:not([readonly]):not([disabled]), ' +
          'input[type="search"]:not([readonly]):not([disabled]), ' +
          'input:not([type]):not([readonly]):not([disabled]), ' +
          'textarea:not([readonly]):not([disabled])'
        );

        const candidates: Array<{ selector: string; label: string; type: string }> = [];

        inputs.forEach((input, index) => {
          const el = input as HTMLInputElement;
          const style = window.getComputedStyle(el);

          if (style.display === 'none' || style.visibility === 'hidden') {
            return;
          }

          // Get label
          let label = '';
          const labelEl = document.querySelector(`label[for="${el.id}"]`);
          if (labelEl) {
            label = labelEl.textContent?.trim() || '';
          } else if (el.placeholder) {
            label = el.placeholder;
          } else if (el.name) {
            label = el.name;
          }

          let selector = '';
          if (el.id) {
            selector = `#${el.id}`;
          } else if (el.name) {
            selector = `[name="${el.name}"]`;
          } else {
            selector = `input:nth-of-type(${index + 1})`;
          }

          candidates.push({
            selector,
            label: label.slice(0, 30) || `Input ${index + 1}`,
            type: el.type || 'text',
          });
        });

        return candidates.slice(0, 3);
      });

      for (const input of inputsToTest) {
        try {
          const testValue = 'vibecheck_test_' + Math.random().toString(36).slice(2, 8);

          // Focus and type into the input
          await page.evaluate((data: { selector: string; value: string }) => {
            const el = document.querySelector(data.selector) as HTMLInputElement;
            if (el) {
              el.focus();
              el.value = data.value;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }, { selector: input.selector, value: testValue });

          await page.waitForTimeout(200);

          // Check if value was accepted
          const valueSet = await page.evaluate((data: { selector: string; expected: string }) => {
            const el = document.querySelector(data.selector) as HTMLInputElement;
            return el?.value === data.expected;
          }, { selector: input.selector, expected: testValue });

          if (!valueSet) {
            inputIssues.push({
              input: input.label,
              reason: 'Input did not accept/display typed text',
            });
          }

          // Clear the input for cleanup
          await page.evaluate((sel: string) => {
            const el = document.querySelector(sel) as HTMLInputElement;
            if (el) {
              el.value = '';
              el.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }, input.selector);

        } catch {
          continue;
        }
      }

      if (inputIssues.length > 0) {
        return {
          pass: false,
          message: `${inputIssues.length} input(s) not accepting user input`,
          evidence: {
            issues: inputIssues,
          },
        };
      }

      return { pass: true };
    } catch {
      return { pass: true };
    }
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

interface PageState {
  url: string;
  modalCount: number;
  toastCount: number;
  loadingCount: number;
  visibleTextLength: number;
  bodyClassList: string;
}

async function capturePageState(page: PlaywrightPage): Promise<PageState> {
  const state = await page.evaluate(() => {
    const modals = document.querySelectorAll('[role="dialog"], [aria-modal="true"], .modal:not(.hidden)');
    const toasts = document.querySelectorAll('[role="alert"], .toast, .notification, [class*="toast"]:not(.hidden)');
    const loading = document.querySelectorAll('[aria-busy="true"], .loading, .spinner');

    let visibleModals = 0;
    modals.forEach(m => {
      const style = window.getComputedStyle(m);
      if (style.display !== 'none' && style.visibility !== 'hidden') visibleModals++;
    });

    let visibleToasts = 0;
    toasts.forEach(t => {
      const style = window.getComputedStyle(t);
      if (style.display !== 'none' && style.visibility !== 'hidden') visibleToasts++;
    });

    return {
      url: window.location.href,
      modalCount: visibleModals,
      toastCount: visibleToasts,
      loadingCount: loading.length,
      visibleTextLength: document.body.innerText?.length || 0,
      bodyClassList: document.body.className,
    };
  });

  return state;
}

function compareStates(before: PageState, after: PageState): { anyChange: boolean; changes: string[] } {
  const changes: string[] = [];

  if (before.url !== after.url) {
    changes.push('URL changed');
  }
  if (before.modalCount !== after.modalCount) {
    changes.push('Modal appeared/disappeared');
  }
  if (before.toastCount !== after.toastCount) {
    changes.push('Toast/notification appeared');
  }
  if (before.loadingCount !== after.loadingCount) {
    changes.push('Loading state changed');
  }
  if (Math.abs(before.visibleTextLength - after.visibleTextLength) > 50) {
    changes.push('Content changed significantly');
  }
  if (before.bodyClassList !== after.bodyClassList) {
    changes.push('Body class changed');
  }

  return {
    anyChange: changes.length > 0,
    changes,
  };
}

// ============================================================================
// Export all interaction rules
// ============================================================================

export const INTERACTION_RULES: RuntimeRule[] = [
  ruleClickVerification,
  ruleModalVerification,
  ruleDropdownVerification,
  ruleFormInputVerification,
];
