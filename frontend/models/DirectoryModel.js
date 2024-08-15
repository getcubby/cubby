import fetcher from '../fetcher.js';
import { sanitize, pathJoin } from 'pankow/utils';
import { parseResourcePath } from '../utils.js';

export function DirectoryModelError(reason, errorOrMessage) {
    Error.call(this);

    this.name = this.constructor.name;
    this.reason = reason;
    this.details = {};

    if (typeof errorOrMessage === 'undefined') {
        this.message = reason;
    } else if (typeof errorOrMessage === 'string') {
        this.message = errorOrMessage;
    } else { // error object
        this.message = errorOrMessage.message;
        this.nestedError = errorOrMessage;
        Object.assign(this); // copy enumerable properies
    }
}

DirectoryModelError.NO_AUTH = 'Not authorized';
DirectoryModelError.NOT_ALLOWED = 'not allowed';
DirectoryModelError.CONFLICT = 'conflict';
DirectoryModelError.GENERIC = 'generic';

DirectoryModelError.prototype.toPlainObject = function () {
    return Object.assign({}, { message: this.message, reason: this.reason }, this.details);
};

function insertFilenameModifier(filePath, extension, modifier) {
    return filePath.substring(0, filePath.length-extension.length-1) + modifier + '.' + extension;
}

