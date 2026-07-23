<script setup>

import { ref, useTemplateRef, computed, inject, onMounted } from 'vue';
import { BASE_URL, parseResourcePath, sanitize } from '../utils.js';
import {
  Breadcrumb,
  Button,
  ButtonGroup,
  Dialog,
  DirectoryView,
  FileUploader,
  TextInput,
  useNotify
} from '@cloudron/pankow';
import DirectoryModel from '../models/DirectoryModel.js';
import FavoriteModel from '../models/FavoriteModel.js';
import PreviewPanel from './PreviewPanel.vue';
import EmptyState from './EmptyState.vue';
import RenameDialog from './RenameDialog.vue';

const { notify } = useNotify();

const DirectoryModelError = DirectoryModel.DirectoryModelError;

const emit = defineEmits(['invalid-session', 'share', 'filedrop', 'close-viewer', 'open-file']);

const profile = inject('profile');

const beforeUnloadListener = (event) => {
  event.preventDefault();
  return window.confirm('File operation still in progress. Close anyway?');
};

const directoryBusy = ref(false);
const showSize = ref(true);
const activeResourceType = ref('');
const uiError = ref('');
const entry = ref({});
const entries = ref([]);
const selectedEntries = ref([]);
const currentResourcePath = ref('');
const currentShare = ref(null);
const breadCrumbs = ref([]);
const breadCrumbHome = ref({
  label: 'My files',
  icon: 'fa-solid fa-house',
  route: '#files'
});
const viewMode = ref(localStorage.viewMode === 'grid' ? 'grid' : 'list');

const isReadonly = computed(() => {
  if (currentResourcePath.value === '/shares/') return true;
  if (currentResourcePath.value === '/groupfolders/') return true;
  if (!currentShare.value) return false;
  return currentShare.value.readonly;
});

function setViewMode(mode) {
  viewMode.value = mode;
  localStorage.viewMode = mode;
}

function onInvalidSession() {
  emit('invalid-session');
}

async function onToggleFavorite(favoriteEntry) {
  try {
    if (favoriteEntry.favorite) {
      await FavoriteModel.remove(favoriteEntry.favorite.id);
      favoriteEntry.favorite = null;
      favoriteEntry.star = false;
    } else {
      const payload = favoriteEntry.share
        ? { shareId: favoriteEntry.share.id, path: favoriteEntry.filePath }
        : { owner: favoriteEntry.owner, path: favoriteEntry.filePath };

      const id = await FavoriteModel.create(payload);
      favoriteEntry.favorite = { id, ...payload };
      favoriteEntry.star = true;
    }
  } catch (error) {
    if (error?.cause?.status === 401 || error?.status === 401) onInvalidSession();
    else console.error('Failed to toggle favorite', error);
  }
}

async function uploadJobPreFlightCheckHandler(job) {
  if (job.folder && await DirectoryModel.exists(parseResourcePath(job.targetFolder), job.folder)) {
    notify({ text: `Cannot upload. Folder ${job.folder} already exists.`, type: 'danger', timeout: 5000 });
    return false;
  }

  return true;
}

async function uploadHandler(targetDir, file, progressHandler) {
  const resource = parseResourcePath(targetDir);
  await DirectoryModel.upload(resource, file, progressHandler);
  await refresh();
}

const fileUploader = useTemplateRef('fileUploader');
const directoryView = useTemplateRef('directoryView');
const deleteDialog = useTemplateRef('deleteDialog');
const newItemDialogElement = useTemplateRef('newItemDialog');
const renameDialog = useTemplateRef('renameDialog');

const deletePending = ref([]);
const deleteBusy = ref(false);
const newItemForm = ref({
  mode: 'file',
  name: '',
  error: '',
  busy: false
});

function onNewItemDialogNameInput() {
  newItemForm.value.error = '';
}

function openNewFile() {
  newItemForm.value.busy = false;
  newItemForm.value.error = '';
  newItemForm.value.name = '';
  newItemForm.value.mode = 'file';
  newItemDialogElement.value.open();
}

