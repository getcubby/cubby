<script setup>

import { ref, onMounted, useTemplateRef, computed, provide } from 'vue';
import { API_ORIGIN, BASE_URL, parseResourcePath, getExtension, copyToClipboard, sanitize } from './utils.js';
import { prettyDate } from 'pankow/utils';
import {
  Breadcrumb,
  Button,
  Checkbox,
  Dialog,
  DirectoryView,
  SingleSelect,
  FileUploader,
  InputDialog,
  Menu,
  Notification,
  PasswordInput,
  SideBar,
  TabView,
  InputGroup,
  TopBar
} from 'pankow';
import { GenericViewer, ImageViewer, PdfViewer, TextViewer } from 'pankow/viewers';
import DirectoryModel from './models/DirectoryModel.js';
import MainModel from './models/MainModel.js';
import ShareModel from './models/ShareModel.js';
import FavoriteModel from './models/FavoriteModel.js';
import LoginView from './components/LoginView.vue';
import UsersView from './components/UsersView.vue';
import SharesView from './components/SharesView.vue';
import SettingsView from './components/SettingsView.vue';
import PreviewPanel from './components/PreviewPanel.vue';
import MarkdownViewer from './components/MarkdownViewer.vue';
import RecentView from './components/RecentView.vue';
import FavoriteView from './components/FavoriteView.vue';
import SearchBar from './components/SearchBar.vue';

const DirectoryModelError = DirectoryModel.DirectoryModelError;

const VIEWS = {
  LOGIN: 'login',
  MAIN: 'main',
  FAVORITES: 'favorites',
  USERS: 'users',
  RECENT: 'recent',
  SETTINGS: 'settings',
  SHARES: 'shares'
};

const beforeUnloadListener = (event) => {
  event.preventDefault();
  return window.confirm('File operation still in progress. Really close?');
};

const aboutDialog = useTemplateRef('aboutDialog');

const ready = ref(false);
const view = ref('');
const viewer = ref('');
const showSize = ref(true);
const activeResourceType = ref('');
const profile = ref({});
const config = ref({});
const currentHash = ref('');
const uiError = ref('');
const entry = ref({});
const entries = ref([]);
const selectedEntries = ref([]);
const currentPath = ref('/');
const currentResourcePath = ref('');
const currentShare = ref(null);
const breadCrumbs = ref([]);
const breadCrumbHome = ref({
  icon: 'fa-solid fa-house',
  route: '#files'
});
const webDavPasswordDialog = ref({
  error: '',
  password: ''
});
const shareDialog = ref({
  visible: false,
  error: '',
  receiverUsername: '',
  readonly: false,
  users: [],
  sharedWith: [],
  sharedLinks: [],
  entry: {},
  shareLink: {
    expires: false,
    expiresAt: 0
  },
});

const mainMenu = [{
  label: 'Users',
  icon: 'fa-solid fa-users',
  visible: () => profile.value.admin,
  action: () => window.location.href = '#users'
}, {
  label: 'Settings',
  icon: 'fa-solid fa-cog',
  visible: () => profile.value.admin,
  action: () => window.location.href = '#settings'
}, {
  label: 'Shared by You',
  icon: 'fa-solid fa-share-from-square',
  action: () => window.location.href = '#shares'
}, {
  label: 'WebDAV',
  icon: 'fa-solid fa-globe',
  action: onWebDavSettings
}, {
  label: 'About',
  icon: 'fa-solid fa-circle-info',
  action: () => aboutDialog.value.open()
}, {
  separator:true
}, {
  label: 'Logout',
  icon: 'fa-solid fa-right-from-bracket',
  action: onLogout
}];

const newMenu = [{
  label: 'New File',
  icon: 'fa-solid fa-file-circle-plus',
  action: onNewFile
}, {
  label: 'New Folder',
  icon: 'fa-solid fa-folder-plus',
  action: onNewFolder
}];

const uploadMenu = [{
  label: 'Upload File',
  icon: 'fa-solid fa-file-arrow-up',
  action: onUploadFile
}, {
  label: 'Upload Folder',
  icon: 'fa-regular fa-folder-open',
  action: onUploadFolder
}];

const newAndUploadMenu = [{
  label: 'Upload File',
  icon: 'fa-solid fa-file-arrow-up',
  action: onUploadFile
}, {
  label: 'Upload Folder',
  icon: 'fa-regular fa-folder-open',
  action: onUploadFolder
}, {
  separator:true
}, {
  label: 'New File',
  icon: 'fa-solid fa-file-circle-plus',
  action: onNewFile
}, {
  label: 'New Folder',
  icon: 'fa-solid fa-folder-plus',
  action: onNewFolder
}];

const isReadonly = computed(() => {
  if (currentResourcePath.value === '/shares/') return true;
  if (currentResourcePath.value === '/groupfolders/') return true;
  if (!currentShare.value) return false;
  return currentShare.value.readonly;
});

async function onToggleFavorite(entry) {
  if (entry.favorite) {
    await FavoriteModel.remove(entry.favorite.id);
    entry.favorite = null;
    entry.star = false;
  } else {
    const id = await FavoriteModel.create({ owner: entry.owner, path: entry.filePath })
    entry.favorite = { id, owner: entry.owner, path: entry.filePath };
    entry.star = true;
  }
}

