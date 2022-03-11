class EventFilter {
  constructor(id, type, config) {
    this.id = id;
    this.type = type;
    this.config = config;
  }

  toObject() {
    return {
      id: this.id,
      type: this.type,
      config: this.config,
    };
  }
}

module.exports = EventFilter;
