import { fetcher } from 'pankow';

// This is for the groupFolder settings API normal user requests go via the DirectoryModel

export function createGroupFolderModel(origin) {
  return {
    name: 'GroupFolderModel',
    async add(data) {
      const tmp = {
        name: data.name,
        slug: data.slug,
        path: data.path,
        members: data.members
      };

      const result = await fetcher.post(`${origin}/api/v1/settings/groupfolders`, tmp);
      if (result.status !== 200) throw result.body;

      return result.body.groupFolderId;
    },
    async list() {
      const result = await fetcher.get(`${origin}/api/v1/settings/groupfolders`);
      if (result.status !== 200) throw result.body;

      return result.body.groupFolder;
    },
    async update(id, data) {
      const tmp = {
        name: data.name,
        members: data.members
      };

      const result = await fetcher.put(`${origin}/api/v1/settings/groupfolders/${id}`, tmp);
      if (result.status !== 200) throw result.body;
    },
    async remove(id, purge = true) {
      const result = await fetcher.del(`${origin}/api/v1/settings/groupfolders/${id}`, { purge });
      if (result.status !== 200) throw result.body;
    }
  };
}

export default {
  createGroupFolderModel
};
