/**
 * Doc Registry
 * 
 * Manages the canonical documentation registry for duplicate detection
 * and documentation system organization.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { glob } from 'glob';
import type {
  DocRegistry,
  DocEntry,
  DocType,
  DocAnchor,
  DocGuardConfig,
} from './types.js';
import { extractAnchors } from './anchor-extractor.js';
import { computeMinHash } from './similarity-detector.js';
import { getLogger, type Logger } from '../utils/logger.js';

const REGISTRY_VERSION = '1.0.0';

export interface DocRegistryOptions {
  projectRoot: string;
  config: DocGuardConfig;
}

export class DocRegistryManager {
  private projectRoot: string;
  private config: DocGuardConfig;
  private registry: DocRegistry | null = null;
  private logger: Logger;

  constructor(options: DocRegistryOptions) {
    this.projectRoot = options.projectRoot;
    this.config = options.config;
    this.logger = getLogger('docguard:registry');
  }

  /**
   * Get the full path to the registry file
   */
  private getRegistryPath(): string {
    return path.join(this.projectRoot, this.config.registryPath);
  }

  /**
   * Load registry from disk
   */
  async load(): Promise<DocRegistry> {
    if (this.registry) {
      return this.registry;
    }

    const registryPath = this.getRegistryPath();

    try {
      const content = await fs.readFile(registryPath, 'utf-8');
      this.registry = JSON.parse(content) as DocRegistry;
      this.logger.debug('Registry loaded', { docCount: this.registry.docs.length });
      return this.registry;
    } catch (error) {
      // Registry doesn't exist, create empty one
      this.registry = {
        version: REGISTRY_VERSION,
        lastScan: new Date().toISOString(),
        docs: [],
        canonicalByType: {},
      };
      this.logger.info('Created new empty registry');
      return this.registry;
    }
  }

  /**
   * Save registry to disk
   */
  async save(): Promise<void> {
    if (!this.registry) {
      throw new Error('Registry not loaded');
    }

    const registryPath = this.getRegistryPath();
    
    // Ensure directory exists
    await fs.mkdir(path.dirname(registryPath), { recursive: true });

    // Update canonical by type index
    this.registry.canonicalByType = this.buildTypeIndex();

    await fs.writeFile(
      registryPath,
      JSON.stringify(this.registry, null, 2),
      'utf-8'
    );

    this.logger.debug('Registry saved', { docCount: this.registry.docs.length });
  }

  /**
   * Build type index for fast lookup
   */
  private buildTypeIndex(): Record<DocType, string[]> {
    if (!this.registry) return {} as Record<DocType, string[]>;

    const index: Record<string, string[]> = {};
    
    for (const doc of this.registry.docs) {
      if (!index[doc.type]) {
        index[doc.type] = [];
      }
      index[doc.type].push(doc.canonicalPath);
    }

    return index as Record<DocType, string[]>;
  }

  /**
   * Scan project for docs and update registry
   */
  async scan(): Promise<{ added: number; updated: number; removed: number }> {
    await this.load();
    
    const stats = { added: 0, updated: 0, removed: 0 };
    const foundPaths = new Set<string>();

    // Find all markdown files in doc directories
    for (const docDir of this.config.docDirectories) {
      const pattern = docDir.endsWith('.md') 
        ? docDir 
        : path.join(docDir, '**/*.md');
      
      const matches = await glob(pattern, {
        cwd: this.projectRoot,
        ignore: this.config.ignorePatterns,
        nodir: true,
      });

      for (const match of matches) {
        foundPaths.add(match);
        const result = await this.processDoc(match);
        if (result === 'added') stats.added++;
        else if (result === 'updated') stats.updated++;
      }
    }

    // Remove docs that no longer exist
    const existingPaths = new Set(this.registry!.docs.map(d => d.canonicalPath));
    for (const existingPath of existingPaths) {
      if (!foundPaths.has(existingPath)) {
        this.removeDoc(existingPath);
        stats.removed++;
      }
    }

    this.registry!.lastScan = new Date().toISOString();
    await this.save();

    this.logger.info('Registry scan complete', stats);
    return stats;
  }

  /**
   * Process a single doc file
   */
  private async processDoc(relativePath: string): Promise<'added' | 'updated' | 'unchanged'> {
    const fullPath = path.join(this.projectRoot, relativePath);
    
    let content: string;
    let stats: { mtime: Date };
    
    try {
      content = await fs.readFile(fullPath, 'utf-8');
      stats = await fs.stat(fullPath);
    } catch {
      return 'unchanged';
    }

    const existing = this.findDoc(relativePath);
    const now = new Date().toISOString();

    // Extract metadata from doc
    const type = this.inferDocType(relativePath, content);
    const anchors = extractAnchors(content);
    const minHashSignature = computeMinHash(content);
    const title = this.extractTitle(content);
    const purpose = this.extractPurpose(content);
    const tags = this.extractTags(content, relativePath);

    if (existing) {
      // Check if doc changed
      const hasChanged = 
        existing.updatedAt !== stats.mtime.toISOString() ||
        JSON.stringify(existing.anchors) !== JSON.stringify(anchors);

      if (hasChanged) {
        existing.type = type;
        existing.anchors = anchors;
        existing.minHashSignature = minHashSignature;
        existing.title = title;
        existing.purpose = purpose;
        existing.tags = tags;
        existing.updatedAt = now;
        return 'updated';
      }
      return 'unchanged';
    }

    // Add new doc
    const entry: DocEntry = {
      docId: randomUUID(),
      canonicalPath: relativePath,
      type,
      tags,
      anchors,
      minHashSignature,
      createdAt: now,
      updatedAt: now,
      title,
      purpose,
    };

    this.registry!.docs.push(entry);
    return 'added';
  }

  /**
   * Infer document type from path and content
   */
  private inferDocType(relativePath: string, content: string): DocType {
    const lowerPath = relativePath.toLowerCase();
    const lowerContent = content.toLowerCase();

    if (lowerPath.includes('readme')) return 'readme';
    if (lowerPath.includes('changelog')) return 'changelog';
    if (lowerPath.includes('adr') || lowerContent.includes('# decision')) return 'adr';
    if (lowerPath.includes('runbook') || lowerContent.includes('## runbook')) return 'runbook';
    if (lowerPath.includes('spec') || lowerContent.includes('## specification')) return 'spec';
    if (lowerPath.includes('guide') || lowerContent.includes('## getting started')) return 'guide';
    if (lowerPath.includes('reference') || lowerContent.includes('## api reference')) return 'reference';

    return 'other';
  }

  /**
   * Extract title from doc (first H1)
   */
  private extractTitle(content: string): string | undefined {
    const match = content.match(/^#\s+(.+)$/m);
    return match?.[1]?.trim();
  }

  /**
   * Extract purpose statement (first paragraph after title)
   */
  private extractPurpose(content: string): string | undefined {
    // Find first paragraph after a heading
    const lines = content.split('\n');
    let foundHeading = false;
    const purposeLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('#')) {
        foundHeading = true;
        continue;
      }
      if (foundHeading && line.trim()) {
        // Skip code blocks
        if (line.startsWith('```')) break;
        purposeLines.push(line.trim());
        if (purposeLines.join(' ').length > 200) break;
      }
      if (foundHeading && purposeLines.length > 0 && !line.trim()) {
        break;
      }
    }

    const purpose = purposeLines.join(' ').slice(0, 200);
    return purpose || undefined;
  }

  /**
   * Extract tags from content and path
   */
  private extractTags(content: string, relativePath: string): string[] {
    const tags = new Set<string>();

    // Tags from path
    const pathParts = relativePath.split(/[/\\]/).filter(Boolean);
    for (const part of pathParts) {
      if (part !== 'docs' && !part.endsWith('.md')) {
        tags.add(part.toLowerCase());
      }
    }

    // Tags from headings
    const headings = content.match(/^##?\s+(.+)$/gm) || [];
    for (const heading of headings) {
      const text = heading.replace(/^##?\s+/, '').toLowerCase();
      const words = text.split(/\s+/).filter(w => w.length > 3);
      for (const word of words.slice(0, 3)) {
        tags.add(word);
      }
    }

    return Array.from(tags).slice(0, 10);
  }

  /**
   * Find a doc by path
   */
  findDoc(relativePath: string): DocEntry | undefined {
    return this.registry?.docs.find(d => d.canonicalPath === relativePath);
  }

  /**
   * Find a doc by ID
   */
  findDocById(docId: string): DocEntry | undefined {
    return this.registry?.docs.find(d => d.docId === docId);
  }

  /**
   * Get all docs of a specific type
   */
  getDocsByType(type: DocType): DocEntry[] {
    return this.registry?.docs.filter(d => d.type === type) ?? [];
  }

  /**
   * Get all docs
   */
  getAllDocs(): DocEntry[] {
    return this.registry?.docs ?? [];
  }

  /**
   * Remove a doc from registry
   */
  removeDoc(relativePath: string): boolean {
    if (!this.registry) return false;

    const index = this.registry.docs.findIndex(d => d.canonicalPath === relativePath);
    if (index >= 0) {
      this.registry.docs.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Add or update a doc entry
   */
  async upsertDoc(relativePath: string, content: string): Promise<DocEntry> {
    await this.load();
    await this.processDoc(relativePath);
    await this.save();
    return this.findDoc(relativePath)!;
  }

  /**
   * Find docs with similar MinHash signatures
   */
  findSimilarDocs(signature: number[], threshold = 0.8): Array<{ doc: DocEntry; similarity: number }> {
    if (!this.registry) return [];

    const results: Array<{ doc: DocEntry; similarity: number }> = [];

    for (const doc of this.registry.docs) {
      if (!doc.minHashSignature) continue;

      // Jaccard similarity from MinHash
      let matches = 0;
      const len = Math.min(signature.length, doc.minHashSignature.length);
      
      for (let i = 0; i < len; i++) {
        if (signature[i] === doc.minHashSignature[i]) {
          matches++;
        }
      }

      const similarity = matches / len;
      if (similarity >= threshold) {
        results.push({ doc, similarity });
      }
    }

    return results.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Find docs by anchor
   */
  findDocsByAnchor(anchorValue: string): DocEntry[] {
    if (!this.registry) return [];

    return this.registry.docs.filter(doc =>
      doc.anchors.some(a => a.value.includes(anchorValue))
    );
  }

  /**
   * Get registry stats
   */
  getStats(): {
    totalDocs: number;
    byType: Record<string, number>;
    avgAnchors: number;
    lastScan: string;
  } {
    if (!this.registry) {
      return { totalDocs: 0, byType: {}, avgAnchors: 0, lastScan: 'never' };
    }

    const byType: Record<string, number> = {};
    let totalAnchors = 0;

    for (const doc of this.registry.docs) {
      byType[doc.type] = (byType[doc.type] || 0) + 1;
      totalAnchors += doc.anchors.length;
    }

    return {
      totalDocs: this.registry.docs.length,
      byType,
      avgAnchors: this.registry.docs.length > 0 
        ? totalAnchors / this.registry.docs.length 
        : 0,
      lastScan: this.registry.lastScan,
    };
  }
}
