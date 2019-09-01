class InvalidPermissionsError extends Error {
  constructor(...args) {
    super(...args)
    Error.captureStackTrace(this, InvalidPermissionsError)
  }
}

class InvalidArgumentsError extends Error {
  constructor(...args) {
    super(...args)
    Error.captureStackTrace(this, InvalidArgumentsError)
  }
}

module.exports = {
  InvalidPermissionsError,
  InvalidArgumentsError
};
