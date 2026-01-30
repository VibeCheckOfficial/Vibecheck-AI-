/**
 * Main entry point for testing
 */

import express from 'express';
import routes from './routes/api';
import { config, validateEnv } from './config/env';
import { authMiddleware } from './auth/middleware';

const app = express();

// Middleware
app.use(express.json());
app.use(authMiddleware);

// Routes
app.use(routes);

// Start server
validateEnv();
app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});

export default app;
