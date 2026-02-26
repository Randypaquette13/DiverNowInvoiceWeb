import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

export const meRouter = Router();

meRouter.get('/', requireAuth, (req, res) => {
  res.json({
    id: req.session.userId,
    email: req.session.userEmail,
    role: req.session.userRole,
  });
});