const mainMenuElement = useTemplateRef('mainMenuElement');
function onMainMenu(event) {
  mainMenuElement.value.open(event, event.target);
}

async function uploadJobPreFlightCheckHandler(job) {
  // abort if target folder already exists
  if (job.folder && await DirectoryModel.exists(parseResourcePath(job.targetFolder), job.folder)) {
    window.pankow.notify({ text: `Cannot upload. Folder ${job.folder} already exists.`, type: 'danger', timeout: 5000 });
    return false;
  }

  return true;
}

async function uploadHandler(targetDir, file, progressHandler) {
  const resource = parseResourcePath(targetDir);

  await DirectoryModel.upload(resource, file, progressHandler);

  refresh();
}

const sideBar = useTemplateRef('sideBar');
function onCloseSidebar() {
  sideBar.value.close();
}

async function onLogin() {
  view.value = VIEWS.LOGIN;
}

async function onLogout() {
  await MainModel.logout();
  window.location.href = '/';
}

function onInvalidSession() {
  // stash for use later after re-login
  localStorage.returnTo = window.location.hash.slice(1);

  profile.value.username = '';
  profile.value.email = '';
  profile.value.displayName = '';

  onLogin();
}

function onViewerEntryChanged(entry) {
  // prevent to reload image
  currentHash.value = `#files${entry.resourcePath}`
  window.location.hash = `files${entry.resourcePath}`;
}

function onUploadFinished() {
  refresh();
}

const fileUploader = useTemplateRef('fileUploader');
function onUploadFile() {
  const resource = parseResourcePath(currentResourcePath.value || 'files/');
  fileUploader.value.onUploadFile(resource.resourcePath);
}

function onUploadFolder() {
  const resource = parseResourcePath(currentResourcePath.value || 'files/');
  fileUploader.value.onUploadFolder(resource.resourcePath);
}

const inputDialog = useTemplateRef('inputDialog');
const directoryView = useTemplateRef('directoryView');
async function onNewFile() {
  const newFileName = await inputDialog.value.prompt({
    message: 'New Filename',
    value: '',
    confirmStyle: 'success',
    confirmLabel: 'Save',
    rejectLabel: 'Close'
  });

  if (!newFileName) return;

  const resource = parseResourcePath(currentResourcePath.value || 'files/');

  try {
    await DirectoryModel.newFile(resource, newFileName);
  } catch (error) {
    if (error.reason === DirectoryModelError.NO_AUTH) onInvalidSession();
    else if (error.reason === DirectoryModelError.NOT_ALLOWED) console.error('File name not allowed');
    else if (error.reason === DirectoryModelError.CONFLICT) console.error('File already exists');
    else console.error('Failed to add file, unknown error:', error)
    return;
  }

  await refresh();

  directoryView.value.highlightByName(newFileName);
}

async function onNewFolder() {
  const newFolderName = await inputDialog.value.prompt({
    message: 'New Foldername',
    value: '',
    confirmStyle: 'success',
    confirmLabel: 'Save',
    rejectLabel: 'Close'
  });

  if (!newFolderName) return;

  const resource = parseResourcePath(currentResourcePath.value || 'files/');

  try {
    await DirectoryModel.newFolder(resource, newFolderName);
  } catch (error) {
    if (error.reason === DirectoryModelError.NO_AUTH) onInvalidSession();
    else if (error.reason === DirectoryModelError.NOT_ALLOWED) console.error('Folder name not allowed');
    else if (error.reason === DirectoryModelError.CONFLICT) console.error('Folder already exists');
    else console.error('Failed to add folder, unknown error:', error)
    return;
  }

  await refresh();

  directoryView.value.highlightByName(newFolderName);
}

async function pasteHandler(action, files, target) {
  if (!files || !files.length) return;

  window.addEventListener('beforeunload', beforeUnloadListener, { capture: true });
  pasteInProgress.value = true;

  const resource = parseResourcePath((target && target.isDirectory) ? sanitize(currentResourcePath.value + '/' + target.fileName) : currentResourcePath.value);
  await DirectoryModel.paste(resource, action, files);
  await refresh();

  window.removeEventListener('beforeunload', beforeUnloadListener, { capture: true });
  pasteInProgress.value = false;
}

const webDavPasswordDialogElement = useTemplateRef('webDavPasswordDialog');
async function onWebDavSettings() {
  webDavPasswordDialog.value.error = '';
  webDavPasswordDialog.value.password = '';
  webDavPasswordDialogElement.value.open();
}

async function onWebDavSettingsSubmit() {
  try {
    await MainModel.setWebDavPassword(webDavPasswordDialog.value.password);
  } catch (error) {
    if (error.reason === DirectoryModelError.NO_AUTH) onInvalidSession();
    else {
      webDavPasswordDialog.value.error = 'Unkown error, check logs';
      console.error('Failed to set webdav password:', error)
    }

    return;
  }

  webDavPasswordDialogElement.value.close();
}

async function refreshConfig() {
  try {
    config.value = await MainModel.getConfig();
  } catch (e) {
    if (e.cause && e.cause.status !== 401) return console.error('Failed to get config.', e);
  }
}

