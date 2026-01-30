#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";

const server = new McpServer({
  name: "project-context-server",
  version: "1.0.0"
});

// Tool: Analyze project structure
server.tool(
  "analyze_structure",
  "Analyzes project directory structure and returns summary",
  {
    rootPath: z.string().describe("Root directory to analyze"),
    depth: z.number().optional().describe("Max depth (default: 3)")
  },
  async ({ rootPath, depth = 3 }) => {
    const structure = await analyzeDirectory(rootPath, depth);
    return {
      content: [{
        type: "text",
        text: JSON.stringify(structure, null, 2)
      }]
    };
  }
);

// Tool: Validate TypeScript configuration
server.tool(
  "validate_tsconfig",
  "Validates tsconfig.json against monorepo best practices",
  {
    configPath: z.string().describe("Path to tsconfig.json")
  },
  async ({ configPath }) => {
    const issues = await validateTsConfig(configPath);
    return {
      content: [{
        type: "text",
        text: issues.length === 0 
          ? "✓ Configuration valid" 
          : `Issues found:\n${issues.join('\n')}`
      }]
    };
  }
);

interface DirectoryNode {
  name: string;
  type: "file" | "directory";
  children?: DirectoryNode[];
}

async function analyzeDirectory(
  dirPath: string,
  maxDepth: number,
  currentDepth: number = 0
): Promise<DirectoryNode> {
  const name = path.basename(dirPath);
  
  try {
    const stats = await fs.stat(dirPath);
    
    if (!stats.isDirectory()) {
      return { name, type: "file" };
    }
    
    if (currentDepth >= maxDepth) {
      return { name, type: "directory", children: [] };
    }
    
    const entries = await fs.readdir(dirPath);
    const children: DirectoryNode[] = [];
    
    for (const entry of entries) {
      // Skip node_modules and hidden directories
      if (entry === "node_modules" || entry.startsWith(".")) {
        continue;
      }
      
      const childPath = path.join(dirPath, entry);
      const childNode = await analyzeDirectory(childPath, maxDepth, currentDepth + 1);
      children.push(childNode);
    }
    
    return { name, type: "directory", children };
  } catch (error) {
    return { name, type: "file" };
  }
}

async function validateTsConfig(configPath: string): Promise<string[]> {
  const issues: string[] = [];
  
  try {
    const content = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(content);
    
    const compilerOptions = config.compilerOptions || {};
    
    // Check for strict mode
    if (!compilerOptions.strict) {
      issues.push("⚠ 'strict' mode is not enabled");
    }
    
    // Check for isolated modules
    if (!compilerOptions.isolatedModules) {
      issues.push("⚠ 'isolatedModules' should be true for bundler compatibility");
    }
    
    // Check for proper module resolution
    if (!compilerOptions.moduleResolution) {
      issues.push("⚠ 'moduleResolution' should be explicitly set");
    }
    
    // Check for skipLibCheck
    if (!compilerOptions.skipLibCheck) {
      issues.push("ℹ Consider enabling 'skipLibCheck' for faster builds");
    }
    
  } catch (error) {
    issues.push(`Error reading config: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  return issues;
}

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Project Context MCP Server running");
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
