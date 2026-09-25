// Genesis-only state import for this isolated fork. Preserve legacy rule tombstones exactly.
const { getBlockchainConfig } = require('../../common/constants');
module.exports.data = [{ path: ['rules'], value: getBlockchainConfig('fork_legacy_rules.json') }];