provide('refreshConfig', refreshConfig);

function clearSelection() {
  selectedEntries.value = [];
}

function onSelectionChanged(selectedEntries) {
  selectedEntries.value = selectedEntries;
}

async function onFileSaved(entry, content, done) {
  try {
    await DirectoryModel.saveFile(entry.resource, content);
  } catch (error) {
    console.error(`Failed to save file ${entry.resourcePath}`, error);
  }

  if (typeof done === 'function') done();
}

// if entries is provided download those, otherwise selected entries, otherwise all entries
async function downloadHandler(entries) {
  // in case we got a single entry
  if (entries && !Array.isArray(entries)) entries = [ entries ];
  if (!entries) entries = selectedEntries.value;
  if (entries.length === 0) entries = entries.value;

  const resource = parseResourcePath(currentResourcePath.value);
  await DirectoryModel.download(resource, entries);
}

// either dataTransfer (external drop) or files (internal drag)
async function onDrop(targetFolder, dataTransfer, files) {
  const fullTargetFolder = sanitize(`${currentResourcePath.value}/${targetFolder}`);

  if (dataTransfer) {
    async function getFile(entry) {
      return new Promise((resolve, reject) => {
        entry.file(resolve, reject);
      });
    }

    const fileList = [];
    async function traverseFileTree(item, path) {
      return new Promise(async (resolve, reject) => {
        if (item.isFile) {
          fileList.push(await getFile(item));
          resolve();
        } else if (item.isDirectory) {
          // Get folder contents
          const dirReader = item.createReader();
          const entries = await new Promise((resolve, reject) => { dirReader.readEntries(resolve, reject); });

          for (let i in entries) {
            await traverseFileTree(entries[i], item.name);
          }

          resolve();
        } else {
          console.log('Skipping uknown file type', item);
          resolve();
        }
      });
    }

    for (const item of dataTransfer.items) {
      const entry = item.webkitGetAsEntry();
      if (!entry) {
        console.warn('Dropped item not supported.', item, item.getAsString((s) => console.log(s)));
        continue;
      }

      if (entry.isFile) {
        fileList.push(await getFile(entry));
      } else if (entry.isDirectory) {
        await traverseFileTree(entry, sanitize(`${currentResourcePath.value}/${targetFolder}`));
      }
    }
    fileUploader.value.addFiles(fileList, sanitize(`${currentResourcePath.value}/${targetFolder}`));
  } else {
    if (!files.length) return;

    window.addEventListener('beforeunload', beforeUnloadListener, { capture: true });

    // check ctrl for cut/copy
    await DirectoryModel.paste(parseResourcePath(fullTargetFolder), 'cut', files);
    await refresh();

    window.removeEventListener('beforeunload', beforeUnloadListener, { capture: true });
  }
}

async function deleteHandler(entries) {
  if (!entries) return;

  const confirmed = await inputDialog.value.confirm({
    message: `Really delete ${entries.length} item${ entries.length === 1 ? '' : 's' }?`,
    confirmStyle: 'danger',
    confirmLabel: 'Yes',
    rejectLabel: 'Cancel'
  });

  if (!confirmed) return;

  window.addEventListener('beforeunload', beforeUnloadListener, { capture: true });

  for (let i in entries) {
    try {
      const resource = parseResourcePath(sanitize(currentResourcePath.value + '/' + entries[i].fileName));
      await DirectoryModel.remove(resource);
    } catch (e) {
      console.error(`Failed to remove file ${entries[i].name}:`, e);
    }
  }

  await refresh();

  window.removeEventListener('beforeunload', beforeUnloadListener, { capture: true });
}

async function renameHandler(file, newName) {
  // this will make the change immediate for the UI even if not yet committed
  file.name = newName;

  const fromResource = file.resource;
  const toResource = parseResourcePath(sanitize(currentResourcePath.value + '/' + newName));

  if (fromResource.resourcePath === toResource.resourcePath) return;

  await DirectoryModel.rename(fromResource, toResource);
  await refresh();

  directoryView.value.highlightByName(file.name);
}

async function refreshShareDialogEntry(entry = null) {
  shareDialog.value.entry = await DirectoryModel.get(entry || shareDialog.value.entry);

  shareDialog.value.sharedWith = shareDialog.value.entry.sharedWith.filter((s) => s.receiverUsername);
  shareDialog.value.sharedLinks = shareDialog.value.entry.sharedWith.filter((s) => !s.receiverUsername);

  shareDialog.value.users.forEach((user) => {
    user.alreadyUsed = shareDialog.value.entry.sharedWith.find((share) => { return share.receiverUsername === user.username; });
  });

  await refresh(shareDialog.value.entry);
}

