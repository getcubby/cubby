import { fetcher } from 'pankow';

export function createFavoriteModel(origin) {
  return {
    name: 'FavoriteModel',
    async list() {
      let error, result;
      try {
        result = await fetcher.get(`${origin}/api/v1/favorites`);
      } catch (e) {
        error = e;
      }

      if (error || result.status !== 200) throw new Error('Failed to list favorites', { cause: error || result })

      // translate for local development
      result.body.favorites.forEach((f) => {
        f.previewUrl = `${origin}${f.previewUrl}`;

        // we don't know from which resource it is yet :/
        if (f.share) f.href = `#files/shares/${f.share.id}${f.filePath}`;
        else if (f.group) f.href = `#files/groupfolders/${f.group.id}${f.filePath}`;
        else f.href = `#files/home${f.filePath}`;
      });

      return result.body.favorites;
    },
    async create(data) {
      let tmp = {
        owner: data.owner,
        path: data.path
      };

      let error, result;
      try {
        result = await fetcher.post(`${origin}/api/v1/favorites`, tmp);
      } catch (e) {
        error = e;
      }

      if (error || result.status !== 200) throw new Error('Failed to create favorite', { cause: error || result })

      return result.body.id;
    },
    async remove(id) {
      let error, result;
      try {
        result = await fetcher.del(`${origin}/api/v1/favorites/${id}`);
      } catch (e) {
        error = e;
      }

      if (error || result.status !== 200) throw new Error('Failed to delete favorite', { cause: error || result })
    }
  };
}

export default {
  createFavoriteModel
};
