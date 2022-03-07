class BlockchainEventError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }

  toObject() {
    return {
      code: this.code,
      message: this.message,
    };
  }
}

module.exports = BlockchainEventError;
