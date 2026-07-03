import { fetcher } from '@cloudron/pankow';
import { API_ORIGIN, parseResourcePath, toResourcePath } from '../utils.js';
import DirectoryModel from './DirectoryModel.js';

async function list() {
  let error, result;
  try {
    result = await fetcher.get(`${API_ORIGIN}/api/v1/favorites`);
  } catch (e) {
    error = e;
  }

  if (error || result.status !== 200) throw new Error('Failed to list favorites', { cause: error || result })

  const entries = [];

  for (const favorite of result.body.favorites) {
    const resource = parseResourcePath(toResourcePath(favorite));
    if (!resource) continue;

    let entry;
    try {
      entry = await DirectoryModel.get(resource);
    } catch (e) {
      continue;
    }

    entry.favorite = favorite;
    entry.star = true;
    entry.href = `#files${entry.resourcePath}`;
    entries.push(entry);
  }

  return entries;
}

async function create(data) {
  const tmp = {
    path: data.path
  };

  if (data.shareId) tmp.shareId = data.shareId;
  else tmp.owner = data.owner;

  let error, result;
  try {
    result = await fetcher.post(`${API_ORIGIN}/api/v1/favorites`, tmp);
  } catch (e) {
    error = e;
  }

  if (error || result.status !== 200) throw new Error('Failed to create favorite', { cause: error || result })

  return result.body.id;
}

async function remove(id) {
  let error, result;
  try {
    result = await fetcher.del(`${API_ORIGIN}/api/v1/favorites/${id}`);
  } catch (e) {
    error = e;
  }

  if (error || result.status !== 200) throw new Error('Failed to delete favorite', { cause: error || result })
}

export default {
  list,
  create,
  remove,
};
