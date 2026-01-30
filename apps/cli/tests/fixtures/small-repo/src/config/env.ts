/**
 * Environment configuration for testing
 */

export const config = {
  port: process.env.PORT || 3000,
  databaseUrl: process.env.DATABASE_URL,
  apiKey: process.env.API_KEY,
  nodeEnv: process.env.NODE_ENV || 'development',
  sessionSecret: process.env.SESSION_SECRET,
};

export function validateEnv(): void {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
}
