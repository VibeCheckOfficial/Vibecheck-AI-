#!/usr/bin/env node
// src/cli/index.ts

import { Command } from 'commander';
import { scanCommand } from './commands/scan';
import { baselineCommand } from './commands/baseline';
import { hooksCommand } from './commands/hooks';
import { remediateCommand } from './commands/remediate';
import { initCommand } from './commands/init';

const program = new Command();

program
  .name('vibecheck')
  .description('Detect and eliminate mock, fake, and placeholder data from your codebase')
  .version('1.0.0');

program.addCommand(scanCommand);
program.addCommand(baselineCommand);
program.addCommand(hooksCommand);
program.addCommand(remediateCommand);
program.addCommand(initCommand);

program.parse();
