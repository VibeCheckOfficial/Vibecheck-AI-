/**
 * Skills Loader
 * 
 * Loads and manages SKILL.md files that define specialized capabilities.
 * Skills extend agent functionality with domain-specific knowledge.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';

export interface Skill {
  id: string;
  name: string;
  description: string;
  version?: string;
  author?: string;
  triggers: string[];
  content: string;
  filePath: string;
  metadata: Record<string, unknown>;
  loadedAt: Date;
}

export interface SkillsConfig {
  skillsDirectories: string[];
  filePattern: string;
  autoReload: boolean;
  cacheEnabled: boolean;
}

export interface SkillMatch {
  skill: Skill;
  relevance: number;
  matchedTriggers: string[];
}

const DEFAULT_CONFIG: SkillsConfig = {
  skillsDirectories: [
    '.cursor/skills',
    '.vibecheck/skills',
    'skills',
  ],
  filePattern: '**/SKILL.md',
  autoReload: false,
  cacheEnabled: true,
};

// SKILL.md frontmatter patterns
const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---/;
const METADATA_PATTERNS = {
  name: /^#\s+(.+)$/m,
  description: /^>\s*(.+)$/m,
  triggers: /triggers?:\s*\[([^\]]+)\]/i,
  version: /version:\s*(.+)/i,
  author: /author:\s*(.+)/i,
};

export class SkillsLoader {
  private config: SkillsConfig;
  private projectRoot: string;
  private skills: Map<string, Skill> = new Map();
  private loaded = false;

