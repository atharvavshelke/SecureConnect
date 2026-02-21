const path = require('path');
const { NODE_ENV } = require('../config/env');

const errorHandler = (err, req, res, next) => {
    console.error(err.stack);

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    // Check if the request expects an HTML response (e.g., standard browser navigation)
    if (req.accepts('html')) {
        res.status(statusCode).sendFile(path.join(__dirname, '../../public', '500.html'));
        return;
    }

    // Otherwise, return JSON for API requests
    res.status(statusCode).json({
        error: message,
        ...(NODE_ENV === 'development' && { stack: err.stack })
    });
};

module.exports = errorHandler;