const shareDialogElement = useTemplateRef('shareDialogElement');
async function shareHandler(entry) {
  shareDialog.value.error = '';
  shareDialog.value.receiverUsername = '';
  shareDialog.value.readonly = false;
  shareDialog.value.shareLink.expires = false;
  shareDialog.value.shareLink.expiresAt = new Date()

  // start with tomorrow
  shareDialog.value.shareLink.expiresAt.setDate(shareDialog.value.shareLink.expiresAt.getDate() + 1);

  // prepare available users for sharing
  const users = await MainModel.getUsers();
  shareDialog.value.users = users.filter((u) => { return u.username !== profile.value.username; });
  shareDialog.value.users.forEach((u) => { u.userAndDisplayName = u.displayName + ' ( ' + u.username + ' )'; });

  await refreshShareDialogEntry(entry);

  shareDialogElement.value.open();
}

function copyShareIdLinkToClipboard(shareId) {
  copyToClipboard(ShareModel.getLink(shareId));
  window.pankow.notify('Share link copied to clipboard');
}

async function onCreateShareLink() {
  const path = shareDialog.value.entry.filePath;
  const readonly = true; // always readonly for now
  const expiresAt = shareDialog.value.shareLink.expires ? shareDialog.value.shareLink.expiresAt : 0;
  const ownerUsername = shareDialog.value.entry.group ? null : shareDialog.value.entry.owner;
  const ownerGroupfolder = shareDialog.value.entry.group ? shareDialog.value.entry.group.id : null;

  const shareId = await ShareModel.create({ ownerUsername, ownerGroupfolder, path, readonly, expiresAt });

  copyShareIdLinkToClipboard(shareId);

  await refreshShareDialogEntry();
}

async function onCreateShare() {
  const path = shareDialog.value.entry.filePath;
  const readonly = shareDialog.value.readonly;
  const receiverUsername = shareDialog.value.receiverUsername;
  const ownerUsername = shareDialog.value.entry.group ? null : shareDialog.value.entry.owner;
  const ownerGroupfolder = shareDialog.value.entry.group ? shareDialog.value.entry.group.id : null;

  await ShareModel.create({ ownerUsername, ownerGroupfolder, path, readonly, receiverUsername });

  // reset the form
  shareDialog.value.error = '';
  shareDialog.value.receiverUsername = '';
  shareDialog.value.readonly = false;

  // refresh the entry
  shareDialog.value.entry = await DirectoryModel.get(shareDialog.value.entry);
  await refreshShareDialogEntry();
}

async function onDeleteShare(share) {
  await ShareModel.remove(share.id);
  refreshShareDialogEntry();
}

async function refresh(entry = null) {
  if (entry) {
    try {
      entry = await DirectoryModel.get(entry.resource, entry.resource.path);
    } catch (error) {
      if (error.status === 401) return onInvalidSession();
      else if (error.status === 404) uiError.value = 'Does not exist';
      else console.error(error);
      return;
    }

    // this will replace the entry to keep bindings alive
    const idx = entries.value.findIndex((e) => e.id === entry.id );
    if (idx !== -1) entries.value.splice(idx, 1, entry);
  } else {
    const resource = parseResourcePath(currentResourcePath.value);

    try {
      entry = await DirectoryModel.get(resource, resource.path);
    } catch (error) {
      if (error.status === 401) return onInvalidSession();
      else if (error.status === 404) uiError.value = 'Does not exist';
      else console.error(error);
      return;
    }

    entry.files.forEach(function (e) {
      e.extension = getExtension(e);
      e.filePathNew = e.fileName;
    });

    entry.value = entry;
    entries.value = entry.files;
  }
}

async function loadMainDirectory(path, entry, forceLoad = false) {
  // path is files/filepath or shares/shareid/filepath
  const resource = parseResourcePath(path);

  // nothing new
  if (!forceLoad && currentResourcePath.value === resource.resourcePath) return;

  if (!entry) {
    try {
      entry = await DirectoryModel.get(resource, resource.path);
    } catch (error) {
      entries.value = [];
      entry = {};

      if (error.status === 401) return onInvalidSession();
      else if (error.status === 404) uiError.value = 'Does not exist';
      else console.error(error);
    }
  }

  activeResourceType.value = resource.type;
  currentPath.value = resource.path;
  currentResourcePath.value = resource.resourcePath;
  currentShare.value = entry.share || null;

  if (resource.type === 'home') {
    breadCrumbs.value = sanitize(resource.path).split('/').filter(function (i) { return !!i; }).map(function (e, i, a) {
      return {
        label: decodeURIComponent(e),
        route: '#files/home' + sanitize('/' + a.slice(0, i).join('/') + '/' + e)
      };
    });
    breadCrumbHome.value = {
      icon: 'fa-solid fa-house',
      route: '#files/home/'
    };
  } else if (resource.type === 'shares') {
    breadCrumbs.value = sanitize(resource.path).split('/').filter(function (i) { return !!i; }).map(function (e, i, a) {
      return {
        label: decodeURIComponent(e),
        route: '#files/shares/' + resource.shareId  + sanitize('/' + a.slice(0, i).join('/') + '/' + e)
      };
    });
    breadCrumbHome.value = {
      icon: 'fa-solid fa-share-nodes',
      route: '#files/shares/'
    };

    // if we are not toplevel, add the share information
    if (entry.share) {
      breadCrumbs.value.unshift({
        label: entry.share.filePath.slice(1), // remove slash at the beginning
        route: '#files/shares/' + resource.shareId + '/'
      });
    }
  } else if (resource.type === 'groupfolders') {
    breadCrumbs.value = sanitize(resource.path).split('/').filter(function (i) { return !!i; }).map(function (e, i, a) {
      return {
        label: decodeURIComponent(e),
        route: '#files/groupfolders/' + resource.groupId  + sanitize('/' + a.slice(0, i).join('/') + '/' + e)
      };
    });
    breadCrumbHome.value = {
      icon: 'fa-solid fa-user-group',
      route: '#files/groupfolders/'
    };

    // if we are not toplevel, add the groupfolder information
    if (entry.group) {
      breadCrumbs.value.unshift({
        label: entry.group.name,
        route: '#files/groupfolders/' + entry.group.id + '/'
      });
    }
  } else {
    console.error('FIXME breadcrumbs for resource type', resource.type);
  }

  entry.files.forEach(function (e) {
    e.extension = getExtension(e);
    e.filePathNew = e.fileName;
  });

  entry.value = entry;
  entries.value = entry.files;
  viewer.value = '';
}

