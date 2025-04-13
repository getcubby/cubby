import { fetcher } from 'pankow';

export function createShareModel(origin) {
  return {
    name: 'ShareModel',
    async list() {
      let error, result;
      try {
        result = await fetcher.get(`${origin}/api/v1/shares`);
      } catch (e) {
        error = e;
      }

      if (error || result.status !== 200) throw new Error('Failed to list shares', { cause: error || result })

      // translate for local development
      result.body.shares.forEach((s) => {
        s.file.previewUrl = `${origin}${s.file.previewUrl}`;
      });

      return result.body.shares;
    },
    async create(data) {
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
        result = await fetcher.post(`${origin}/api/v1/shares`, tmp);
      } catch (e) {
        error = e;
      }

      if (error || result.status !== 200) throw new Error('Failed to create shared', { cause: error || result })

      return result.body.shareId;
    },
    async remove(shareId) {
      let error, result;
      try {
        result = await fetcher.del(`${origin}/api/v1/shares`, {}, { shareId });
      } catch (e) {
        error = e;
      }

      if (error || result.status !== 200) throw new Error('Failed to delete share', { cause: error || result })
    },
    getLink(shareId) {
      return `${window.location.origin}/api/v1/shares/${shareId}?type=raw`;
    }
  };
}

export default {
  createShareModel
};