function openNewFolder() {
  newItemForm.value.busy = false;
  newItemForm.value.error = '';
  newItemForm.value.name = '';
  newItemForm.value.mode = 'folder';
  newItemDialogElement.value.open();
}

function openUploadFile() {
  const resource = parseResourcePath(currentResourcePath.value || 'files/');
  fileUploader.value.onUploadFile(resource.resourcePath);
}

function openUploadFolder() {
  const resource = parseResourcePath(currentResourcePath.value || 'files/');
  fileUploader.value.onUploadFolder(resource.resourcePath);
}

async function onNewItemDialogSubmit() {
  if (newItemForm.value.busy) return;

  const name = newItemForm.value.name.trim();
  if (!name) return;

  newItemForm.value.busy = true;
  newItemForm.value.error = '';

  const resource = parseResourcePath(currentResourcePath.value || 'files/');
  const mode = newItemForm.value.mode;

  try {
    if (mode === 'file') await DirectoryModel.newFile(resource, name);
    else await DirectoryModel.newFolder(resource, name);
  } catch (error) {
    newItemForm.value.busy = false;
    if (error.reason === DirectoryModelError.NO_AUTH) {
      newItemDialogElement.value.close();
      onInvalidSession();
      return;
    }
    if (error.reason === DirectoryModelError.CONFLICT) {
      newItemForm.value.error = mode === 'file'
        ? 'A file with this name already exists.'
        : 'A folder with this name already exists.';
      return;
    }
    if (error.reason === DirectoryModelError.NOT_ALLOWED) {
      newItemForm.value.error = 'This name is not allowed.';
      return;
    }
    newItemForm.value.error = error.message || 'Something went wrong. Please try again.';
    console.error(mode === 'file' ? 'Failed to add file:' : 'Failed to add folder:', error);
    return;
  }

  newItemForm.value.busy = false;
  newItemDialogElement.value.close();
  await refresh();
  directoryView.value.highlightByName(name);
}

function clearSelection() {
  selectedEntries.value = [];
}

function reset() {
  entry.value = {};
  entries.value = [];
  clearSelection();
  breadCrumbs.value = [];
  breadCrumbHome.value = { label: 'My files', icon: 'fa-solid fa-house', route: '#files' };
  activeResourceType.value = '';
  currentResourcePath.value = '';
  currentShare.value = null;
}

function onSelectionChanged(selectedItems) {
  selectedEntries.value = selectedItems;
}

async function onFileSaved(item, content, done) {
  try {
    await DirectoryModel.saveFile(item.resource, content);
  } catch (error) {
    console.error(`Failed to save file ${item.resourcePath}`, error);
  }

  if (typeof done === 'function') done();
}

async function downloadHandler(items) {
  if (items && !Array.isArray(items)) items = [ items ];
  if (!items) items = selectedEntries.value;
  if (items.length === 0) items = entries.value;

  const resource = parseResourcePath(currentResourcePath.value);
  await DirectoryModel.download(resource, items);
}

async function onDrop(targetFolder, dataTransfer, files) {
  const fullTargetFolder = sanitize(`${currentResourcePath.value}/${targetFolder}`);

  if (dataTransfer) {
    async function getFile(e) {
      return new Promise((resolve, reject) => {
        e.file(resolve, reject);
      });
    }

    const fileList = [];
    async function traverseFileTree(item) {
      return new Promise(async (resolve) => {
        if (item.isFile) {
          fileList.push(await getFile(item));
          resolve();
        } else if (item.isDirectory) {
          const dirReader = item.createReader();
          const dirItems = await new Promise((resolve, reject) => { dirReader.readEntries(resolve, reject); });

          for (let i in dirItems) {
            await traverseFileTree(dirItems[i]);
          }

          resolve();
        } else {
          console.log('Skipping uknown file type', item);
          resolve();
        }
      });
    }

    const droppedEntries = [];
    for (const item of dataTransfer.items) {
      const droppedEntry = item.webkitGetAsEntry();
      if (!droppedEntry) {
        console.warn('Dropped item not supported.', item, item.getAsString((s) => console.log(s)));
        continue;
      }
      droppedEntries.push(droppedEntry);
    }

    for (const droppedEntry of droppedEntries) {
      if (droppedEntry.isFile) {
        fileList.push(await getFile(droppedEntry));
      } else if (droppedEntry.isDirectory) {
        await traverseFileTree(droppedEntry);
      }
    }
    fileUploader.value.addFiles(fileList, sanitize(`${currentResourcePath.value}/${targetFolder}`));
  } else {
    if (!files.length) return;

    window.addEventListener('beforeunload', beforeUnloadListener, { capture: true });

    await DirectoryModel.paste(parseResourcePath(fullTargetFolder), 'cut', files);
    await refresh();

    window.removeEventListener('beforeunload', beforeUnloadListener, { capture: true });
  }
}

