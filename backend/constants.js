const path = require('path');

exports = module.exports = {
    SESSION_SECRET_FILE_PATH: path.resolve(process.env.SESSION_SECRET_FILE_PATH) || path.resolve(__dirname, '../.secret'),
    USER_DATA_ROOT: path.resolve(process.env.USER_DATA_PATH) || path.resolve(__dirname, '../.data'),
    GROUPS_DATA_ROOT: path.resolve(process.env.GROUPS_DATA_PATH) || path.resolve(__dirname, '../.groups'),
    THUMBNAIL_ROOT: path.resolve(process.env.THUMBNAIL_PATH) || path.resolve(__dirname, '../.thumbnails'),
    SESSION_PATH: path.resolve(process.env.SESSION_PATH) || path.resolve(__dirname, '../.sessions'),
    SEARCH_INDEX_PATH: path.resolve(process.env.SEARCH_INDEX_PATH) || path.resolve(__dirname, '../.recoll'),
};
