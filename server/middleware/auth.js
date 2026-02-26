export function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

export function requireAdminSecret(req, res, next) {
  const secret = req.headers['x-admin-secret'] || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}
