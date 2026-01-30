/**
 * Spinner component wrapper for loading states
 */

import React from 'react';
import { Box, Text } from 'ink';
import InkSpinner from 'ink-spinner';

interface SpinnerProps {
  label?: string;
  type?: 'dots' | 'line' | 'arc' | 'bounce';
}

export const Spinner: React.FC<SpinnerProps> = ({
  label = 'Loading...',
  type = 'dots',
}) => {
  return (
    <Box>
      <Text color="cyan">
        <InkSpinner type={type} />
      </Text>
      <Text> {label}</Text>
    </Box>
  );
};
