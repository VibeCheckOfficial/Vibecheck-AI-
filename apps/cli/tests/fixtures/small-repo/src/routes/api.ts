/**
 * API Routes for testing
 */

import express from 'express';

const router = express.Router();

// Public routes
router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

router.get('/api/public/info', (req, res) => {
  res.json({ version: '1.0.0' });
});

// Authenticated routes
router.get('/api/users', requireAuth, (req, res) => {
  res.json({ users: [] });
});

router.post('/api/users', requireAuth, requireAdmin, (req, res) => {
  res.status(201).json({ id: '1' });
});

// Middleware stub
function requireAuth(req: Request, res: Response, next: NextFunction) {
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  next();
}

export default router;
