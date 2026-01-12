const path = require('path');

exports = module.exports = {
    SESSION_SECRET_FILE_PATH: process.env.SESSION_SECRET_FILE_PATH ? path.resolve(process.env.SESSION_SECRET_FILE_PATH) : path.resolve(__dirname, '../.secret'),
    USER_DATA_ROOT: process.env.USER_DATA_PATH ? path.resolve(process.env.USER_DATA_PATH) : path.resolve(__dirname, '../.data'),
    GROUPS_DATA_ROOT: process.env.GROUPS_DATA_PATH ? path.resolve(process.env.GROUPS_DATA_PATH) : path.resolve(__dirname, '../.groups'),
    THUMBNAIL_ROOT: process.env.THUMBNAIL_PATH ? path.resolve(process.env.THUMBNAIL_PATH) : path.resolve(__dirname, '../.thumbnails'),
    SESSION_PATH: process.env.SESSION_PATH ? path.resolve(process.env.SESSION_PATH) : path.resolve(__dirname, '../.sessions'),
    SEARCH_INDEX_PATH: process.env.SEARCH_INDEX_PATH ? path.resolve(process.env.SEARCH_INDEX_PATH) : path.resolve(__dirname, '../.recoll'),
    SKELETON_FOLDER: process.env.SKELETON_FOLDER ? path.resolve(process.env.SKELETON_FOLDER) : path.resolve(__dirname, '../skeleton'),
    RECENTS_CACHE_PATH: process.env.RECENTS_CACHE_PATH ? path.resolve(process.env.RECENTS_CACHE_PATH) : path.resolve(__dirname, '../.recents.json'),
};
