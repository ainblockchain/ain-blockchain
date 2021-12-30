const semver = require('semver');
const { BlockchainConsts } = require('../common/constants');
const { DevClientApiResultCode } = require('../common/result-code');

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
          code: DevClientApiResultCode.PROTO_VERSION_NOT_SPECIFIED,
          message: 'Protocol version not specified.',
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        })
        .end();
    } else if (!semver.valid(coercedVer)) {
      res.status(200)
        .set('Content-Type', 'application/json')
        .send({
          code: DevClientApiResultCode.INVALID_PROTO_VERSION,
          message: 'Invalid protocol version.',
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        })
        .end();
    } else if (semver.lt(coercedVer, this.minProtocolVersion) ||
      (this.maxProtocolVersion && semver.gt(coercedVer, this.maxProtocolVersion))) {
      res.status(200)
        .set('Content-Type', 'application/json')
        .send({
          code: DevClientApiResultCode.INCOMPATIBLE_PROTO_VERSION,
          message: 'Incompatible protocol version.',
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
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
