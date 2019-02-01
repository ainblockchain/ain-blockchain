class InvalidPerissonsError extends Error {
    constructor(...args) {
        super(...args)
        Error.captureStackTrace(this, InvalidPerissonsError)
    }
}


module.exports = InvalidPerissonsError