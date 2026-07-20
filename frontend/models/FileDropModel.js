import { fetcher } from '@cloudron/pankow';
import { API_ORIGIN } from '../utils.js';

async function list() {
  let error, result;
  try {
    result = await fetcher.get(`${API_ORIGIN}/api/v1/filedrops`);
  } catch (e) {
    error = e;
  }

  if (error || result.status !== 200) throw new Error('Failed to list filedrops', { cause: error || result });

  return result.body.filedrops;
}

async function create(data) {
  let tmp = {
    path: data.path
  };

  if (data.ownerUsername) tmp.ownerUsername = data.ownerUsername;
  if (data.ownerGroupfolder) tmp.ownerGroupfolder = data.ownerGroupfolder;
  if (typeof data.expiresAt === 'number' && Number.isFinite(data.expiresAt) && data.expiresAt > 0) tmp.expiresAt = data.expiresAt;

  let error, result;
  try {
    result = await fetcher.post(`${API_ORIGIN}/api/v1/filedrops`, tmp);
  } catch (e) {
    error = e;
  }

  if (error || result.status !== 200) throw new Error('Failed to create filedrop', { cause: error || result });

  return result.body.filedropId;
}

async function remove(filedropId) {
  let error, result;
  try {
    result = await fetcher.del(`${API_ORIGIN}/api/v1/filedrops`, {}, { filedropId });
  } catch (e) {
    error = e;
  }

  if (error || result.status !== 200) throw new Error('Failed to delete filedrop', { cause: error || result });
}

function getLink(filedropId) {
  return `${window.location.origin}/filedrop/${filedropId}`;
}

export default {
  list,
  create,
  remove,
  getLink,
};