  constructor(projectRoot: string, config: Partial<SkillsConfig> = {}) {
    this.projectRoot = projectRoot;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Load all skills from configured directories
   */
  async loadAll(): Promise<Skill[]> {
    const skills: Skill[] = [];

    for (const dir of this.config.skillsDirectories) {
      const skillsDir = path.join(this.projectRoot, dir);
      
      try {
        await fs.access(skillsDir);
        const dirSkills = await this.loadFromDirectory(skillsDir);
        skills.push(...dirSkills);
      } catch {
        // Directory doesn't exist, skip
      }
    }

    // Store in cache
    for (const skill of skills) {
      this.skills.set(skill.id, skill);
    }

    this.loaded = true;
    return skills;
  }

  /**
   * Load skills from a specific directory
   */
  async loadFromDirectory(directory: string): Promise<Skill[]> {
    const skills: Skill[] = [];
    
    try {
      const pattern = path.join(directory, this.config.filePattern).replace(/\\/g, '/');
      const files = await glob(pattern, { nodir: true });

      for (const file of files) {
        try {
          const skill = await this.loadSkillFile(file);
          if (skill) {
            skills.push(skill);
          }
        } catch (err) {
          console.error(`Failed to load skill from ${file}:`, err);
        }
      }
    } catch {
      // Glob failed
    }

    return skills;
  }

  /**
   * Load a single SKILL.md file
   */
  async loadSkillFile(filePath: string): Promise<Skill | null> {
    const content = await fs.readFile(filePath, 'utf-8');
    return this.parseSkill(content, filePath);
  }

  /**
   * Parse SKILL.md content
   */
  parseSkill(content: string, filePath: string): Skill | null {
    const metadata: Record<string, unknown> = {};
    let mainContent = content;

    // Extract frontmatter if present
    const frontmatterMatch = content.match(FRONTMATTER_REGEX);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      mainContent = content.slice(frontmatterMatch[0].length).trim();
      
      // Parse YAML-like frontmatter
      const lines = frontmatter.split('\n');
      for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.slice(0, colonIndex).trim();
          let value: unknown = line.slice(colonIndex + 1).trim();
          
          // Parse arrays
          if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
            value = value.slice(1, -1).split(',').map(s => s.trim().replace(/['"]/g, ''));
          }
          
          metadata[key] = value;
        }
      }
    }

    // Extract name from first heading
    const nameMatch = mainContent.match(METADATA_PATTERNS.name);
    const name = (metadata.name as string) || nameMatch?.[1] || path.basename(path.dirname(filePath));

    // Extract description
    const descMatch = mainContent.match(METADATA_PATTERNS.description);
    const description = (metadata.description as string) || descMatch?.[1] || '';

    // Extract triggers
    let triggers: string[] = [];
    if (Array.isArray(metadata.triggers)) {
      triggers = metadata.triggers as string[];
    } else {
      const triggersMatch = mainContent.match(METADATA_PATTERNS.triggers);
      if (triggersMatch) {
        triggers = triggersMatch[1].split(',').map(t => t.trim().replace(/['"]/g, ''));
      }
    }

    // Add name-based triggers
    const nameWords = name.toLowerCase().split(/\W+/);
    triggers = [...new Set([...triggers, ...nameWords.filter(w => w.length > 2)])];

    // Generate ID from path
    const relativePath = path.relative(this.projectRoot, filePath);
    const id = relativePath.replace(/[\/\\]/g, '-').replace(/\.md$/i, '').toLowerCase();

    return {
      id,
      name,
      description,
      version: metadata.version as string | undefined,
      author: metadata.author as string | undefined,
      triggers,
      content: mainContent,
      filePath,
      metadata,
      loadedAt: new Date(),
    };
  }

  /**
   * Get all loaded skills
   */
  getAll(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get a skill by ID
   */
  get(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  /**
   * Find skills matching a query
   */
  findMatching(query: string): SkillMatch[] {
    const queryWords = query.toLowerCase().split(/\W+/).filter(w => w.length > 2);
    const matches: SkillMatch[] = [];

    for (const skill of this.skills.values()) {
      const matchedTriggers: string[] = [];
      let relevance = 0;

      // Check trigger matches
      for (const trigger of skill.triggers) {
        const triggerLower = trigger.toLowerCase();
        
        for (const word of queryWords) {
          if (triggerLower.includes(word) || word.includes(triggerLower)) {
            matchedTriggers.push(trigger);
            relevance += 1;
          }
        }
      }

      // Check name match
      const nameLower = skill.name.toLowerCase();
      for (const word of queryWords) {
        if (nameLower.includes(word)) {
          relevance += 0.5;
        }
      }

      // Check description match
      const descLower = skill.description.toLowerCase();
      for (const word of queryWords) {
        if (descLower.includes(word)) {
          relevance += 0.25;
        }
      }

      if (relevance > 0) {
        matches.push({
          skill,
          relevance,
          matchedTriggers: [...new Set(matchedTriggers)],
        });
      }
    }

    // Sort by relevance
    return matches.sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * Get the best matching skill for a task
   */
  getBestMatch(task: string): Skill | null {
    const matches = this.findMatching(task);
    return matches.length > 0 ? matches[0].skill : null;
  }

  /**
   * Get skill content formatted for prompt injection
   */
  getSkillPrompt(skillId: string): string | null {
    const skill = this.skills.get(skillId);
    if (!skill) return null;

    return `## Skill: ${skill.name}

${skill.description}

### Instructions

${skill.content}`;
  }

  /**
   * Get multiple skills formatted for prompt injection
   */
  getCombinedSkillsPrompt(skillIds: string[]): string {
    const sections: string[] = [];

    for (const id of skillIds) {
      const prompt = this.getSkillPrompt(id);
      if (prompt) {
        sections.push(prompt);
      }
    }

    if (sections.length === 0) {
      return '';
    }

    return `# Applied Skills\n\n${sections.join('\n\n---\n\n')}`;
  }

  /**
   * Reload all skills
   */
  async reload(): Promise<Skill[]> {
    this.skills.clear();
    this.loaded = false;
    return this.loadAll();
  }

  /**
   * Check if skills are loaded
   */
  isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Get skill count
   */
  count(): number {
    return this.skills.size;
  }
}