const imageViewer = useTemplateRef('imageViewer');
const pdfViewer = useTemplateRef('pdfViewer');
const markdownViewer = useTemplateRef('markdownViewer');
const textViewer = useTemplateRef('textViewer');
const genericViewer = useTemplateRef('genericViewer');

async function onGroupFoldersChanged() {
  await loadMainDirectory(currentResourcePath.value, null, true);
}

// return false/true on fail/success
async function loadPath(path, forceLoad = false) {
  const resource = parseResourcePath(path || currentResourcePath.value);

  // clear potential viewer first
  if (viewer.value) viewer.value = '';

  if (!forceLoad && currentResourcePath.value === resource.resourcePath) return true;

  let entry;
  try {
    entry = await DirectoryModel.get(resource);
  } catch (error) {
    entries.value = [];
    entry = {};

    if (error.status === 401 || error.status === 403) {
      onInvalidSession();
      return false;
    } else if (error.status === 404) {
      console.error('Failed to load entry', resource, error);
      window.pankow.notify({ text: `File or folder ${resource.path} does not exist`, type: 'danger', persistent: true });
      return false;
    } else {
      console.error(error);
      return false;
    }
  }

  window.location.hash = `files${resource.resourcePath}`;

  if (entry.isDirectory) await loadMainDirectory(resource.resourcePath, entry, forceLoad);
  else await loadMainDirectory(resource.parentResourcePath, null, forceLoad);

  // if we don't have a folder load the viewer
  if (!entry.isDirectory) {
    if (imageViewer.value.canHandle(entry)) {
      const otherSupportedEntries = entries.value.filter((e) => imageViewer.value.canHandle(e));

      imageViewer.value.open(entry, otherSupportedEntries);
      viewer.value = 'image';
    } else if (pdfViewer.value.canHandle(entry)) {
      pdfViewer.value.open(entry);
      viewer.value = 'pdf';
    } else if (MainModel.canHandleWithOffice(entry)) {
      window.open('/office.html#' + entry.resourcePath, '_blank');

      // need to reset the hash as the original location should be the folder containing the file
      window.location.hash = `files${resource.resourcePath}`.slice(0, -entry.name.length);
    } else if (markdownViewer.value.canHandle(entry)) {
      markdownViewer.value.open(entry, await DirectoryModel.getRawContent(resource));
      viewer.value = 'markdown';
    } else if (textViewer.value.canHandle(entry)) {
      textViewer.value.open(entry, await DirectoryModel.getRawContent(resource));
      viewer.value = 'text';
    } else {
      viewer.value = 'generic';
      genericViewer.value.open(entry);
    }
  } else {
    clearSelection();
  }

  return true;
}

function onOpen(entry) {
  if (entry.share && entry.share.id) window.location.hash = `files/shares/${entry.share.id}${entry.filePath}`;
  else if (entry.group && entry.group.id) window.location.hash = `files/groupfolders/${entry.group.id}${entry.filePath}`;
  else window.location.hash = `files/home${entry.filePath}`;
}

function onViewerClose() {
  viewer.value = '';

  // update the browser hash
  const resource = parseResourcePath(currentResourcePath.value || '/home/');
  window.location.hash = `files${resource.resourcePath}`;
}

function onUp() {
  if (window.location.hash.indexOf('#shares/') === 0) {
    const hash = window.location.hash.slice('#shares/'.length);

    // if we are first level of that share, go back to all shares
    if (!hash.split('/')[1]) window.location.hash = 'shares/';
    else window.location.hash = hash.split('/')[0] + sanitize(hash.split('/').filter(function (p) { return !!p; }).slice(1, -1).join('/'));
  } else {
    const hash = window.location.hash.slice(1);
    window.location.hash = hash.split('/')[0] + sanitize(hash.split('/').filter(function (p) { return !!p; }).slice(1, -1).join('/'));
  }
}

