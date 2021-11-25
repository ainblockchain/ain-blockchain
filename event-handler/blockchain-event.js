class BlockchainEvent {
  constructor(type, payload = {}) {
    this.type = type;
    this.payload = payload;
  }

  toObject() {
    return {
      type: this.type,
      payload: this.payload,
    };
  }
}

module.exports = BlockchainEvent;
