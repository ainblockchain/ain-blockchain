const semver = require('semver');
const {
  CURRENT_PROTOCOL_VERSION
} = require('../common/constants');

class VersionUtil {
  static isValidProtocolVersion(version) {
    if (!version || !semver.valid(version)) {
      return false;
    } else {
      return true;
    }
  }

  static isValidVersionMatch(ver) {
    return ver && semver.valid(semver.coerce(ver.min)) &&
      (!ver.max || semver.valid(semver.coerce(ver.max)));
  }

  static matchVersions(versionMap, ver) {
    let match = versionMap[ver];
    if (this.isValidVersionMatch(match)) {
      return match;
    }
    const majorVer = semver.major(ver);
    const majorMinorVer = `${majorVer}.${semver.minor(ver)}`;
    match = versionMap[majorMinorVer];
    if (this.isValidVersionMatch(match)) {
      return match;
    }
    match = versionMap[majorVer];
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
    } else if (semver.lt(coercedVer, this.minProtocolVersion) ||
      (this.maxProtocolVersion && semver.gt(coercedVer, this.maxProtocolVersion))) {
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

  static toMajorVersion(ver) {
    return semver.coerce(semver.major(ver)).version;
  }
}

module.exports = VersionUtil;