export function createDirectoryModel(origin) {
  return {
    name: 'DirectoryModel',
    async get(resource) {
      const result = await fetcher.get(`${origin}/api/v1/files`, { type: 'json', path: resource.resourcePath });

      const entry = result.body;

      // translate for pankow
      entry.name = entry.fileName;
      entry.filePath = entry.filePath || resource.path;
      entry.folderPath = entry.filePath.slice(-entry.fileName.length);
      entry.previewUrl = `${origin}${entry.previewUrl}`;
      entry.modified = new Date(entry.mtime);
      entry.type = entry.isDirectory ? 'directory' : 'file',
      entry.isBinary = !!entry.isBinary;
      entry.icon = entry.previewUrl;
      entry.resourcePath = resource.resourcePath;
      entry.resource = parseResourcePath(entry.resourcePath);
      entry.fullFileUrl = `${origin}/api/v1/files?path=${encodeURIComponent(entry.resourcePath)}&type=raw`;
      entry.downloadFileUrl = `${origin}/api/v1/files?path=${encodeURIComponent(entry.resourcePath)}&type=download`;
      entry.isSharedWith = !!entry.sharedWith.length;

      // this prepares the entries to be compatible with all components
      entry.files.forEach(child => {
        child.name = child.fileName;
        child.folderPath = entry.folderPath.slice(-child.fileName.length);
        child.previewUrl = `${origin}${child.previewUrl}`;
        child.modified = new Date(child.mtime);
        child.type = child.isDirectory ? 'directory' : 'file',
        entry.isBinary = !!entry.isBinary;
        child.icon = child.previewUrl;

        // shares need to add the share id if we are on meta toplevel
        if (entry.resourcePath === '/shares/') child.resourcePath = sanitize(`${resource.resourcePath}/${child.share.id}`);
        else child.resourcePath = sanitize(`${resource.resourcePath}/${child.fileName}`);

        child.resource = parseResourcePath(child.resourcePath);
        child.fullFileUrl = `${origin}/api/v1/files?path=${encodeURIComponent(child.resourcePath)}&type=raw`;
        child.downloadFileUrl = `${origin}/api/v1/files?path=${encodeURIComponent(child.resourcePath)}&type=download`;
        child.isSharedWith = !!child.sharedWith.length;
      });

      return entry;
    },
    async getRawContent(resource) {
      const result = await fetcher.get(`${origin}/api/v1/files`, { type: 'raw', path: resource.resourcePath });
      return result.body;
    },
    async saveFile(resource, content) {
      const file = new File([ content ], '');

      const req = new Promise(function (resolve, reject) {
        const xhr = new XMLHttpRequest();
        xhr.withCredentials = true;

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(xhr.response);
          } else if (xhr.status === 409) {
            reject(new DirectoryModelError(DirectoryModelError.CONFLICT))
          } else if (xhr.status === 401) {
            reject(new DirectoryModelError(DirectoryModelError.NO_AUTH));
          } else if (xhr.status === 403) {
            reject(new DirectoryModelError(DirectoryModelError.NOT_ALLOWED));
          } else {
            reject(new DirectoryModelError(DirectoryModelError.GENERIC, {
              status: xhr.status,
              statusText: xhr.statusText
            }));
          }
        });
        xhr.addEventListener('error', () => {
          reject(new DirectoryModelError(DirectoryModelError.GENERIC, {
            status: xhr.status,
            statusText: xhr.statusText
          }));
        });

        xhr.open('POST', `${origin}/api/v1/files?path=${encodeURIComponent(resource.resourcePath)}&overwrite=true`);

        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.setRequestHeader('Content-Length', file.size);

        xhr.send(file);
      });

      const res = await req;
    },
    async newFile(resource, newFileName) {
      const file = new Blob();

      const req = new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.withCredentials = true;

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(xhr.response);
          } else if (xhr.status === 409) {
            reject(new DirectoryModelError(DirectoryModelError.CONFLICT))
          } else if (xhr.status === 401) {
            reject(new DirectoryModelError(DirectoryModelError.NO_AUTH));
          } else if (xhr.status === 403) {
            reject(new DirectoryModelError(DirectoryModelError.NOT_ALLOWED));
          } else {
            reject(new DirectoryModelError(DirectoryModelError.GENERIC, {
              status: xhr.status,
              statusText: xhr.statusText
            }));
          }
        });
        xhr.addEventListener('error', () => {
          reject(new DirectoryModelError(DirectoryModelError.GENERIC, {
            status: xhr.status,
            statusText: xhr.statusText
          }));
        });

        xhr.open('POST', `${origin}/api/v1/files?path=${encodeURIComponent(resource.resourcePath + '/' + newFileName)}`);

        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.setRequestHeader('Content-Length', file.size);

        xhr.send(file);
      });

      const res = await req;
    },
    async newFolder(resource, newFolderName) {
      const newFolderPath = pathJoin(resource.resourcePath, newFolderName);
      try {
        await fetcher.post(`${origin}/api/v1/files`, {}, { directory: true, path: newFolderPath });
      } catch (error) {
        if (error.status === 401) throw new DirectoryModelError(DirectoryModelError.NO_AUTH, error);
        if (error.status === 403) throw new DirectoryModelError(DirectoryModelError.NOT_ALLOWED, error);
        if (error.status === 409) throw new DirectoryModelError(DirectoryModelError.CONFLICT, error);
        throw new DirectoryModelError(DirectoryModelError.GENERIC, error);
      }
    },
    async exists(resource, relativeFilePath) {
      try {
        await fetcher.head(`${origin}/api/v1/files`, { path: pathJoin(resource.resourcePath, relativeFilePath)});
      } catch (error) {
        if (error.status === 401) throw new DirectoryModelError(DirectoryModelError.NO_AUTH, error);
        if (error.status === 404) return false;
        else throw new DirectoryModelError(DirectoryModelError.GENERIC, error);
      }

      return true;
    },
    async upload(resource, file, progressHandler) {
      // file may contain a file name or a file path + file name
      const relativefilePath = (file.webkitRelativePath ? file.webkitRelativePath : file.name);

      // does not work with double extensions
      const extension = relativefilePath.slice(relativefilePath.lastIndexOf('.') + 1)

      // find unique path
      let uniqueRelativeFilePath = sanitize(relativefilePath);
      while (true) {
        const exists = await this.exists(resource, uniqueRelativeFilePath);
        if (!exists) break;

        uniqueRelativeFilePath = insertFilenameModifier(uniqueRelativeFilePath, extension, '-new');
      }

      const req = new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.withCredentials = true;

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(xhr.response);
          } else if (xhr.status === 409) {
            reject(new DirectoryModelError(DirectoryModelError.CONFLICT))
          } else if (xhr.status === 401) {
            reject(new DirectoryModelError(DirectoryModelError.NO_AUTH));
          } else if (xhr.status === 403) {
            reject(new DirectoryModelError(DirectoryModelError.NOT_ALLOWED));
          } else {
            reject(new DirectoryModelError(DirectoryModelError.GENERIC, {
              status: xhr.status,
              statusText: xhr.statusText
            }));
          }
        });
        xhr.addEventListener('error', () => {
          reject(new DirectoryModelError(DirectoryModelError.GENERIC, {
            status: xhr.status,
            statusText: xhr.statusText
          }));
        });
        xhr.upload.addEventListener('progress', (event) => {
          if (event.loaded) progressHandler({ direction: 'upload', loaded: event.loaded});
        });

        xhr.open('POST', `${origin}/api/v1/files?path=${encodeURIComponent(resource.resourcePath + '/' + uniqueRelativeFilePath)}`);

        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.setRequestHeader('Content-Length', file.size);

        xhr.send(file);
      });

      const res = await req;
    },
    async download(resource, files) {
      if (files.length === 1 && !files[0].isDirectory) {
        window.location.href = files[0].downloadFileUrl;
      } else {
        const params = new URLSearchParams();

        // be a bit smart about the archive name and folder tree
        const folderPath = files[0].filePath.slice(0, -files[0].fileName.length);
        const name = files.length === 1 ? files[0].fileName : folderPath.slice(folderPath.slice(0, -1).lastIndexOf('/')+1).slice(0, -1);
        params.append('name', name);
        params.append('skipPath', folderPath);

        params.append('entries', JSON.stringify(files.map(function (entry) {
          return {
            resourcePath: entry.resourcePath
          };
        })));

        window.location.href = `${origin}/api/v1/download?${params.toString()}`;
      }
    },
    async rename(fromResource, toResource) {
      try {
        await fetcher.put(`${origin}/api/v1/files`, {}, { action: 'move', path: fromResource.resourcePath, new_path: toResource.resourcePath });
      } catch (error) {
        if (error.status === 401) throw new DirectoryModelError(DirectoryModelError.NO_AUTH, error);
        if (error.status === 409) throw new DirectoryModelError(DirectoryModelError.CONFLICT, error);
        throw new DirectoryModelError(DirectoryModelError.GENERIC, error);
      }
    },
    async remove(resource) {
      try {
        await fetcher.del(`${origin}/api/v1/files`, { path: resource.resourcePath });
      } catch (error) {
        if (error.status === 401) throw new DirectoryModelError(DirectoryModelError.NO_AUTH, error);
        throw new DirectoryModelError(DirectoryModelError.GENERIC, error);
      }
    },
    async copy(fromResource, toResource) {
      try {
        await fetcher.put(`${origin}/api/v1/files`, {}, { action: 'copy', path: fromResource.resourcePath, new_path: toResource.resourcePath });
      } catch (error) {
        if (error.status === 401) throw new DirectoryModelError(DirectoryModelError.NO_AUTH, error);
        if (error.status === 409) throw new DirectoryModelError(DirectoryModelError.CONFLICT, error);
        throw new DirectoryModelError(DirectoryModelError.GENERIC, error);
      }
    },
    async paste(resource, action, files) {
      // this will not overwrite but tries to find a new unique name to past to
      for (let f in files) {
        let done = false;
        let targetPath = pathJoin(resource.resourcePath, files[f].name);
        const extension = files[f].extension;
        while (!done) {
          const targetResource = parseResourcePath(targetPath);
          try {
            if (action === 'cut') await this.rename(files[f].resource, targetResource);
            if (action === 'copy') await this.copy(files[f].resource, targetResource);
            done = true;
          } catch (error) {
            if (error.reason === DirectoryModelError.CONFLICT) {
              targetPath = insertFilenameModifier(targetPath, extension, '-copy');
            } else {
              throw error;
            }
          }
        }
      }
    }
  };
}

export default {
  DirectoryModelError,
  createDirectoryModel
};