async function deleteHandler(items) {
  if (!items) return;
  if (!Array.isArray(items)) items = [items];
  if (items.length === 0) return;

  deletePending.value = items;
  deleteBusy.value = false;
  deleteDialog.value.open();
}

function onDeleteCancel() {
  if (deleteBusy.value) return;
  deletePending.value = [];
}

async function onDeleteConfirm() {
  if (deleteBusy.value) return;

  const items = deletePending.value;
  if (items.length === 0) return;

  deleteBusy.value = true;
  window.addEventListener('beforeunload', beforeUnloadListener, { capture: true });

  for (const item of items) {
    try {
      const resource = parseResourcePath(sanitize(currentResourcePath.value + '/' + item.fileName));
      await DirectoryModel.remove(resource);
    } catch (e) {
      console.error(`Failed to remove file ${item.fileName}:`, e);
    }
  }

  await refresh();

  window.removeEventListener('beforeunload', beforeUnloadListener, { capture: true });

  deleteDialog.value.close();
  deletePending.value = [];
  deleteBusy.value = false;
}

async function extractHandler(item) {
  window.addEventListener('beforeunload', beforeUnloadListener, { capture: true });

  try {
    await DirectoryModel.extract(item.resource);
  } catch (error) {
    if (error.reason === DirectoryModelError.NO_AUTH) onInvalidSession();
    else if (error.reason === DirectoryModelError.PROCESSING_ERROR) {
      console.log(error);
      notify({ text: 'Failed to extract file: ' + error.message, persistent: true, type: 'danger' });
    } else {
      notify('Unknown error, check logs.');
    }

    window.removeEventListener('beforeunload', beforeUnloadListener, { capture: true });
    return;
  }
  await refresh();

  window.removeEventListener('beforeunload', beforeUnloadListener, { capture: true });
}

async function pasteHandler(action, files, target) {
  if (!files || !files.length) return;

  window.addEventListener('beforeunload', beforeUnloadListener, { capture: true });

  const resource = parseResourcePath((target && target.isDirectory) ? sanitize(currentResourcePath.value + '/' + target.fileName) : currentResourcePath.value);
  await DirectoryModel.paste(resource, action, files);
  await refresh();

  window.removeEventListener('beforeunload', beforeUnloadListener, { capture: true });
}

function shareHandler(item) {
  emit('share', item);
}

function fileDropHandler(item) {
  emit('filedrop', item);
}

async function onRenameRequested(item) {
  renameDialog.value.open(item);
}

function onRenamed(newName) {
  refresh();
  directoryView.value.highlightByName(newName);
}

async function onRefreshCurrentDirectory() {
  await refresh(null);
}

async function refresh(item = null) {
  if (item) {
    try {
      item = await DirectoryModel.get(item.resource, item.resource.path);
    } catch (error) {
      if (error.status === 401) return onInvalidSession();
      else if (error.status === 404) uiError.value = 'Does not exist';
      else console.error(error);
      return;
    }

    const idx = entries.value.findIndex((e) => e.id === item.id );
    if (idx !== -1) entries.value.splice(idx, 1, item);
  } else {
    directoryBusy.value = true;

    const resource = parseResourcePath(currentResourcePath.value);

    try {
      item = await DirectoryModel.get(resource, resource.path);
    } catch (error) {
      if (error.status === 401) return onInvalidSession();
      else if (error.status === 404) uiError.value = 'Does not exist';
      else console.error(error);
      return;
    }

    entry.value.files.forEach(function (e) {
      e.filePathNew = e.fileName;
    });

    entry.value = item;
    entries.value = item.files;
    directoryBusy.value = false;
  }
}

