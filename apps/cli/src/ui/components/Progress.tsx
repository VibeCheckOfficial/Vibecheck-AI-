/**
 * Multi-task progress component (Turbo-style)
 */

import React from 'react';
import { Box, Text } from 'ink';
import InkSpinner from 'ink-spinner';

export interface Task {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped';
  message?: string;
  duration?: number;
}

interface ProgressProps {
  tasks: Task[];
  title?: string;
}

const statusDisplay = {
  pending: { symbol: '○', color: 'gray' as const },
  running: { symbol: null, color: 'cyan' as const }, // Will use spinner
  success: { symbol: '✓', color: 'green' as const },
  error: { symbol: '✖', color: 'red' as const },
  skipped: { symbol: '◌', color: 'gray' as const },
};

export const Progress: React.FC<ProgressProps> = ({ tasks, title }) => {
  return (
    <Box flexDirection="column" marginY={1}>
      {title && (
        <Box marginBottom={1}>
          <Text bold>{title}</Text>
        </Box>
      )}

      {tasks.map((task) => {
        const display = statusDisplay[task.status];

        return (
          <Box key={task.id} marginLeft={1}>
            {task.status === 'running' ? (
              <Text color={display.color}>
                <InkSpinner type="dots" />
              </Text>
            ) : (
              <Text color={display.color}>{display.symbol}</Text>
            )}
            <Text> </Text>
            <Text
              color={task.status === 'error' ? 'red' : undefined}
              dimColor={task.status === 'skipped'}
            >
              {task.title}
            </Text>
            {task.duration !== undefined && task.status === 'success' && (
              <Text dimColor> ({formatDuration(task.duration)})</Text>
            )}
            {task.message && task.status === 'error' && (
              <Text color="red" dimColor>
                {' '}
                - {task.message}
              </Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
