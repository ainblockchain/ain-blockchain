const semver = require('semver');
const {
  CURRENT_PROTOCOL_VERSION,
  PROTOCOL_VERSION_MAP
} = require('../common/constants');

class VersionUtil {
  static isValidVersionMatch(ver) {
    return ver && semver.valid(semver.coerce(ver.min)) &&
      (!ver.max || semver.valid(semver.coerce(ver.max)));
  }

  static matchVersions(ver) {
    let match = PROTOCOL_VERSION_MAP[ver];
    if (this.isValidVersionMatch(match)) {
      return match;
    }
    const majorVer = semver.major(ver);
    const majorMinorVer = `${majorVer}.${semver.minor(ver)}`;
    match = PROTOCOL_VERSION_MAP[majorMinorVer];
    if (this.isValidVersionMatch(match)) {
      return match;
    }
    match = PROTOCOL_VERSION_MAP[majorVer];
    if (this.isValidVersionMatch(match)) {
      return match;
    }
    return {};
  }

  static validateVersion(req, res, next) {
    let version = null;
    if (req.query.protoVer) {
      version = req.query.protoVer;
    } else if (req.body.params) {
      version = req.body.params.protoVer;
    }
    const coercedVer = semver.coerce(version);
    if (req.body.method === 'ain_getProtocolVersion' ||
      req.body.method === 'ain_checkProtocolVersion') {
      next();
    } else if (version === undefined) {
      res.status(200)
        .set('Content-Type', 'application/json')
        .send({
          code: 1,
          message: 'Protocol version not specified.',
          protoVer: CURRENT_PROTOCOL_VERSION
        })
        .end();
    } else if (!semver.valid(coercedVer)) {
      res.status(200)
        .set('Content-Type', 'application/json')
        .send({
          code: 1,
          message: 'Invalid protocol version.',
          protoVer: CURRENT_PROTOCOL_VERSION
        })
        .end();
    } else if (semver.lt(coercedVer, minProtocolVersion) ||
      (maxProtocolVersion && semver.gt(coercedVer, maxProtocolVersion))) {
      res.status(200)
        .set('Content-Type', 'application/json')
        .send({
          code: 1,
          message: 'Incompatible protocol version.',
          protoVer: CURRENT_PROTOCOL_VERSION
        })
        .end();
    } else {
      next();
    }
  }
}

module.exports = VersionUtil;
