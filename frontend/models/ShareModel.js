import { fetcher } from 'pankow';
import { API_ORIGIN } from '../utils.js';

async function list() {
  let error, result;
  try {
    result = await fetcher.get(`${API_ORIGIN}/api/v1/shares`);
  } catch (e) {
    error = e;
  }

  if (error || result.status !== 200) throw new Error('Failed to list shares', { cause: error || result })

  // translate for local development
  result.body.shares.forEach((s) => {
    s.file.previewUrl = `${API_ORIGIN}${s.file.previewUrl}`;
  });

  return result.body.shares;
}

async function create(data) {
  let tmp = {
    path: data.path,
    readonly: data.readonly
  };

  if (data.ownerUsername) tmp.ownerUsername = data.ownerUsername;
  if (data.ownerGroupfolder) tmp.ownerGroupfolder = data.ownerGroupfolder;
  if (data.expiresAt) tmp.expiresAt = data.expiresAt;
  if (data.receiverUsername) tmp.receiverUsername = data.receiverUsername;

  let error, result;
  try {
    result = await fetcher.post(`${API_ORIGIN}/api/v1/shares`, tmp);
  } catch (e) {
    error = e;
  }

  if (error || result.status !== 200) throw new Error('Failed to create shared', { cause: error || result })

  return result.body.shareId;
}

async function remove(shareId) {
  let error, result;
  try {
    result = await fetcher.del(`${API_ORIGIN}/api/v1/shares`, {}, { shareId });
  } catch (e) {
    error = e;
  }

  if (error || result.status !== 200) throw new Error('Failed to delete share', { cause: error || result })
}

function getLink(shareId) {
  return `${window.location.origin}/api/v1/shares/${shareId}?type=raw`;
}

export default {
  list,
  create,
  remove,
  getLink,
};