onMounted(async () => {
  async function handleHash(hash) {
    // we handle decoded paths internally
    hash = decodeURIComponent(hash);

    activeResourceType.value = '';

    if (hash.indexOf('files/home/') === 0) {
      if (await loadPath(hash.slice('files'.length))) view.value = VIEWS.MAIN;
      else window.location.hash = 'files/home/';
    } else if (hash.indexOf('files/shares/') === 0) {
      loadPath(hash.slice('files'.length));
      view.value = VIEWS.MAIN;
    } else if (hash.indexOf('files/groupfolders/') === 0) {
      loadPath(hash.slice('files'.length));
      view.value = VIEWS.MAIN;
    } else if (hash === 'recent') {
      view.value = VIEWS.RECENT;
    } else if (hash === 'favorites') {
      view.value = VIEWS.FAVORITES;
    } else if (hash.indexOf('users') === 0 && profile.value.admin) {
      view.value = VIEWS.USERS;
      onCloseSidebar();
    } else if (hash.indexOf('shares') === 0) {
      view.value = VIEWS.SHARES;
      onCloseSidebar();
    } else if (hash.indexOf('settings') === 0 && profile.value.admin) {
      view.value = VIEWS.SETTINGS;
      onCloseSidebar();
    } else {
      window.location.hash = 'files/home/';
    }
  }

  try {
    profile.value = await MainModel.getProfile();
  } catch (e) {
    return console.error('mounted: getProfile() error', e);
  }

  if (profile.value) await refreshConfig();
  else profile.value = {};

  // initial load with hash if any
  const hash = localStorage.returnTo || window.location.hash.slice(1);
  localStorage.returnTo = '';

  await handleHash(hash);

  window.addEventListener('hashchange', () => {
    // allows us to not reload but only change the hash
    if (currentHash.value === decodeURIComponent(window.location.hash)) return;
    currentHash.value = window.location.hash;

    handleHash(window.location.hash.slice(1));
  }, false);

  // TODO make this dynamic
  showSize.value = window.innerWidth >= 576;

  ready.value = true;
});

</script>

