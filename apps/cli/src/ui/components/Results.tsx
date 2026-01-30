/**
 * Results display component for validation output
 */

import React from 'react';
import { Box, Text } from 'ink';

interface ResultItem {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  file?: string;
  line?: number;
}

interface ResultsProps {
  title?: string;
  items: ResultItem[];
  showSummary?: boolean;
}

const typeSymbols = {
  success: { symbol: '✓', color: 'green' as const },
  error: { symbol: '✖', color: 'red' as const },
  warning: { symbol: '⚠', color: 'yellow' as const },
  info: { symbol: 'ℹ', color: 'cyan' as const },
};

export const Results: React.FC<ResultsProps> = ({
  title,
  items,
  showSummary = true,
}) => {
  const counts = {
    success: items.filter((i) => i.type === 'success').length,
    error: items.filter((i) => i.type === 'error').length,
    warning: items.filter((i) => i.type === 'warning').length,
    info: items.filter((i) => i.type === 'info').length,
  };

  return (
    <Box flexDirection="column" marginY={1}>
      {title && (
        <Box marginBottom={1}>
          <Text bold>{title}</Text>
        </Box>
      )}

      {items.map((item, index) => {
        const { symbol, color } = typeSymbols[item.type];
        return (
          <Box key={index} marginLeft={1}>
            <Text color={color}>{symbol}</Text>
            <Text> </Text>
            {item.file && (
              <>
                <Text dimColor>{item.file}</Text>
                {item.line && <Text dimColor>:{item.line}</Text>}
                <Text> </Text>
              </>
            )}
            <Text>{item.message}</Text>
          </Box>
        );
      })}

      {showSummary && items.length > 0 && (
        <Box marginTop={1} marginLeft={1}>
          <Text dimColor>
            {counts.success > 0 && (
              <Text color="green">{counts.success} passed</Text>
            )}
            {counts.success > 0 && (counts.error > 0 || counts.warning > 0) && (
              <Text>, </Text>
            )}
            {counts.error > 0 && <Text color="red">{counts.error} errors</Text>}
            {counts.error > 0 && counts.warning > 0 && <Text>, </Text>}
            {counts.warning > 0 && (
              <Text color="yellow">{counts.warning} warnings</Text>
            )}
          </Text>
        </Box>
      )}
    </Box>
  );
};
