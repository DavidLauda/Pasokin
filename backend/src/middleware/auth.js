const authService = require('../services/authService');

function requireRole(...roles) {
  return async (req, res, next) => {
    try {
      const match = /^Bearer (\S+)$/i.exec(req.get('authorization') || '');
      const user = match && await authService.getUser(match[1]);
      if (!user) return res.status(401).json({ error: 'Silakan masuk terlebih dahulu' });
      const role = user.app_metadata?.pasokin_role;
      if (!roles.includes(role)) return res.status(403).json({ error: 'Akses tidak diizinkan untuk peran ini' });
      req.authUser = user;
      req.accessToken = match[1];
      next();
    } catch (error) { next(error); }
  };
}

module.exports = { requireRole };
