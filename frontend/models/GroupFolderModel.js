import { fetcher } from 'pankow';

// This is for the groupFolder settings API normal user requests go via the DirectoryModel

export function createGroupFolderModel(origin) {
  return {
    name: 'GroupFolderModel',
    async add(data) {
      let tmp = {
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
    async remove(groupFolderId, purge = true) {
      const result = await fetcher.del(`${origin}/api/v1/settings/groupfolders/${groupFolderId}`, { purge });
      if (result.status !== 200) throw result.body;
    }
  };
}

export default {
  createGroupFolderModel
};
