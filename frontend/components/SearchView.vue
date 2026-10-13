<script setup>

import { ref, computed, watch, inject, onMounted, onUnmounted, useTemplateRef } from 'vue';
import {
  Button,
  ButtonGroup,
  Dialog,
  DirectoryView,
  ProgressBar,
  useChangeBroadcast,
  useNotify
} from '@cloudron/pankow';
import MainModel from '../models/MainModel.js';
import DirectoryModel from '../models/DirectoryModel.js';
import FavoriteModel from '../models/FavoriteModel.js';
import PreviewPanel from './PreviewPanel.vue';
import EmptyState from './EmptyState.vue';
import RenameDialog from './RenameDialog.vue';
import {
  API_ORIGIN,
  BASE_URL,
  getExtension,
  getResultFolderPath,
  getResultLocationLabel,
  parseResourcePath,
  toResourcePath
} from '../utils.js';

const props = defineProps({
  query: {
    type: String,
    required: true,
  },
  clipboard: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(['item-activated', 'invalid-session', 'share']);

const { notify } = useNotify();
const DirectoryModelError = DirectoryModel.DirectoryModelError;
const DRAG_SCOPE = 'cubby';

const profile = inject('profile');
const directoryView = useTemplateRef('directoryView');
const deleteDialog = useTemplateRef('deleteDialog');
const renameDialog = useTemplateRef('renameDialog');

const changes = useChangeBroadcast('cubby-changes', DRAG_SCOPE);

const entries = ref([]);
const selectedEntries = ref([]);
const busy = ref(true);
const deletePending = ref([]);
const deleteBusy = ref(false);
const showSize = ref(true);
const viewMode = ref(localStorage.viewMode === 'grid' ? 'grid' : 'list');
const emptyDescription = computed(describeEmptySearch);

function describeEmptySearch() {
  return `No files match "${props.query}"`;
}

let loadGeneration = 0;

const beforeUnloadListener = (event) => {
  event.preventDefault();
  return window.confirm('File operation still in progress. Close anyway?');
};

function setViewMode(mode) {
  viewMode.value = mode;
  localStorage.viewMode = mode;
}

function toDirectoryItem(entry) {
  if (!entry?.id || !entry.fileName || !entry.filePath) return null;

  const resourcePath = toResourcePath({
    shareId: entry.share?.id,
    owner: entry.owner,
    filePath: entry.filePath,
  });
  const resource = parseResourcePath(resourcePath);
  if (!resource) return null;

  const previewUrl = entry.previewUrl || `${BASE_URL}mime-types/application-x-generic.svg`;

  return {
    ...entry,
    name: entry.fileName,
    icon: previewUrl,
    previewUrl,
    modified: new Date(entry.mtime),
    extension: getExtension(entry),
    favorite: entry.favorite || null,
    star: !!entry.favorite,
    resourcePath,
    resource,
    href: `#files${resourcePath}`,
    fullFileUrl: `${API_ORIGIN}/api/v1/files?path=${encodeURIComponent(resourcePath)}&type=raw`,
    downloadFileUrl: `${API_ORIGIN}/api/v1/files?path=${encodeURIComponent(resourcePath)}&type=download`,
    isSharedWith: !!entry.sharedWith?.length,
    isFileDrop: !!entry.isDirectory && !!entry.fileDrops?.length,
    detailLocation: getResultLocationLabel(entry),
    detailFolder: getResultFolderPath(entry),
  };
}

async function load() {
  const q = props.query.trim();
  const gen = ++loadGeneration;
  if (!q) {
    entries.value = [];
    selectedEntries.value = [];
    busy.value = false;
    return;
  }

  busy.value = true;

  let results;
  try {
    results = await MainModel.search('*' + q + '*');
  } catch (error) {
    if (gen !== loadGeneration) return;
    entries.value = [];
    selectedEntries.value = [];
    busy.value = false;
    if (error?.cause?.status === 401 || error?.name === 'AbortError') {
      if (error?.cause?.status === 401) emit('invalid-session');
      return;
    }
    console.error('Failed to search', error);
    notify({ text: 'Search failed', type: 'danger' });
    return;
  }

  if (gen !== loadGeneration) return;

  const seen = new Set();
  const items = [];
  for (const result of results) {
    const item = toDirectoryItem(result.entry);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }

  entries.value = items;
  selectedEntries.value = [];
  busy.value = false;
}

function onSelectionChanged(selectedItems) {
  selectedEntries.value = selectedItems;
}

function onOpen(item) {
  emit('item-activated', item);
}

function openParentFolder(item) {
  if (!item || item.isDirectory) return;
  const folderPath = item.filePath.slice(0, -item.fileName.length) || '/';
  emit('item-activated', { ...item, filePath: folderPath, isDirectory: true });
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
    if (error?.cause?.status === 401 || error?.status === 401) emit('invalid-session');
    else console.error('Failed to toggle favorite', error);
  }
}

async function downloadHandler(items) {
  if (items && !Array.isArray(items)) items = [ items ];
  if (!items || items.length === 0) items = selectedEntries.value;
  if (items.length === 0) return;

  await DirectoryModel.download(items[0].resource, items);
}

function dragPayloadHandler(items) {
  return items.map(function (i) { return { name: i.name, extension: i.extension, resourcePath: i.resourcePath }; });
}

function filesFromDragPayload(payload) {
  if (!Array.isArray(payload)) return null;

  const files = payload
    .filter(function (f) { return typeof f?.name === 'string' && f.name && typeof f.extension === 'string' && typeof f.resourcePath === 'string' && f.resourcePath.startsWith('/'); })
    .map(function (f) { return { name: f.name, extension: f.extension, resourcePath: f.resourcePath, resource: parseResourcePath(f.resourcePath) }; });

  return files.length ? files : null;
}

function directoryByName(name) {
  if (!name) return null;

  const matches = entries.value.filter(function (entry) { return entry.isDirectory && entry.name === name; });
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) notify({ text: 'Several folders have that name. Open one to move files into it.', type: 'danger' });
  return null;
}

