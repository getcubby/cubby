import { fetcher } from 'pankow';
import { API_ORIGIN } from '../utils';

// This is for the groupFolder settings API normal user requests go via the DirectoryModel

async function add(data) {
  const tmp = {
    name: data.name,
    slug: data.slug,
    path: data.path,
    members: data.members
  };

  const result = await fetcher.post(`${API_ORIGIN}/api/v1/settings/groupfolders`, tmp);
  if (result.status !== 200) throw result.body;

  return result.body.groupFolderId;
}

async function list() {
  const result = await fetcher.get(`${API_ORIGIN}/api/v1/settings/groupfolders`);
  if (result.status !== 200) throw result.body;

  return result.body.groupFolder;
}

async function update(id, data) {
  const tmp = {
    name: data.name,
    members: data.members
  };

  const result = await fetcher.put(`${API_ORIGIN}/api/v1/settings/groupfolders/${id}`, tmp);
  if (result.status !== 200) throw result.body;
}

async function remove(id, purge = true) {
  const result = await fetcher.del(`${API_ORIGIN}/api/v1/settings/groupfolders/${id}`, {}, { purge });
  if (result.status !== 200) throw result.body;
}

export default {
  add,
  list,
  update,
  remove,
};
