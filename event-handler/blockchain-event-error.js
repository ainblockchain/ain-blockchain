class BlockchainEventError extends Error {
  constructor(filterId, message) {
    super(message);
    this.filterId = filterId;
  }
}

module.exports = BlockchainEventError;