async function pasteInto(target, action, files) {
  if (!target?.isDirectory || !target.resource || !files?.length) return;

  window.addEventListener('beforeunload', beforeUnloadListener, { capture: true });

  try {
    await DirectoryModel.paste(target.resource, action === 'copy' ? 'copy' : 'cut', files);
  } catch (error) {
    if (error.reason === DirectoryModelError.NO_AUTH) emit('invalid-session');
    else notify({ text: 'Could not paste files', type: 'danger' });
    window.removeEventListener('beforeunload', beforeUnloadListener, { capture: true });
    return;
  }

  const sourceFolders = action === 'copy' ? [] : files.map(function (f) { return f.resource?.parentResourcePath; }).filter(Boolean);
  changes.announce([target.resource.resourcePath, ...sourceFolders]);
  window.removeEventListener('beforeunload', beforeUnloadListener, { capture: true });
  await load();
}

async function pasteHandler(action, files, target) {
  if (!files?.length) return;
  if (!target?.isDirectory) {
    notify({ text: 'Choose a folder to paste into.' });
    return;
  }
  await pasteInto(target, action, files);
}

async function onDrop(targetName, dataTransfer, files, { payload = null, action = 'move' } = {}) {
  if (dataTransfer) return;

  const target = directoryByName(targetName);
  if (!target) return;

  const dropped = files?.length ? files : filesFromDragPayload(payload);
  await pasteInto(target, action === 'copy' ? 'copy' : 'cut', dropped);
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

  const removed = [];
  for (const item of items) {
    try {
      await DirectoryModel.remove(item.resource);
      removed.push(item);
    } catch (error) {
      console.error(`Failed to remove file ${item.fileName}:`, error);
      if (error.reason === DirectoryModelError.NO_AUTH) {
        emit('invalid-session');
        break;
      }
      notify({ text: `Could not delete "${item.fileName}"`, type: 'danger' });
    }
  }

  const parents = removed.map(function (item) { return item.resource?.parentResourcePath; }).filter(Boolean);
  if (parents.length) changes.announce(parents);

  window.removeEventListener('beforeunload', beforeUnloadListener, { capture: true });
  deleteDialog.value.close();
  deleteBusy.value = false;
  deletePending.value = [];
  await load();
}

async function extractHandler(item) {
  window.addEventListener('beforeunload', beforeUnloadListener, { capture: true });

  try {
    await DirectoryModel.extract(item.resource);
  } catch (error) {
    if (error.reason === DirectoryModelError.NO_AUTH) emit('invalid-session');
    else if (error.reason === DirectoryModelError.PROCESSING_ERROR) notify({ text: 'Failed to extract file: ' + error.message, persistent: true, type: 'danger' });
    else notify({ text: 'Could not extract file', type: 'danger' });

    window.removeEventListener('beforeunload', beforeUnloadListener, { capture: true });
    return;
  }

  if (item.resource?.parentResourcePath) changes.announce([item.resource.parentResourcePath]);
  window.removeEventListener('beforeunload', beforeUnloadListener, { capture: true });
  await load();
}

function shareHandler(item) {
  emit('share', item);
}

function onRenameRequested(item) {
  renameDialog.value.open(item);
}

async function onRenamed() {
  const parent = directoryView.value?.focusItem?.resource?.parentResourcePath;
  if (parent) changes.announce([parent]);
  await load();
}

