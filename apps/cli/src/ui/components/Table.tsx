/**
 * Table component for structured data display
 */

import React from 'react';
import { Box, Text } from 'ink';

interface Column<T> {
  key: keyof T;
  header: string;
  width?: number;
  align?: 'left' | 'right' | 'center';
  color?: string;
}

interface TableProps<T extends Record<string, unknown>> {
  data: T[];
  columns: Column<T>[];
  showHeader?: boolean;
  borderStyle?: 'single' | 'double' | 'none';
}

export function Table<T extends Record<string, unknown>>({
  data,
  columns,
  showHeader = true,
  borderStyle = 'single',
}: TableProps<T>): React.ReactElement {
  // Calculate column widths
  const columnWidths = columns.map((col) => {
    if (col.width) return col.width;
    const headerLen = col.header.length;
    const maxDataLen = Math.max(
      ...data.map((row) => String(row[col.key] ?? '').length)
    );
    return Math.max(headerLen, maxDataLen) + 2;
  });

  const totalWidth = columnWidths.reduce((a, b) => a + b, 0) + columns.length + 1;

  const border = borderStyle === 'single' ? '│' : borderStyle === 'double' ? '║' : '';
  const hBorder = borderStyle === 'single' ? '─' : borderStyle === 'double' ? '═' : '';

  const formatCell = (value: unknown, width: number, align: 'left' | 'right' | 'center' = 'left'): string => {
    const str = String(value ?? '');
    const padded = str.slice(0, width);
    const padding = width - padded.length;
    
    if (align === 'right') {
      return ' '.repeat(padding) + padded;
    } else if (align === 'center') {
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      return ' '.repeat(leftPad) + padded + ' '.repeat(rightPad);
    }
    return padded + ' '.repeat(padding);
  };

  return (
    <Box flexDirection="column">
      {borderStyle !== 'none' && (
        <Text dimColor>
          {hBorder.repeat(totalWidth)}
        </Text>
      )}

      {showHeader && (
        <>
          <Box>
            {borderStyle !== 'none' && <Text dimColor>{border}</Text>}
            {columns.map((col, i) => (
              <React.Fragment key={String(col.key)}>
                <Text bold>
                  {formatCell(col.header, columnWidths[i], col.align)}
                </Text>
                {borderStyle !== 'none' && <Text dimColor>{border}</Text>}
              </React.Fragment>
            ))}
          </Box>
          {borderStyle !== 'none' && (
            <Text dimColor>
              {hBorder.repeat(totalWidth)}
            </Text>
          )}
        </>
      )}

      {data.map((row, rowIndex) => (
        <Box key={rowIndex}>
          {borderStyle !== 'none' && <Text dimColor>{border}</Text>}
          {columns.map((col, i) => (
            <React.Fragment key={String(col.key)}>
              <Text color={col.color as never}>
                {formatCell(row[col.key], columnWidths[i], col.align)}
              </Text>
              {borderStyle !== 'none' && <Text dimColor>{border}</Text>}
            </React.Fragment>
          ))}
        </Box>
      ))}

      {borderStyle !== 'none' && (
        <Text dimColor>
          {hBorder.repeat(totalWidth)}
        </Text>
      )}
    </Box>
  );
}
