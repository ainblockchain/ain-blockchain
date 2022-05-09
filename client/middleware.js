const rateLimit = require('express-rate-limit');

class Middleware {
  constructor () {
  }

  limiter() {
    return rateLimit({
      windowMs: 6 * 1000, // 1 minute
      max: 6 // limit each IP to 60 requests per windowMs
    });
  }
}

module.exports = Middleware;