function installContextMenu() {
  const model = directoryView.value?.contextMenuModel;
  if (!model || model.some(function (item) { return item.id === 'open-folder'; })) return;

  const openIdx = model.findIndex(function (item) { return item.id === 'open'; });
  if (openIdx === -1) return;

  model.splice(openIdx + 1, 0, {
    id: 'open-folder',
    label: 'Open folder',
    icon: 'fa-regular fa-folder-open',
    action: function () {
      openParentFolder(directoryView.value?.focusItem);
    },
    visible: function () {
      const item = directoryView.value?.focusItem;
      return !!item && !item.isDirectory;
    },
  });
}

onMounted(function () {
  showSize.value = window.innerWidth >= 576;
  installContextMenu();
});

watch(directoryView, function (view) {
  if (view) installContextMenu();
});

watch(() => props.query, onQueryChange, { immediate: true });

function onQueryChange() {
  load();
}

onUnmounted(cancelLoad);

function cancelLoad() {
  loadGeneration++;
}

</script>

<template>
  <div class="search-view">
    <div class="search-view-layout">
      <div class="main-container-content">
        <div class="search-toolbar">
          <div class="search-heading">Results for "{{ query }}"</div>
          <div class="search-toolbar-spacer"></div>
          <ButtonGroup>
            <Button icon="fa-solid fa-list" secondary :outline="viewMode !== 'list' ? true : null" tool @click="setViewMode('list')" />
            <Button icon="fa-solid fa-grip" secondary :outline="viewMode !== 'grid' ? true : null" tool @click="setViewMode('grid')" />
          </ButtonGroup>
        </div>
        <ProgressBar v-if="busy" mode="indeterminate" :show-label="false" :slim="true" :show-track="false"/>
        <div class="directory-pane">
          <DirectoryView
            ref="directoryView"
            :busy="busy"
            :view-mode="viewMode"
            :show-star="!!profile?.username"
            :show-owner="false"
            :show-extract="true"
            :show-size="showSize"
            :show-modified="true"
            :show-delete="true"
            :show-new-file="false"
            :show-new-folder="false"
            :show-upload-file="false"
            :show-upload-folder="false"
            :show-paste="true"
            :show-rename="true"
            :show-download="true"
            :show-select-all="true"
            :show-copy="true"
            :show-cut="true"
            :show-share="true"
            :share-indicator-property="'isSharedWith'"
            :file-drop-indicator-property="'isFileDrop'"
            :editable="true"
            :multi-download="true"
            :clipboard="clipboard"
            @selection-changed="onSelectionChanged"
            @item-activated="onOpen"
            @rename-requested="onRenameRequested"
            :refresh-handler="load"
            :delete-handler="deleteHandler"
            :share-handler="shareHandler"
            :star-handler="onToggleFavorite"
            :paste-handler="pasteHandler"
            :download-handler="downloadHandler"
            :extract-handler="extractHandler"
            :drop-handler="onDrop"
            :drag-scope="DRAG_SCOPE"
            :drag-payload-handler="dragPayloadHandler"
            :items="entries"
            :fallback-icon="`${BASE_URL}mime-types/application-x-generic.svg`"
          >
            <template #empty>
              <EmptyState icon="fa-solid fa-magnifying-glass" title="Nothing found" :description="emptyDescription" />
            </template>
          </DirectoryView>
        </div>
      </div>
      <PreviewPanel
        :parent-entry="{}"
        :selected-entries="selectedEntries"
        :show-download="true"
        :show-delete="true"
        :show-share="true"
        @download="downloadHandler"
        @delete="deleteHandler"
        @share="shareHandler"
      />
    </div>

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
          <li v-for="item in deletePending" :key="item.id">{{ item.fileName }} — {{ item.detailLocation }} {{ item.detailFolder }}</li>
        </ul>
      </template>
    </Dialog>

    <RenameDialog ref="renameDialog" @rename="onRenamed" />
  </div>
</template>

<style scoped>

.search-view {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-grow: 1;
  min-height: 0;
  height: 100%;
}

.search-view-layout {
  display: flex;
  overflow: hidden;
  flex-grow: 1;
  min-height: 0;
}

.main-container-content {
  position: relative;
  overflow: hidden;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.search-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px 4px;
  flex-shrink: 0;
}

.search-heading {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-toolbar-spacer {
  flex-grow: 1;
}

.directory-pane {
  overflow: hidden;
  flex-grow: 1;
  min-height: 0;
}

.delete-file-list {
  margin: 8px 0 0;
  padding-left: 20px;
  max-height: 200px;
  overflow-y: auto;
}

</style>