<template>
  <!-- This is re-used and thus global -->
  <InputDialog ref="inputDialog" />
  <Notification/>

  <div v-show="ready" style="height: 100%;">
    <LoginView v-show="view === VIEWS.LOGIN"/>

    <div class="container" v-show="view === VIEWS.USERS || view === VIEWS.SHARES || view === VIEWS.SETTINGS || view === VIEWS.FAVORITES || view === VIEWS.RECENT || view === VIEWS.MAIN">
      <SideBar class="side-bar" ref="sideBar">
        <h1 style="margin-bottom: 50px; text-align: center;"><img src="/logo-transparent.svg" height="60" width="60"/><br/>Cubby</h1>

        <a class="side-bar-entry" v-show="profile.username" :class="{'active': activeResourceType === 'home'}" href="#files/home/" @click="onCloseSidebar"><i class="fa-solid fa-house"></i> My Files</a>
        <a class="side-bar-entry" v-show="profile.username" :class="{'active': view === VIEWS.FAVORITES }" href="#favorites" @click="onCloseSidebar"><i class="fa-solid fa-star"></i> Favorites</a>
        <a class="side-bar-entry" v-show="profile.username" :class="{'active': view === VIEWS.RECENT }" href="#recent" @click="onCloseSidebar"><i class="fa-regular fa-clock"></i> Recent Files</a>
        <a class="side-bar-entry" v-show="profile.username" :class="{'active': activeResourceType === 'shares'}" href="#files/shares/" @click="onCloseSidebar"><i class="fa-solid fa-share-nodes"></i> Shared With You</a>
        <a class="side-bar-entry" v-show="profile.username" :class="{'active': activeResourceType === 'groupfolders'}" href="#files/groupfolders/" @click="onCloseSidebar"><i class="fa-solid fa-user-group"></i> Group Folders</a>

        <div style="flex-grow: 1">&nbsp;</div>

        <Menu ref="mainMenuElement" :model="mainMenu"></Menu>
        <div class="side-bar-entry side-bar-entry-button" id="profileMenuDropdown" v-show="profile.username" @click="onMainMenu($event)" style="text-align: center; padding-left: 10px;">{{ profile.displayName }}</div>
      </SideBar>
      <div class="content">
        <SharesView v-if="view === VIEWS.SHARES" />
        <UsersView v-if="view === VIEWS.USERS" :profile="profile" />
        <SettingsView v-if="view === VIEWS.SETTINGS" :profile="profile" @groupfolders-changed="onGroupFoldersChanged()"/>
        <RecentView v-if="view === VIEWS.RECENT" @item-activated="onOpen" />
        <FavoriteView v-if="view === VIEWS.FAVORITES" @item-activated="onOpen" />

        <div class="container" style="flex-direction: column; overflow: hidden;" v-show="view === VIEWS.MAIN">
          <TopBar :gap="false" :left-grow="true">
            <template #left>
              <SearchBar @item-activated="onOpen"/>
            </template>

            <template #right>
              <div class="topbar-actions">
                <div class="file-actions">
                  <Button v-show="!isReadonly && selectedEntries.length" icon="fa-regular fa-trash-can" outline danger tool @click="deleteHandler(selectedEntries)"/>
                  <Button icon="fa-solid fa-download" outline tool @click="downloadHandler(selectedEntries || null)"/>
                </div>

                <Button icon="fa-solid fa-arrow-up-from-bracket" :menu="uploadMenu" :disabled="isReadonly" tool><span class="pankow-no-mobile">Upload</span></Button>
                <Button icon="fa-solid fa-plus" label="New" :menu="newMenu" :disabled="isReadonly" tool><span class="pankow-no-mobile">New</span></Button>

                <Button v-show="!profile.username" class="profile-dropdown" icon="fa-solid fa-arrow-right-to-bracket" secondary @click="onLogin">Login</Button>
              </div>
            </template>
          </TopBar>
          <div class="container" style="overflow: hidden;">
            <div class="main-container-content">
              <div class="breadcrumb-bar">
                <Button icon="fa-solid fa-chevron-left" :disabled="breadCrumbs.length === 0" @click="onUp" plain tool></Button>
                <Breadcrumb :home="breadCrumbHome" :items="breadCrumbs" />
                <Button plain tool secondary icon="fa-solid fa-plus" :menu="newAndUploadMenu" v-show="!isReadonly" />
              </div>
              <div style="overflow: hidden; height: calc(100% - 46px);">
                <DirectoryView
                  ref="directoryView"
                  :show-star="true"
                  :show-owner="false"
                  :show-extract="false"
                  :show-size="showSize"
                  :show-modified="true"
                  :show-share="'isSharedWith'"
                  :editable="!isReadonly"
                  :multi-download="true"
                  @selection-changed="onSelectionChanged"
                  @item-activated="onOpen"
                  :delete-handler="deleteHandler"
                  :share-handler="shareHandler"
                  :star-handler="onToggleFavorite"
                  :rename-handler="renameHandler"
                  :paste-handler="pasteHandler"
                  :download-handler="downloadHandler"
                  :new-file-handler="onNewFile"
                  :new-folder-handler="onNewFolder"
                  :upload-file-handler="onUploadFile"
                  :upload-folder-handler="onUploadFolder"
                  :drop-handler="onDrop"
                  :items="entries"
                  :fallback-icon="`${BASE_URL}mime-types/none.svg`"
                >
                  <template #empty>
                    <div v-show="!entries.length" class="no-entries-placeholder">
                      <div v-show="activeResourceType === 'home' || (activeResourceType === 'shares' && breadCrumbs.length) || (activeResourceType === 'groupfolders' && breadCrumbs.length)">Folder is empty</div>
                      <div v-show="activeResourceType === 'groupfolders' && !breadCrumbs.length">
                        <span v-if="profile.admin"><Button href="#settings" icon="fa-solid fa-plus">Add Group Folder</Button></span>
                        <span v-else>Not part of any group folder yet</span>
                      </div>
                      <div v-show="activeResourceType === 'shares' && !breadCrumbs.length">Nothing shared with you yet</div>
                    </div>
                  </template>
                </DirectoryView>
              </div>
            </div>
            <PreviewPanel :parent-entry="entry" :selected-entries="selectedEntries"/>
          </div>
        </div>

        <FileUploader
          ref="fileUploader"
          :upload-handler="uploadHandler"
          :job-pre-flight-check-handler="uploadJobPreFlightCheckHandler"
          @finished="onUploadFinished"
        />
      </div>
    </div>
  </div>

  <!-- About Dialog -->
  <Dialog title="About Cubby" ref="aboutDialog" reject-label="Close">
    <div>
      Cubby the painless file sharing solution!
      <br/>
      <br/>
      Developed by <a href="https://cloudron.io" target="_blank">Cloudron</a>
      <br/>
    </div>
  </Dialog>

  <!-- WebDAV Password Dialog -->
  <Dialog title="WebDAV Password" ref="webDavPasswordDialog" reject-label="Cancel" confirm-label="Save" confirm-style="success" @confirm="onWebDavSettingsSubmit">
    <p>Files can be used over WebDAV at <i>{{ API_ORIGIN }}/webdav/{{ profile.username }}/</i></p>
    <p>Set a WebDAV password (will overwrite old one):</p>
    <form @submit="onWebDavSettingsSubmit" @submit.prevent>
      <PasswordInput v-model="webDavPasswordDialog.password" autofocus required :class="{ 'has-error': webDavPasswordDialog.error }" style="width: 100%"/>
      <small class="has-error" v-show="webDavPasswordDialog.error">{{ webDavPasswordDialog.error }}</small>
    </form>
  </Dialog>

  <!-- Share Dialog -->
  <Dialog :title="'Sharing ' + shareDialog.entry.fileName" ref="shareDialogElement" :show-x="true">
    <div>
      <TabView :tabs="{ user: 'with a User', link: 'via Link' }" default-active="user">
        <template #user>
          <div style="margin-bottom: 10px;">
            <div v-for="link in shareDialog.sharedWith" class="shared-link" :key="link.id">
              <div><b>{{ link.receiverUsername || link.receiverEmail }}</b></div>
              <Button small danger outline tool icon="fa-solid fa-trash" title="Delete" @click="onDeleteShare(link)"/>
            </div>
            <div v-show="shareDialog.sharedWith.length === 0" class="shared-link-empty">
              Not shared with anyone yet
            </div>
          </div>

          <form @submit="onCreateShare" @submit.prevent>
            <!-- TODO optionDisabled="alreadyUsed"  -->
            <small v-show="shareDialog.error">{{ shareDialog.error }}</small>
            <InputGroup>
              <SingleSelect v-model="shareDialog.receiverUsername" :options="shareDialog.users" option-key="username" option-label="userAndDisplayName" placeholder="Select a user"/>
              <Button icon="fa-solid fa-check" success @click="onCreateShare" :disabled="!shareDialog.receiverUsername">Create share</Button>
            </InputGroup>
          </form>
        </template>
        <template #link>
          <div style="margin-bottom: 10px;">
            <div v-for="link in shareDialog.sharedLinks" class="shared-link" :key="link.id">
              <div>Created {{ prettyDate(link.createdAt) }}</div>
              <Button small outline tool @click="copyShareIdLinkToClipboard(link.id)">Copy Link to Clipboard</Button>
              <Button small danger outline tool icon="fa-solid fa-trash" title="Delete" @click="onDeleteShare(link)"/>
            </div>
            <div v-show="shareDialog.sharedLinks.length === 0" class="shared-link-empty">
              No shared links yet
            </div>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <Checkbox id="expireShareLinkAt" label="Expire At" v-model="shareDialog.shareLink.expire" />
            <input type="date" v-model="shareDialog.shareLink.expiresAt" :min="new Date().toISOString().split('T')[0]" :disabled="!shareDialog.shareLink.expire"/>
            <Button icon="fa-solid fa-link" success @click="onCreateShareLink">Create and Copy Link</Button>
          </div>
        </template>
      </TabView>
    </div>
  </Dialog>

  <Transition name="pankow-fade">
    <div class="viewer-container" v-show="viewer === 'image'">
      <ImageViewer ref="imageViewer" @close="onViewerClose" :navigation-handler="onViewerEntryChanged" :download-handler="downloadHandler" />
    </div>
  </Transition>
  <Transition name="pankow-fade">
    <div class="viewer-container" v-show="viewer === 'text'">
      <TextViewer ref="textViewer" @close="onViewerClose" :save-handler="onFileSaved" />
    </div>
  </Transition>
  <Transition name="pankow-fade">
    <div class="viewer-container" v-show="viewer === 'pdf'">
      <PdfViewer ref="pdfViewer" @close="onViewerClose" />
    </div>
  </Transition>
  <Transition name="pankow-fade">
    <div class="viewer-container" v-show="viewer === 'markdown'">
      <MarkdownViewer ref="markdownViewer" @close="onViewerClose" :profile="profile" :save-handler="onFileSaved" />
    </div>
  </Transition>
  <Transition name="pankow-fade">
    <div class="viewer-container" v-show="viewer === 'generic'">
      <GenericViewer ref="genericViewer" @close="onViewerClose" />
    </div>
  </Transition>
