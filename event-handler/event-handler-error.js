class EventHandlerError extends Error {
  constructor(code, message, clientFilterId = null) {
    super(message);
    this.code = code;
    this.clientFilterId = clientFilterId;
  }

  toObject() {
    return {
      code: this.code,
      message: this.message,
      ...(this.clientFilterId && {
        filter_id: this.clientFilterId
      })
    };
  }
}

module.exports = EventHandlerError;
