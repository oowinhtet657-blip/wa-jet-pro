const rateLimit = require('express-rate-limit');

// General limiter — semua API routes
const defaultLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { status: 'error', msg: 'Terlalu banyak request, coba lagi nanti' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict limiter — /cek dan /kirim (operasi bulk)
const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { status: 'error', msg: 'Terlalu banyak request, coba lagi nanti' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { defaultLimiter, strictLimiter };