</template>

<style scoped>

hr {
    border: none;
    border-top: 1px solid #d0d0d0;
}

.container {
    display: flex;
    width: 100%;
    height: 100%;
}

.no-entries-placeholder {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}

.viewer-container {
  z-index: 30;
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
}

.topbar-actions {
  display: flex;
  gap: 6px;
}

.file-actions {
  white-space: nowrap;
  display: flex;
  gap: 6px;
}

@media only screen and (min-width: 767px) {
  .file-actions {
    margin-right: 50px;
  }

  .profile-dropdown {
    margin-left: 50px;
  }
}

pre {
  background-color: lightgray;
  border-radius: 2px;
  padding: 10px;
}

@media (prefers-color-scheme: dark) {
  pre {
    background-color: black;
  }
}

.side-bar {
    display: flex;
    height: 100%;
    min-width: 250px;
    background: linear-gradient(90deg, rgb(168, 85, 247) 0%, var(--pankow-color-primary) 100%);
    color: white;
    padding: 10px;
    flex-direction: column;
}

.side-bar-entry {
  cursor: pointer;
  color: white;
  padding: 10px;
  padding-left: 20px;
  margin-bottom: 5px;
  border-radius: 3px;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  min-height: 38px;
}

.side-bar-entry.active {
  background-color: rgba(255,255,255,0.1);
  font-weight: bold;
}

.side-bar-entry:hover {
  background-color: rgba(255,255,255,0.2);
}

.side-bar-entry > i {
  padding-right: 10px;
}

.side-bar-entry-button {
  background-color: rgba(255,255,255,0.2);
}

.side-bar-entry-button:hover {
  background-color: rgba(255,255,255,0.7);
  color: var(--pankow-text-color);
}

.content {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
  flex-grow: 1;
  flex-direction: column;
}

.upload {
  display: flex;
  height: 50px;
  width: 100%;
  padding: 10px;
  flex-direction: column;
}

.main-container-content {
  position: relative;
  overflow: hidden;
  flex-grow: 1;
}

.shared-link, .shared-link-empty {
  display: flex;
  justify-content: space-between;
  padding: 6px;
  align-items: center;
}

.shared-link:hover {
  background-color: var(--pankow-color-background-hover);
}

.breadcrumb-bar {
  display: flex;
  gap: 4px;
  margin: auto 0px;
  padding: 4px;
  align-items: center;
}

</style>
