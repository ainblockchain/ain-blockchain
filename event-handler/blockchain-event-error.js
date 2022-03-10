class BlockchainEventError extends Error {
  constructor(code, message, globalFilterId = null, clientFilterId = null) {
    super(message);
    this.code = code;
    this.globalFilterId = globalFilterId;
    this.clientFilterId = clientFilterId;
  }

  toObject() {
    return {
      code: this.code,
      message: this.message,
    };
  }
}

module.exports = BlockchainEventError;
