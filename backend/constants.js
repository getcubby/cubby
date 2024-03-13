'use strict';

var path = require('path');

exports = module.exports = {
    FRONTEND_ROOT: path.resolve('public'),
    USER_DATA_ROOT: process.env.CLOUDRON ? '/app/data/data/' : path.resolve(__dirname, '../.data'),
    GROUPS_DATA_ROOT: process.env.CLOUDRON ? '/app/data/groups/' : path.resolve(__dirname, '../.groups'),
    THUMBNAIL_ROOT: process.env.CLOUDRON ? '/app/data/thumbnails/' : path.resolve(__dirname, '../.thumbnails')
};
