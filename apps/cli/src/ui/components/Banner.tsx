/**
 * Ink-based Banner component for React terminal rendering
 */

import React from 'react';
import { Box, Text } from 'ink';
import gradient from 'gradient-string';
import figlet from 'figlet';

const brandGradient = gradient(['#00d4ff', '#7b2dff', '#ff00aa']);

interface BannerProps {
  showTagline?: boolean;
}

export const Banner: React.FC<BannerProps> = ({ showTagline = true }) => {
  let bannerText: string;

  try {
    bannerText = figlet.textSync('VibeCheck', {
      font: 'Standard',
      horizontalLayout: 'default',
    });
  } catch {
    bannerText = 'VibeCheck';
  }

  const coloredBanner = brandGradient.multiline(bannerText);

  return (
    <Box flexDirection="column" marginY={1}>
      <Text>{coloredBanner}</Text>
      {showTagline && (
        <Text dimColor>
          {'  '}Hallucination prevention for AI-assisted development
        </Text>
      )}
    </Box>
  );
};
