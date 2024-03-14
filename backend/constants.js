'use strict';

var path = require('path');

exports = module.exports = {
    FRONTEND_ROOT: path.resolve('public'),
    USER_DATA_ROOT: process.env.USER_DATA_PATH || path.resolve(__dirname, '../.data'),
    GROUPS_DATA_ROOT: process.env.GROUPS_DATA_PATH || path.resolve(__dirname, '../.groups'),
    THUMBNAIL_ROOT: process.env.THUMBNAIL_PATH || path.resolve(__dirname, '../.thumbnails'),
    SESSION_PATH: process.env.SESSION_PATH || path.resolve(__dirname, '../.sessions')
};
