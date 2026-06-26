import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function dataRoot() {
    if (process.env.CUBBY_ENV === 'test') return '/tmp/cubby_test';
    if (process.env.CLOUDRON) return '/app/data';
    return path.resolve(__dirname, '../.data');
}

const root = dataRoot();

export default {
    dataRoot,

    USER_DATA_ROOT: path.join(root, 'data'),
    GROUPS_DATA_ROOT: path.join(root, 'groups'),
    THUMBNAIL_ROOT: path.join(root, 'thumbnails'),
    SESSION_PATH: path.join(root, 'sessions'),
    SESSION_SECRET_FILE_PATH: path.join(root, '.session.secret'),
    SEARCH_INDEX_PATH: path.join(root, '.recoll'),
    SKELETON_FOLDER: path.resolve(__dirname, '../skeleton'),
};
