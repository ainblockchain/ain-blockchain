class InvalidPermissionsError extends Error {
    constructor(...args) {
        super(...args)
        Error.captureStackTrace(this, InvalidPermissionsError)
    }
}


module.exports = InvalidPermissionsError