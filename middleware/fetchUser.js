const jwt = require('jsonwebtoken')
const JWT_SECRET = 'ashar.2day@karachi'

const fetchUser = (req, res, next) => {
    const token = req.header('auth-token')
    const data = jwt.verify(token, JWT_SECRET)
    req.user = data.user
    next()
}

module.exports = fetchUser