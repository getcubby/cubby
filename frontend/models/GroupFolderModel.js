import { fetcher } from 'pankow';

// This is for the groupFolder settings API normal user requests go via the DirectoryModel

export function createGroupFolderModel(origin) {
  return {
    name: 'GroupFolderModel',
    async create(data) {
      let tmp = {
        name: data.name,
        path: data.path,
        users: data.users
      };

      let error, result;
      try {
        result = await fetcher.post(`${origin}/api/v1/settings/groupfolders`, tmp);
      } catch (e) {
        error = e;
      }

      if (error || result.status !== 200) throw new Error('Failed to create groupFolder', { cause: error || result })

      return result.body.groupFolderId;
    },
    async list() {
      let error, result;
      try {
        result = await fetcher.get(`${origin}/api/v1/settings/groupfolders`);
      } catch (e) {
        error = e;
      }

      if (error || result.status !== 200) throw new Error('Failed to list groupFolders', { cause: error || result })

      return result.body.groupFolder;
    },
    async remove(groupFolderId) {
      let error, result;
      try {
        result = await fetcher.del(`${origin}/api/v1/settings/groupfolders/${groupFolderId}`);
      } catch (e) {
        error = e;
      }

      if (error || result.status !== 200) throw new Error('Failed to delete groupFolder', { cause: error || result })
    }
  };
}

export default {
  createGroupFolderModel
};
