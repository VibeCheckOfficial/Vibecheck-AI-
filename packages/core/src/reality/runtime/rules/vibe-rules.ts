/**
 * Vibe Rules - Sophisticated UI/UX Integrity Checks
 * 
 * These rules catch "technically passing" issues that would fool normal Playwright tests:
 * - Buttons that exist but don't do anything
 * - Pages that render but have no content
 * - Links that go nowhere
 * - Forms that don't submit
 * - Loading states that never resolve
 */

import type { RuntimeRule, RuleContext, RuntimeRuleResult } from '../../types.js';

// ============================================================================
// Rule: Dead Buttons - Buttons that exist but have no click handlers
// ============================================================================

export const ruleDeadButtons: RuntimeRule = {
  id: 'vibe/dead-buttons',
  name: 'Dead Buttons',
  description: 'Detects buttons that exist but have no click handlers or are disabled without explanation',
  severity: 'high',

  check: async (context: RuleContext): Promise<RuntimeRuleResult> => {
    if (!context.page) {
      return { pass: true };
    }

    try {
      const page = context.page as {
        evaluate: <T>(fn: () => T) => Promise<T>;
      };

      const deadButtonsInfo = await page.evaluate(() => {
        const buttons = document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]');
        const dead: Array<{ text: string; reason: string; selector: string }> = [];

        buttons.forEach((btn, index) => {
          const button = btn as HTMLElement;
          const style = window.getComputedStyle(button);
          
          // Skip if not visible
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return;
          }

          // Skip if it's in a form (might be a submit button)
          if (button.closest('form')) {
            return;
          }

          const text = button.textContent?.trim() || button.getAttribute('aria-label') || `Button ${index}`;
          const hasOnClick = button.hasAttribute('onclick') || (button as HTMLButtonElement).onclick !== null;
          const hasEventListeners = typeof (button as unknown as { _reactProps?: unknown })?._reactProps !== 'undefined';
          
          // Check for data attributes that often indicate handlers
          const hasDataAction = button.hasAttribute('data-action') || 
                              button.hasAttribute('data-onclick') ||
                              button.hasAttribute('data-handler');
          
          // Check for common framework event bindings (Vue, Angular, etc.)
          const hasFrameworkBinding = Array.from(button.attributes).some(attr => 
            attr.name.startsWith('@click') || 
            attr.name.startsWith('v-on:') ||
            attr.name.startsWith('(click)') ||
            attr.name.startsWith('ng-click')
          );

          // Check if button is disabled without accessible explanation
          const isDisabled = button.hasAttribute('disabled') || button.getAttribute('aria-disabled') === 'true';
          const hasDisabledReason = button.hasAttribute('title') || 
                                   button.hasAttribute('aria-describedby') ||
                                   button.closest('[title]') !== null;
          
          // Suspicious patterns
          const isHrefButton = button.tagName === 'A' && 
                              (button.getAttribute('href') === '#' || 
                               button.getAttribute('href') === '' ||
                               button.getAttribute('href') === 'javascript:void(0)');

          if (isHrefButton) {
            dead.push({ 
              text, 
              reason: 'Link styled as button with href="#" or empty href',
              selector: generateSelector(button),
            });
          } else if (isDisabled && !hasDisabledReason) {
            dead.push({ 
              text, 
              reason: 'Disabled button without accessible explanation',
              selector: generateSelector(button),
            });
          }
        });

        function generateSelector(el: HTMLElement): string {
          if (el.id) return `#${el.id}`;
          if (el.className) {
            const classes = el.className.split(' ').filter(c => c && !c.includes('_')).slice(0, 2);
            if (classes.length) return `${el.tagName.toLowerCase()}.${classes.join('.')}`;
          }
          return el.tagName.toLowerCase();
        }

        return dead;
      });

      if (deadButtonsInfo.length > 0) {
        return {
          pass: false,
          message: `${deadButtonsInfo.length} potentially dead button(s) found`,
          evidence: {
            deadButtons: deadButtonsInfo,
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
// Rule: Empty Routes - Pages that render but have no meaningful content
// ============================================================================

export const ruleEmptyRoutes: RuntimeRule = {
  id: 'vibe/empty-route',
  name: 'Empty Route',
  description: 'Detects pages that render but contain no meaningful content',
  severity: 'high',

  check: async (context: RuleContext): Promise<RuntimeRuleResult> => {
    if (!context.page) {
      return { pass: true };
    }

    // Skip API routes
    if (context.route.path.startsWith('/api/')) {
      return { pass: true };
    }

    try {
      const page = context.page as {
        evaluate: <T>(fn: () => T) => Promise<T>;
      };

      const contentAnalysis = await page.evaluate(() => {
        const body = document.body;
        if (!body) return { isEmpty: true, reason: 'No body element' };

        // Get visible text content
        const textContent = body.innerText?.trim() || '';
        
        // Count meaningful elements
        const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        const paragraphs = document.querySelectorAll('p');
        const lists = document.querySelectorAll('ul, ol');
        const tables = document.querySelectorAll('table');
        const images = document.querySelectorAll('img[src]:not([src=""])');
        const forms = document.querySelectorAll('form');
        const articles = document.querySelectorAll('article, main, section');
        
        // Count interactive elements
        const buttons = document.querySelectorAll('button, [role="button"]');
        const links = document.querySelectorAll('a[href]:not([href="#"]):not([href=""])');
        const inputs = document.querySelectorAll('input, textarea, select');

        const meaningfulElementCount = 
          headings.length + 
          paragraphs.length + 
          lists.length + 
          tables.length + 
          images.length + 
          forms.length +
          articles.length;

        const interactiveElementCount = 
          buttons.length + 
          links.length + 
          inputs.length;

        // Text analysis
        const words = textContent.split(/\s+/).filter(w => w.length > 0);
        const wordCount = words.length;

        // Check for skeleton/loading state
        const skeletonElements = document.querySelectorAll(
          '[class*="skeleton"], [class*="loading"], [class*="placeholder"], ' +
          '[class*="shimmer"], [data-loading], [aria-busy="true"]'
        );
        const hasSkeletons = skeletonElements.length > 0;

        // Check for error states
        const errorElements = document.querySelectorAll(
          '[class*="error"], [class*="empty-state"], [class*="no-data"], ' +
          '[class*="not-found"], [data-error]'
        );
        const visibleErrors = Array.from(errorElements).filter(el => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden';
        });

        return {
          textLength: textContent.length,
          wordCount,
          meaningfulElementCount,
          interactiveElementCount,
          hasSkeletons,
          skeletonCount: skeletonElements.length,
          hasErrors: visibleErrors.length > 0,
          isEmpty: wordCount < 10 && meaningfulElementCount < 3 && interactiveElementCount < 2,
          reason: wordCount < 10 ? 'Very little text content' : 
                  meaningfulElementCount < 3 ? 'Few meaningful elements' :
                  hasSkeletons ? 'Page appears to be in loading state' : null,
        };
      });

      if (contentAnalysis.isEmpty && !contentAnalysis.hasErrors) {
        return {
          pass: false,
          message: `Route ${context.route.path} appears empty: ${contentAnalysis.reason}`,
          evidence: {
            analysis: contentAnalysis,
          },
        };
      }

      // Warn if stuck in skeleton/loading state
      if (contentAnalysis.hasSkeletons && contentAnalysis.meaningfulElementCount < 5) {
        return {
          pass: false,
          message: `Route ${context.route.path} appears stuck in loading state (${contentAnalysis.skeletonCount} skeleton elements)`,
          evidence: {
            analysis: contentAnalysis,
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
// Rule: Broken Links - Links that don't go anywhere useful
// ============================================================================

export const ruleBrokenLinks: RuntimeRule = {
  id: 'vibe/broken-links',
  name: 'Broken Links',
  description: 'Detects links with href="#", empty href, or javascript:void(0)',
  severity: 'medium',

  check: async (context: RuleContext): Promise<RuntimeRuleResult> => {
    if (!context.page) {
      return { pass: true };
    }

    try {
      const page = context.page as {
        evaluate: <T>(fn: () => T) => Promise<T>;
      };

      const brokenLinks = await page.evaluate(() => {
        const links = document.querySelectorAll('a');
        const broken: Array<{ text: string; href: string; reason: string }> = [];

        links.forEach(link => {
          const href = link.getAttribute('href');
          const text = link.textContent?.trim() || link.getAttribute('aria-label') || '[no text]';
          
          // Skip if not visible
          const style = window.getComputedStyle(link);
          if (style.display === 'none' || style.visibility === 'hidden') {
            return;
          }

          // Skip if it has an onclick or other event handler that makes sense
          if (link.hasAttribute('onclick') || link.hasAttribute('data-action')) {
            return;
          }

          // Check for problematic href patterns
          if (href === '#') {
            broken.push({ text, href, reason: 'href="#" typically indicates placeholder link' });
          } else if (href === '' || href === null) {
            broken.push({ text, href: '(empty)', reason: 'Empty or missing href' });
          } else if (href?.startsWith('javascript:void')) {
            broken.push({ text, href, reason: 'javascript:void indicates non-functional link' });
          } else if (href === 'undefined' || href === 'null') {
            broken.push({ text, href, reason: 'href contains literal undefined/null' });
          }
        });

        return broken;
      });

      // Only fail if there are multiple broken links (1-2 might be intentional skip links)
      if (brokenLinks.length > 2) {
        return {
          pass: false,
          message: `${brokenLinks.length} broken link(s) found on page`,
          evidence: {
            brokenLinks: brokenLinks.slice(0, 10),
            totalFound: brokenLinks.length,
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
// Rule: Orphan Forms - Forms without proper submit handling
// ============================================================================

export const ruleOrphanForms: RuntimeRule = {
  id: 'vibe/orphan-forms',
  name: 'Orphan Forms',
  description: 'Detects forms without action, method, or submit handlers',
  severity: 'medium',

  check: async (context: RuleContext): Promise<RuntimeRuleResult> => {
    if (!context.page) {
      return { pass: true };
    }

    try {
      const page = context.page as {
        evaluate: <T>(fn: () => T) => Promise<T>;
      };

      const orphanForms = await page.evaluate(() => {
        const forms = document.querySelectorAll('form');
        const orphans: Array<{ id: string; fieldCount: number; reason: string }> = [];

        forms.forEach((form, index) => {
          const formEl = form as HTMLFormElement;
          
          // Skip if not visible
          const style = window.getComputedStyle(form);
          if (style.display === 'none' || style.visibility === 'hidden') {
            return;
          }

          const hasAction = form.hasAttribute('action') && form.getAttribute('action') !== '';
          const hasOnSubmit = form.hasAttribute('onsubmit') || formEl.onsubmit !== null;
          const hasSubmitButton = form.querySelector('button[type="submit"], input[type="submit"]') !== null;
          const hasInputs = form.querySelectorAll('input, textarea, select').length;
          
          // Check for framework handlers
          const hasFrameworkHandler = Array.from(form.attributes).some(attr =>
            attr.name.includes('submit') || 
            attr.name.startsWith('@') ||
            attr.name.startsWith('v-on:') ||
            attr.name.startsWith('(')
          );

          // A form with inputs but no way to submit is suspicious
          if (hasInputs > 0 && !hasAction && !hasOnSubmit && !hasFrameworkHandler) {
            if (!hasSubmitButton) {
              orphans.push({
                id: form.id || `form-${index}`,
                fieldCount: hasInputs,
                reason: 'Form has inputs but no action, submit handler, or submit button',
              });
            }
          }
        });

        return orphans;
      });

      if (orphanForms.length > 0) {
        return {
          pass: false,
          message: `${orphanForms.length} potentially orphan form(s) found`,
          evidence: {
            orphanForms,
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
// Rule: Eternal Loading - Loading states that never resolve
// ============================================================================

export const ruleEternalLoading: RuntimeRule = {
  id: 'vibe/eternal-loading',
  name: 'Eternal Loading',
  description: 'Detects loading indicators that persist after page load',
  severity: 'high',

  check: async (context: RuleContext): Promise<RuntimeRuleResult> => {
    if (!context.page) {
      return { pass: true };
    }

    try {
      const page = context.page as {
        evaluate: <T>(fn: () => T) => Promise<T>;
        waitForTimeout: (ms: number) => Promise<void>;
      };

      // Wait a bit for async content to load
      if (page.waitForTimeout) {
        await page.waitForTimeout(2000);
      }

      const loadingAnalysis = await page.evaluate(() => {
        // Common loading indicator selectors
        const loadingSelectors = [
          '[class*="loading"]',
          '[class*="spinner"]',
          '[class*="loader"]',
          '[aria-busy="true"]',
          '[data-loading="true"]',
          '[class*="skeleton"]',
          '[class*="shimmer"]',
          '[class*="pulse"]',
          '.animate-spin',
          '.animate-pulse',
        ];

        const loadingElements: Array<{ selector: string; visible: boolean; text: string }> = [];

        for (const selector of loadingSelectors) {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => {
            const htmlEl = el as HTMLElement;
            const style = window.getComputedStyle(el);
            const isVisible = style.display !== 'none' && 
                            style.visibility !== 'hidden' && 
                            style.opacity !== '0';
            
            if (isVisible) {
              loadingElements.push({
                selector: generateSelector(htmlEl),
                visible: true,
                text: htmlEl.textContent?.trim().slice(0, 50) || '',
              });
            }
          });
        }

        // Check for "Loading..." text
        const textNodes = document.evaluate(
          "//*[contains(text(), 'Loading') or contains(text(), 'loading')]",
          document,
          null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null
        );

        for (let i = 0; i < textNodes.snapshotLength; i++) {
          const node = textNodes.snapshotItem(i) as HTMLElement;
          if (node) {
            const style = window.getComputedStyle(node);
            if (style.display !== 'none' && style.visibility !== 'hidden') {
              loadingElements.push({
                selector: generateSelector(node),
                visible: true,
                text: node.textContent?.trim().slice(0, 50) || '',
              });
            }
          }
        }

        function generateSelector(el: HTMLElement): string {
          if (el.id) return `#${el.id}`;
          if (el.className && typeof el.className === 'string') {
            const classes = el.className.split(' ').filter(c => c && !c.includes('_')).slice(0, 2);
            if (classes.length) return `${el.tagName.toLowerCase()}.${classes.join('.')}`;
          }
          return el.tagName.toLowerCase();
        }

        return {
          hasLoadingIndicators: loadingElements.length > 0,
          loadingElements: loadingElements.slice(0, 5),
          totalCount: loadingElements.length,
        };
      });

      if (loadingAnalysis.hasLoadingIndicators && loadingAnalysis.totalCount > 2) {
        return {
          pass: false,
          message: `Page has ${loadingAnalysis.totalCount} loading indicator(s) still visible after page load`,
          evidence: {
            loadingElements: loadingAnalysis.loadingElements,
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
// Rule: Placeholder Text - TODO, FIXME, lorem ipsum in production
// ============================================================================

export const rulePlaceholderText: RuntimeRule = {
  id: 'vibe/placeholder-text',
  name: 'Placeholder Text',
  description: 'Detects TODO, FIXME, lorem ipsum, or other placeholder text in the UI',
  severity: 'medium',

  check: async (context: RuleContext): Promise<RuntimeRuleResult> => {
    if (!context.page) {
      return { pass: true };
    }

    try {
      const page = context.page as {
        evaluate: <T>(fn: () => T) => Promise<T>;
      };

      const placeholders = await page.evaluate(() => {
        const body = document.body;
        if (!body) return { found: [], hasPlaceholders: false };

        const text = body.innerText || '';
        const found: Array<{ pattern: string; context: string }> = [];

        // Patterns to detect
        const patterns = [
          { regex: /\bTODO\b/gi, name: 'TODO' },
          { regex: /\bFIXME\b/gi, name: 'FIXME' },
          { regex: /\bXXX\b/g, name: 'XXX marker' },
          { regex: /lorem ipsum/gi, name: 'Lorem Ipsum' },
          { regex: /dolor sit amet/gi, name: 'Lorem Ipsum (dolor sit amet)' },
          { regex: /\[placeholder\]/gi, name: '[placeholder]' },
          { regex: /\{placeholder\}/gi, name: '{placeholder}' },
          { regex: /example@example\.com/gi, name: 'Placeholder email' },
          { regex: /test@test\.com/gi, name: 'Test email' },
          { regex: /john\.?doe/gi, name: 'John Doe placeholder' },
          { regex: /jane\.?doe/gi, name: 'Jane Doe placeholder' },
          { regex: /coming soon/gi, name: 'Coming Soon' },
          { regex: /under construction/gi, name: 'Under Construction' },
          { regex: /\bTBD\b/g, name: 'TBD' },
          { regex: /\bN\/A\b/g, name: 'N/A (may be placeholder)' },
        ];

        for (const { regex, name } of patterns) {
          const matches = text.match(regex);
          if (matches) {
            // Get context around the match
            const index = text.search(regex);
            const start = Math.max(0, index - 20);
            const end = Math.min(text.length, index + 50);
            const context = text.slice(start, end).replace(/\s+/g, ' ').trim();
            
            found.push({ pattern: name, context: `...${context}...` });
          }
        }

        return {
          found: found.slice(0, 10),
          hasPlaceholders: found.length > 0,
        };
      });

      // Filter out N/A as it's often legitimate
      const significantPlaceholders = placeholders.found.filter(
        p => p.pattern !== 'N/A (may be placeholder)'
      );

      if (significantPlaceholders.length > 0) {
        return {
          pass: false,
          message: `Found ${significantPlaceholders.length} placeholder text pattern(s) in UI`,
          evidence: {
            placeholders: significantPlaceholders,
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
// Rule: Missing Images - Images with broken src or alt text
// ============================================================================

export const ruleMissingImages: RuntimeRule = {
  id: 'vibe/missing-images',
  name: 'Missing Images',
  description: 'Detects images that failed to load or have no alt text',
  severity: 'medium',

  check: async (context: RuleContext): Promise<RuntimeRuleResult> => {
    if (!context.page) {
      return { pass: true };
    }

    try {
      const page = context.page as {
        evaluate: <T>(fn: () => T) => Promise<T>;
      };

      const imageAnalysis = await page.evaluate(() => {
        const images = document.querySelectorAll('img');
        const broken: Array<{ src: string; alt: string; reason: string }> = [];
        const missingAlt: Array<{ src: string }> = [];

        images.forEach(img => {
          const imgEl = img as HTMLImageElement;
          
          // Skip if not visible
          const style = window.getComputedStyle(img);
          if (style.display === 'none' || style.visibility === 'hidden') {
            return;
          }

          // Skip tiny images (likely icons or tracking pixels)
          if (imgEl.width < 20 || imgEl.height < 20) {
            return;
          }

          const src = imgEl.src || imgEl.getAttribute('src') || '';
          const alt = imgEl.alt || '';

          // Check if image failed to load
          if (!imgEl.complete || imgEl.naturalWidth === 0) {
            broken.push({
              src: src.slice(0, 100),
              alt,
              reason: 'Image failed to load',
            });
          }

          // Check for placeholder src
          if (src.includes('placeholder') || src.includes('via.placeholder') || src.includes('picsum.photos')) {
            broken.push({
              src: src.slice(0, 100),
              alt,
              reason: 'Placeholder image service',
            });
          }

          // Check for missing alt text on meaningful images
          if (!alt && imgEl.width > 100) {
            missingAlt.push({ src: src.slice(0, 100) });
          }
        });

        return {
          brokenImages: broken,
          missingAltImages: missingAlt,
          hasBroken: broken.length > 0,
          hasMissingAlt: missingAlt.length > 5, // Only flag if many images lack alt
        };
      });

      const issues: string[] = [];

      if (imageAnalysis.hasBroken) {
        issues.push(`${imageAnalysis.brokenImages.length} broken image(s)`);
      }

      if (imageAnalysis.hasMissingAlt) {
        issues.push(`${imageAnalysis.missingAltImages.length} images without alt text`);
      }

      if (issues.length > 0) {
        return {
          pass: false,
          message: issues.join(', '),
          evidence: {
            brokenImages: imageAnalysis.brokenImages.slice(0, 5),
            missingAltImages: imageAnalysis.missingAltImages.slice(0, 5),
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
// Rule: Empty Data Displays - Tables, lists, grids with no content
// ============================================================================

export const ruleEmptyDataDisplays: RuntimeRule = {
  id: 'vibe/empty-data',
  name: 'Empty Data Displays',
  description: 'Detects tables, lists, or grids that render but have no data rows',
  severity: 'medium',

  check: async (context: RuleContext): Promise<RuntimeRuleResult> => {
    if (!context.page) {
      return { pass: true };
    }

    try {
      const page = context.page as {
        evaluate: <T>(fn: () => T) => Promise<T>;
      };

      const dataAnalysis = await page.evaluate(() => {
        const emptyContainers: Array<{ type: string; selector: string }> = [];

        // Check tables
        const tables = document.querySelectorAll('table');
        tables.forEach((table, index) => {
          const rows = table.querySelectorAll('tbody tr');
          const headerRows = table.querySelectorAll('thead tr');
          
          // Table with headers but no body rows
          if (headerRows.length > 0 && rows.length === 0) {
            emptyContainers.push({
              type: 'table',
              selector: table.id ? `#${table.id}` : `table:nth-of-type(${index + 1})`,
            });
          }
        });

        // Check lists that appear to be data lists
        const lists = document.querySelectorAll('ul[class*="list"], ol[class*="list"], [class*="data-list"], [role="list"]');
        lists.forEach((list, index) => {
          const items = list.querySelectorAll('li, [role="listitem"]');
          if (items.length === 0) {
            const htmlEl = list as HTMLElement;
            emptyContainers.push({
              type: 'list',
              selector: list.id ? `#${list.id}` : (htmlEl.className || `list-${index}`),
            });
          }
        });

        // Check grids
        const grids = document.querySelectorAll('[class*="grid"]:not(style *), [role="grid"]');
        grids.forEach((grid, index) => {
          const htmlEl = grid as HTMLElement;
          const children = Array.from(grid.children).filter(child => {
            const style = window.getComputedStyle(child);
            return style.display !== 'none';
          });
          
          // Grid container with no visible children
          if (children.length === 0 && htmlEl.offsetWidth > 200) {
            emptyContainers.push({
              type: 'grid',
              selector: grid.id ? `#${grid.id}` : (htmlEl.className?.split(' ')[0] || `grid-${index}`),
            });
          }
        });

        return {
          emptyContainers,
          hasEmpty: emptyContainers.length > 0,
        };
      });

      if (dataAnalysis.hasEmpty) {
        return {
          pass: false,
          message: `${dataAnalysis.emptyContainers.length} empty data container(s) found`,
          evidence: {
            emptyContainers: dataAnalysis.emptyContainers,
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
// Rule: Non-Interactive Elements - Elements that look clickable but aren't
// ============================================================================

export const ruleNonInteractive: RuntimeRule = {
  id: 'vibe/non-interactive',
  name: 'Non-Interactive Elements',
  description: 'Detects elements styled as interactive (buttons, links) but lacking proper semantics',
  severity: 'low',

  check: async (context: RuleContext): Promise<RuntimeRuleResult> => {
    if (!context.page) {
      return { pass: true };
    }

    try {
      const page = context.page as {
        evaluate: <T>(fn: () => T) => Promise<T>;
      };

      const nonInteractive = await page.evaluate(() => {
        const issues: Array<{ element: string; reason: string }> = [];

        // Find divs/spans styled as buttons
        const divButtons = document.querySelectorAll('div[class*="btn"], div[class*="button"], span[class*="btn"], span[class*="button"]');
        divButtons.forEach(el => {
          const htmlEl = el as HTMLElement;
          const hasRole = el.getAttribute('role') === 'button';
          const hasTabIndex = el.hasAttribute('tabindex');
          const hasOnClick = el.hasAttribute('onclick') || htmlEl.onclick !== null;
          
          if (!hasRole && !hasTabIndex && !hasOnClick) {
            issues.push({
              element: `<${el.tagName.toLowerCase()} class="${htmlEl.className.slice(0, 50)}">`,
              reason: 'Div/span styled as button but missing role="button", tabindex, and click handler',
            });
          }
        });

        // Find elements with cursor:pointer but no interactivity
        const allElements = document.querySelectorAll('div, span, p');
        allElements.forEach(el => {
          const style = window.getComputedStyle(el);
          if (style.cursor === 'pointer') {
            const htmlEl = el as HTMLElement;
            const isInteractive = 
              el.tagName === 'BUTTON' || 
              el.tagName === 'A' ||
              el.hasAttribute('onclick') ||
              el.getAttribute('role') === 'button' ||
              el.closest('button, a, [role="button"]');
            
            if (!isInteractive && htmlEl.textContent?.trim()) {
              // Only flag if it has content that looks interactive
              const text = htmlEl.textContent.trim().toLowerCase();
              const looksClickable = ['click', 'tap', 'select', 'choose', 'view', 'see', 'more', 'details'].some(
                word => text.includes(word)
              );
              
              if (looksClickable) {
                issues.push({
                  element: `<${el.tagName.toLowerCase()}> "${htmlEl.textContent.trim().slice(0, 30)}"`,
                  reason: 'Element has cursor:pointer and clickable text but no click handling',
                });
              }
            }
          }
        });

        return {
          issues: issues.slice(0, 10),
          hasIssues: issues.length > 0,
        };
      });

      // Only fail if multiple issues found (one or two might be false positives)
      if (nonInteractive.issues.length > 3) {
        return {
          pass: false,
          message: `${nonInteractive.issues.length} non-interactive elements styled as interactive`,
          evidence: {
            issues: nonInteractive.issues,
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
// Export all vibe rules
// ============================================================================

export const VIBE_RULES: RuntimeRule[] = [
  ruleDeadButtons,
  ruleEmptyRoutes,
  ruleBrokenLinks,
  ruleOrphanForms,
  ruleEternalLoading,
  rulePlaceholderText,
  ruleMissingImages,
  ruleEmptyDataDisplays,
  ruleNonInteractive,
];
