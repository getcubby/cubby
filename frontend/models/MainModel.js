import { fetcher } from 'pankow';

export function createMainModel(origin) {
  let configCache = {};

  return {
    name: 'MainModel',
    async getProfile() {
      const result = await fetcher.get(`${origin}/api/v1/profile`);
      if (result.status !== 200) return null;

      return {
        username: result.body.username,
        email: result.body.email,
        displayName: result.body.displayName,
        admin: !!result.body.admin
      };
    },
    async getConfig() {
      let error, result;
      try {
        result = await fetcher.get(`${origin}/api/v1/config`);
      } catch (e) {
        error = e;
      }

      if (error || result.status !== 200) throw new Error('Failed to get config', { cause: error || result })

      configCache = {
        viewers: {
          collabora: result.body.viewers.collabora || {}
        }
      };

      return configCache;
    },
    async getWopiHost() {
      let error, result;
      try {
        result = await fetcher.get(`${origin}/api/v1/settings/office`);
      } catch (e) {
        error = e;
      }

      if (error || result.status !== 200) throw new Error('Failed to get wopi host', { cause: error || result })

      return result.body.host || '';
    },
    async setWopiHost(wopiHost) {
      const result = await fetcher.put(`${origin}/api/v1/settings/office`, { host: wopiHost });
      if (result.status === 412) throw new Error(result.body.message);
      if (result.status !== 200) throw new Error(`Unexptected ok status code ${result.status} ${result.statusText}`);
    },
    async getUsers() {
      let error, result;
      try {
        result = await fetcher.get(`${origin}/api/v1/users`);
      } catch (e) {
        error = e;
      }

      if (error || result.status !== 200) throw new Error('Failed to get users', { cause: error || result })

      return result.body.users;
    },
    async setWebDavPassword(password) {
      let error, result;
      try {
        result = await fetcher.put(`${origin}/api/v1/users`, { password });
      } catch (e) {
        error = e;
      }

      if (error || result.status !== 200) throw new Error('Failed to set password', { cause: error || result })
    },
    async setAdmin(username, isAdmin) {
      let error, result;
      try {
        result = await fetcher.put(`${origin}/api/v1/users/${username}/admin`, { admin: isAdmin });
      } catch (e) {
        error = e;
      }

      if (error || result.status !== 200) throw new Error('Failed to set admin status', { cause: error || result })
    },
    canHandleWithOffice(entry) {
      if (!this.configCache) return false;
      if (!this.configCache.viewers) return false;
      if (!this.configCache.viewers.collabora) return false;
      if (!this.configCache.viewers.collabora.extensions) return false;

      return this.configCache.viewers.collabora.extensions.find(function (e) { return entry.fileName.endsWith(e); });
    },
    async getOfficeHandle(entry) {
      let error, result;
      try {
        result = await fetcher.get(`${origin}/api/v1/office/handle`, { resourcePath: entry.resourcePath });
      } catch (e) {
        error = e;
      }

      if (error || result.status !== 200) throw new Error('Failed to get office handle', { cause: error || result })

      return result.body;
    },
    async getCollabHandle(entry) {
      // TODO we may want to generate the ID this based on the resource path on the server to be able to check,
      //      if the markdown file itself has changed on disk and we would need to discard the ydoc fragment (we would lose collab history though)

      let error, result;
      try {
        result = await fetcher.get(`${origin}/api/v1/collab/handle`, { path: entry.resourcePath });
      } catch (e) {
        error = e;
      }

      if (error || !(result.status === 200 || result.status === 201)) throw new Error('Failed to get collab handle', { cause: error || result })

      return { isNew: result.status === 201, id: result.body.id, fragmentName: result.body.fragmentName };
    },
    async recent() {
      let error, result;
      try {
        result = await fetcher.get(`${origin}/api/v1/recent`, { days_ago: 100 });
      } catch (e) {
        error = e;
      }

      if (error || result.status !== 200) throw new Error('Failed to fetch recent', { cause: error || result })

      const entries = result.body.entries;

      // only needed for local development
      entries.forEach((e) => {
        e.previewUrl = `${origin}${e.previewUrl}`;
        e.parentFolderUrl = '#files/home' + e.filePath.slice(0, -e.fileName.length);
      });

      return entries;
    },
    async search(query) {
      let error, result;
      try {
        result = await fetcher.get(`${origin}/api/v1/search`, { query });
      } catch (e) {
        error = e;
      }

      if (error || result.status !== 200) throw new Error('Failed to search', { cause: error || result })

      // only needed for local development
      result.body.results.forEach((e) => { e.entry.previewUrl = `${origin}${e.entry.previewUrl}`; });

      return result.body.results;
    },
    async logout() {
      try {
        await fetcher.get(`${origin}/api/v1/logout`);
      } catch (e) {
        console.error('Error logging out', e);
      }
    }
  };
}

export default {
  createMainModel
};