async function loadMainDirectory(path, item, forceLoad = false) {
  const resource = parseResourcePath(path);
  if (!resource) return;

  if (!forceLoad && currentResourcePath.value === resource.resourcePath) return;

  if (!item) {
    try {
      item = await DirectoryModel.get(resource, resource.path);
    } catch (error) {
      entries.value = [];
      item = {};

      if (error.status === 401) return onInvalidSession();
      else if (error.status === 404) return uiError.value = 'Does not exist';
      else return console.error(error);
    }
  }

  activeResourceType.value = resource.type;
  currentResourcePath.value = resource.resourcePath;
  currentShare.value = item.share || null;

  if (resource.type === 'home') {
    breadCrumbs.value = sanitize(resource.path).split('/').filter(function (i) { return !!i; }).map(function (e, i, a) {
      return {
        label: decodeURIComponent(e),
        route: '#files/home' + sanitize('/' + a.slice(0, i).join('/') + '/' + e)
      };
    });
    breadCrumbHome.value = {
      label: 'My files',
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
      label: 'Shared with you',
      icon: 'fa-solid fa-share-nodes',
      route: '#files/shares/'
    };

    if (item.share) {
      breadCrumbs.value.unshift({
        label: item.share.filePath.slice(1),
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
      label: 'Group folders',
      icon: 'fa-solid fa-user-group',
      route: '#files/groupfolders/'
    };

    if (item.group) {
      breadCrumbs.value.unshift({
        label: item.group.name,
        route: '#files/groupfolders/' + item.group.id + '/'
      });
    }
  } else {
    console.error('FIXME breadcrumbs for resource type', resource.type);
  }

  item.files.forEach(function (e) {
    e.filePathNew = e.fileName;
  });

  entry.value = item;
  entries.value = item.files;
  emit('close-viewer');
}

async function reload() {
  directoryBusy.value = true;
  await loadMainDirectory(currentResourcePath.value, null, true);
  directoryBusy.value = false;
}

async function loadPath(path, forceLoad = false) {
  const resource = parseResourcePath(path || currentResourcePath.value);

  emit('close-viewer');

  if (!forceLoad && currentResourcePath.value === resource.resourcePath) return true;

  directoryBusy.value = true;

  let item;
  try {
    item = await DirectoryModel.get(resource);
  } catch (error) {
    entries.value = [];
    entry.value = {};

    if (error.status === 401 || error.status === 403) {
      onInvalidSession();
      return false;
    } else if (error.status === 404) {
      console.error('Failed to load entry', resource, error);
      notify({ text: `File or folder ${resource.path} does not exist`, type: 'danger', persistent: true });
      return false;
    } else {
      console.error(error);
      return false;
    }
  }

  window.location.hash = `files${resource.resourcePath}`;

  if (item.isDirectory) await loadMainDirectory(resource.resourcePath, item, forceLoad);
  else await loadMainDirectory(resource.parentResourcePath, null, forceLoad);

  if (!item.isDirectory) {
    emit('open-file', { item, resource, siblingEntries: entries.value });
  } else {
    emit('close-viewer');
    clearSelection();
  }

  entry.value = item;
  directoryBusy.value = false;

  return true;
}

function onOpen(item) {
  if (item.share && item.share.id) window.location.hash = `files/shares/${item.share.id}${item.filePath}`;
  else if (item.group && item.group.id) window.location.hash = `files/groupfolders/${item.group.id}${item.filePath}`;
  else window.location.hash = `files/home${item.filePath}`;
}

function onUp() {
  if (window.location.hash.indexOf('#shares/') === 0) {
    const hash = window.location.hash.slice('#shares/'.length);

    if (!hash.split('/')[1]) window.location.hash = 'shares/';
    else window.location.hash = hash.split('/')[0] + sanitize(hash.split('/').filter(function (p) { return !!p; }).slice(1, -1).join('/'));
  } else {
    const hash = window.location.hash.slice(1);
    window.location.hash = hash.split('/')[0] + sanitize(hash.split('/').filter(function (p) { return !!p; }).slice(1, -1).join('/'));
  }
}

onMounted(() => {
  showSize.value = window.innerWidth >= 576;

  const model = directoryView.value?.contextMenuModel;
  if (!model) return;

  const shareIdx = model.findIndex(i => i.id === 'share');
  if (shareIdx === -1) return;

  model.splice(shareIdx + 1, 0, {
    id: 'filedrop',
    label: 'File drop',
    icon: 'fa-solid fa-cloud-arrow-up',
    action: () => {
      fileDropHandler(directoryView.value?.focusItem);
    },
    disabled: () => {
      const item = directoryView.value?.focusItem;
      return !item || item.isFile;
    },
  });
});

defineExpose({
  loadPath,
  reset,
  reload,
  openNewFile,
  openNewFolder,
  openUploadFile,
  openUploadFolder,
  isReadonly,
  currentResourcePath,
  downloadHandler,
  onFileSaved,
});

</script>

<template>
  <div class="file-browser">
    <div class="file-browser-layout">
      <div class="main-container-content">
        <div class="breadcrumb-bar">
          <Button icon="fa-solid fa-chevron-left" :disabled="breadCrumbs.length === 0" @click="onUp" plain tool></Button>
          <Breadcrumb :home="breadCrumbHome" :items="breadCrumbs" />
          <div style="flex-grow: 1"></div>
          <ButtonGroup style="margin-right: 40px">
            <Button icon="fa-solid fa-list" secondary :outline="viewMode !== 'list' ? true : null" tool @click="setViewMode('list')" />
            <Button icon="fa-solid fa-grip" secondary :outline="viewMode !== 'grid' ? true : null" tool @click="setViewMode('grid')" />
          </ButtonGroup>
        </div>
        <div class="directory-pane">
          <DirectoryView
            ref="directoryView"
            :busy="directoryBusy"
            :view-mode="viewMode"
            :show-star="!!profile?.username"
            :show-owner="false"
            :show-extract="currentResourcePath !== '/groupfolders/'"
            :show-size="showSize"
            :show-modified="true"
            :show-delete="!isReadonly"
            :show-new-file="!isReadonly"
            :show-new-folder="!isReadonly"
            :show-upload-file="!isReadonly"
            :show-upload-folder="!isReadonly"
            :show-paste="!isReadonly"
            :show-rename="!isReadonly"
            :show-download="currentResourcePath !== '/groupfolders/'"
            :show-select-all="currentResourcePath !== '/groupfolders/'"
            :show-copy="currentResourcePath !== '/groupfolders/'"
            :show-cut="!isReadonly"
            :show-share="activeResourceType !== 'shares' && currentResourcePath !== '/groupfolders/'"
            :share-indicator-property="'isSharedWith'"
            :file-drop-indicator-property="'isFileDrop'"
            :editable="!isReadonly"
            :multi-download="true"
            @selection-changed="onSelectionChanged"
            @item-activated="onOpen"
            @rename-requested="onRenameRequested"
            :refresh-handler="onRefreshCurrentDirectory"
            :delete-handler="deleteHandler"
            :share-handler="shareHandler"
            :star-handler="onToggleFavorite"
            :paste-handler="pasteHandler"
            :download-handler="downloadHandler"
            :extract-handler="extractHandler"
            :new-file-handler="openNewFile"
            :new-folder-handler="openNewFolder"
            :upload-file-handler="openUploadFile"
            :upload-folder-handler="openUploadFolder"
            :drop-handler="onDrop"
            :items="entries"
            :fallback-icon="`${BASE_URL}mime-types/none.svg`"
          >
            <template #empty>
              <EmptyState v-if="activeResourceType === 'home' || (activeResourceType === 'shares' && breadCrumbs.length) || (activeResourceType === 'groupfolders' && breadCrumbs.length)" icon="fa-regular fa-folder" title="No files" description="Create new or upload existing files" />
              <EmptyState v-else-if="activeResourceType === 'groupfolders' && !breadCrumbs.length && !profile.admin" icon="fa-solid fa-user-group" title="Not part of any group folder" description="Ask an admin to add you to a group folder" />
              <EmptyState
                v-else-if="activeResourceType === 'groupfolders' && !breadCrumbs.length && profile.admin"
                icon="fa-solid fa-user-group"
                title="No group folders"
              >
                <template #description>
                  Create <a href="#settings">group folders in Settings</a>
                </template>
              </EmptyState>
              <EmptyState v-else-if="activeResourceType === 'shares' && !breadCrumbs.length" icon="fa-solid fa-share-nodes" title="Nothing shared with you" description="Files and folders others shared with you will show up here" />
            </template>
          </DirectoryView>
        </div>
      </div>
      <PreviewPanel
        :parent-entry="entry"
        :selected-entries="selectedEntries"
        :show-download="currentResourcePath !== '/groupfolders/'"
        :show-delete="!isReadonly"
        :show-share="activeResourceType !== 'shares' && currentResourcePath !== '/groupfolders/'"
        @download="downloadHandler"
        @delete="deleteHandler"
        @share="shareHandler"
      />
    </div>

    <FileUploader
      ref="fileUploader"
      :upload-handler="uploadHandler"
      :job-pre-flight-check-handler="uploadJobPreFlightCheckHandler"
      @finished="refresh"
    />

    <Dialog
      :title="newItemForm.mode === 'file' ? 'New filename' : 'New folder name'"
      ref="newItemDialog"
      reject-label="Cancel"
      reject-style="secondary"
      confirm-label="Save"
      confirm-style="success"
      :confirm-busy="newItemForm.busy"
      :confirm-active="!!newItemForm.name.trim()"
      @confirm="onNewItemDialogSubmit"
    >
      <form @submit.prevent="onNewItemDialogSubmit">
        <TextInput
          id="newItemNameInput"
          v-model="newItemForm.name"
          :placeholder="newItemForm.mode === 'file' ? 'Filename' : 'Folder name'"
          autofocus
          style="width: 100%"
          @update:model-value="onNewItemDialogNameInput"
        />
        <p class="has-error" v-show="newItemForm.error">{{ newItemForm.error }}</p>
      </form>
    </Dialog>

    <Dialog
      ref="deleteDialog"
      title="Confirm deletion"
      reject-label="Cancel"
      reject-style="secondary"
      confirm-label="Delete"
      confirm-style="danger"
      :confirm-busy="deleteBusy"
      @confirm="onDeleteConfirm"
      @close="onDeleteCancel"
    >
      <p v-if="deletePending.length === 1">
        Delete "{{ deletePending[0].fileName }}"?
      </p>
      <template v-else-if="deletePending.length > 1">
        <p>The following items will be deleted:</p>
        <ul class="delete-file-list">
          <li v-for="item in deletePending" :key="item.fileName">{{ item.fileName }}</li>
        </ul>
      </template>
    </Dialog>

    <RenameDialog ref="renameDialog" @rename="onRenamed" />
  </div>
</template>

<style scoped>

.file-browser {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-grow: 1;
  min-height: 0;
  height: 100%;
}

.file-browser-layout {
  display: flex;
  overflow: hidden;
  flex-grow: 1;
  min-height: 0;
}

.main-container-content {
  position: relative;
  overflow: hidden;
  flex-grow: 1;
}

.breadcrumb-bar {
  display: flex;
  gap: 4px;
  margin: auto 0px;
  padding: 4px;
  align-items: center;
}

.directory-pane {
  overflow: hidden;
  height: calc(100% - 46px);
}

.delete-file-list {
  margin: 8px 0 0;
  padding-left: 20px;
  max-height: 200px;
  overflow-y: auto;
}

</style>
