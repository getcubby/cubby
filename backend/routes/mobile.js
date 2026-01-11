'use strict';

exports = module.exports = {
    getConfig,
};

const HttpSuccess = require('connect-lastmile').HttpSuccess;

// Public endpoint - returns available authentication methods for mobile clients
function getConfig(req, res, next) {
    const config = {
        methods: [ 'oidc' ],
        oidc: { loginUrl: '/api/v1/mobile/start' }
    };

    next(new HttpSuccess(200, config));
}
