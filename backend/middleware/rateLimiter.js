const rateLimit = require('express-rate-limit');

const defaultLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { status: 'error', msg: 'Terlalu banyak request, coba lagi nanti' },
  standardHeaders: true,
  legacyHeaders: false,
});
const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { status: 'error', msg: 'Terlalu banyak request, coba lagi nanti' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { defaultLimiter, strictLimiter };
