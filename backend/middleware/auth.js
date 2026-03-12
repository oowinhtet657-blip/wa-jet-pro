const { API_KEY } = require('../config');

module.exports = function authMiddleware(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key || key !== API_KEY) {
    return res.status(401).json({ status: 'error', msg: 'Unauthorized' });
  }
  next();
};
