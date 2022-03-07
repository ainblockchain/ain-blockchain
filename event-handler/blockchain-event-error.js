class BlockchainEventError extends Error {
  constructor(filterId, code, message) {
    super(message);
    this.filterId = filterId; // globalFilterId
    this.code = code;
  }
}

module.exports = BlockchainEventError;
