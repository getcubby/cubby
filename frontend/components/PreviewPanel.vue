<script setup>

import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { Button, TabView } from '@cloudron/pankow';
import ResizeHandle from '@cloudron/pankow/components/ResizeHandle.vue';
import { getPreviewUrl } from '../utils.js';
import { prettyLongDate, prettyFileSize, prettyDate } from '@cloudron/pankow/utils';
import MainModel from '../models/MainModel.js';
import EmptyState from './EmptyState.vue';

const props = defineProps({
  parentEntry: {
    type: Object,
    default: function () { return {}; }
  },
  selectedEntries: {
    type: Array,
    default: function () { return []; }
  },
  showDownload: {
    type: Boolean,
    default: false,
  },
  showDelete: {
    type: Boolean,
    default: false,
  },
  showShare: {
    type: Boolean,
    default: false,
  },
  emptyIcon: {
    type: String,
    default: '',
  },
  emptyMessage: {
    type: String,
    default: '',
  },
});

const emit = defineEmits(['download', 'delete', 'share']);

const PREVIEW_MIN_WIDTH = 260;
const PREVIEW_MAX_WIDTH = 720;
const PREVIEW_WIDTH_KEY = 'cubby-preview-width';

const visible = ref(localStorage.previewPanelVisible === 'true');
const previewWidth = ref(350);
const resizing = ref(false);
let resizeStartX = 0;
let resizeStartWidth = 0;

function clampPreviewWidth(width) {
  return Math.max(PREVIEW_MIN_WIDTH, Math.min(PREVIEW_MAX_WIDTH, width));
}

function restorePreviewWidth() {
  try {
    const stored = parseInt(localStorage.getItem(PREVIEW_WIDTH_KEY), 10);
    if (!stored) return;
    previewWidth.value = clampPreviewWidth(stored);
  } catch (e) {}
}

function resizeStart(event) {
  if (!visible.value) return;
  resizing.value = true;
  resizeStartX = event.clientX ?? event.touches?.[0]?.clientX ?? 0;
  resizeStartWidth = previewWidth.value;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  event.preventDefault();
}

function resizeMove(event) {
  if (!resizing.value) return;
  if (event.cancelable) event.preventDefault();
  const x = event.clientX ?? event.touches?.[0]?.clientX ?? 0;
  previewWidth.value = clampPreviewWidth(resizeStartWidth + (resizeStartX - x));
}

function resizeEnd() {
  if (!resizing.value) return;
  resizing.value = false;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  try {
    localStorage.setItem(PREVIEW_WIDTH_KEY, String(previewWidth.value));
  } catch (e) {}
}
const activeTab = ref('details');
const hasContent = computed(() => props.selectedEntries.length > 0 || Object.keys(props.parentEntry).length !== 0);
const entry = computed(() =>{
  return props.selectedEntries.length ? props.selectedEntries[0] : props.parentEntry;
});
const displayName = computed(() => entry.value.name || entry.value.fileName || '');
const displayPath = computed(() => entry.value.filePath || entry.value.resource?.path || '');
const showName = computed(() => {
  if (!displayName.value) return false;
  return !(entry.value.resource?.type === 'home' && entry.value.filePath === '/');
});
const showOwner = computed(() => entry.value.resource?.type !== 'home');
const combinedSize = computed(() => {
  return props.selectedEntries.length ? props.selectedEntries.reduce(function (acc, val) { return acc + val.size; }, 0) : props.parentEntry.size;
});

const showActions = computed(() => {
  if (props.selectedEntries.length === 0) return false;
  return props.showDownload || props.showDelete || (props.showShare && props.selectedEntries.length === 1);
});

const tabViewKey = computed(() => {
  if (props.selectedEntries.length === 1) return props.selectedEntries[0].resourcePath || props.selectedEntries[0].id;
  return `multi-${props.selectedEntries.length}`;
});

function onToggle() {
  visible.value = !visible.value;
  localStorage.previewPanelVisible = visible.value;
}

function onTabChanged(tab) {
  activeTab.value = tab;
}

const activityItems = ref([]);

const groups = ref([]);
const groupNameById = computed(() => {
  const map = {};
  groups.value.forEach((g) => { map[g.id] = g.name; });
  return map;
});

function receiverLabel(details) {
  if (details?.receiverUsername) return details.receiverUsername;
  if (details?.receiverGroup) return groupNameById.value[details.receiverGroup] || details.receiverGroup;
  if (details?.receiverEmail) return details.receiverEmail;
  return 'link';
}

function actorLabel(item) {
  return item.actorUsername || 'Anonymous user';
}

function formatActivityAction(item) {
  switch (item.action) {
  case 'created':
    return item.details?.isDirectory ? 'created folder' : 'created';
  case 'updated':
    return 'updated';
  case 'deleted':
    return 'deleted';
  case 'moved': {
    const from = item.details?.fromPath || '';
    return from ? `moved from ${from}` : 'moved';
  }
  case 'copied': {
    const from = item.details?.fromPath || '';
    return from ? `copied from ${from}` : 'copied';
  }
  case 'shared':
    return `shared with ${receiverLabel(item.details)}`;
  case 'unshared':
    return `unshared with ${receiverLabel(item.details)}`;
  case 'filedrop_created':
    return 'created file drop';
  case 'filedrop_deleted':
    return 'deleted file drop';
  default:
    return item.action;
  }
}

async function loadActivity() {
  if (props.selectedEntries.length !== 1) {
    activityItems.value = [];
    return;
  }

  const selected = props.selectedEntries[0];
  const path = selected.resourcePath;
  if (!path) {
    activityItems.value = [];
    return;
  }

  try {
    activityItems.value = await MainModel.activity(path);
  } catch (e) {
    activityItems.value = [];
  }
}

watch(() => props.selectedEntries, loadActivity, { deep: true, immediate: true });

async function loadGroups() {
  try {
    groups.value = await MainModel.getGroups();
  } catch (e) {
    groups.value = [];
  }
}

onMounted(function () {
  loadGroups();
  restorePreviewWidth();
  document.addEventListener('mousemove', resizeMove);
  document.addEventListener('mouseup', resizeEnd);
  document.addEventListener('touchmove', resizeMove, { passive: false });
  document.addEventListener('touchend', resizeEnd);
});

onUnmounted(function () {
  document.removeEventListener('mousemove', resizeMove);
  document.removeEventListener('mouseup', resizeEnd);
  document.removeEventListener('touchmove', resizeMove);
  document.removeEventListener('touchend', resizeEnd);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});

</script>

<template>
  <div class="preview-container" :class="{ 'visible': visible, 'resizing': resizing }" :style="visible ? { width: previewWidth + 'px', '--preview-width': previewWidth + 'px' } : null">
    <div class="toggle-button" @click="onToggle" :title="visible ? 'Hide preview' : 'Show preview'"><i :class="'fa-solid ' + (visible ? 'fa-chevron-right' : 'fa-chevron-left')"></i></div>
    <div class="preview-frame">
    <ResizeHandle v-if="visible" class="preview-resize-handle" orientation="horizontal" :dragging="resizing" @mousedown="resizeStart" @touchstart.prevent="resizeStart" />

    <div v-if="!hasContent && emptyMessage" class="preview-empty">
      <EmptyState :icon="emptyIcon" :title="emptyMessage" />
    </div>
    <div v-else-if="hasContent" class="preview-body">
      <div class="preview-icon-container">
        <div class="preview-icon" v-for="selectedEntry in selectedEntries.slice(0, 15)" :key="selectedEntry.id" :style="{ backgroundImage: selectedEntry && getPreviewUrl(selectedEntry) ? 'url(' + getPreviewUrl(selectedEntry) + ')' : 'none' }"></div>
        <div class="preview-icon" v-show="!selectedEntries.length" :style="{ backgroundImage: parentEntry && getPreviewUrl(parentEntry) ? 'url(' + getPreviewUrl(parentEntry) + ')' : 'none' }"></div>
      </div>

      <TabView :key="tabViewKey" :tabs="{ details: 'Details', activity: 'Activity' }" :default-active="activeTab" @changed="onTabChanged" class="preview-tabs">
        <template #details>
          <div class="detail" v-show="selectedEntries.length <= 1 && showName">
            <p>Name</p>
            <span class="detail-value">{{ displayName }}</span>
          </div>
          <div class="detail" v-show="selectedEntries.length <= 1 && displayPath">
            <p>Path</p>
            <span class="detail-value">{{ displayPath }}</span>
          </div>
          <div class="detail" v-show="selectedEntries.length <= 1 && showOwner">
            <p>Owner</p>
            <span class="detail-value">{{ entry.owner }}</span>
          </div>
          <div class="detail" v-show="selectedEntries.length <= 1">
            <p>Updated</p>
            <span class="detail-value">{{ prettyLongDate(entry.mtime) }}</span>
          </div>
          <div class="detail" v-show="selectedEntries.length > 1">
            <p>{{ selectedEntries.length }} files selected</p>
          </div>
          <div class="detail">
            <p>Size</p>
            <span class="detail-value">{{ prettyFileSize(combinedSize) }}</span>
          </div>
          <div class="detail" v-show="selectedEntries.length <= 1 && entry.sharedWith && entry.sharedWith.length">
            <p>Shared with</p>
            <div class="detail-shared-width" v-for="share in entry.sharedWith" :key="share.id">{{ receiverLabel({ receiverUsername: share.receiverUsername, receiverGroup: share.receiverGroup, receiverEmail: share.receiverEmail }) }}</div>
          </div>
          <div class="detail" v-show="showActions">
            <p>Actions</p>
            <div class="detail-actions">
              <Button v-if="showDownload" outline icon="fa-solid fa-download" @click="emit('download', selectedEntries)">Download</Button>
              <Button v-if="showShare && selectedEntries.length === 1" outline icon="fa-solid fa-share-from-square" @click="emit('share', selectedEntries[0])">Share</Button>
              <Button v-if="showDelete" outline danger icon="fa-solid fa-trash" @click="emit('delete', selectedEntries)">Delete</Button>
            </div>
          </div>
        </template>

        <template #activity>
          <div v-if="selectedEntries.length !== 1" class="activity-empty">Select a single file or folder to view activity</div>
          <template v-else>
            <div v-if="activityItems.length === 0" class="activity-empty">No activity yet</div>
            <div v-for="item in activityItems" :key="item.id" class="activity-item">
              <div class="activity-label">
                <strong class="activity-actor">{{ actorLabel(item) }}</strong> {{ formatActivityAction(item) }}
              </div>
              <span class="activity-time" v-tooltip.top="prettyLongDate(item.createdAt)">{{ prettyDate(item.createdAt) }}</span>
            </div>
          </template>
        </template>
      </TabView>
    </div>
    </div>
  </div>
</template>

<style scoped>

.preview-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 0;
    transition: width ease-in 300ms;
}

.preview-frame {
    display: flex;
    flex-direction: column;
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
}

.preview-container.resizing {
    transition: none;
}

.preview-container.visible {
    flex-shrink: 0;
}

.preview-resize-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 2;
}

.preview-body {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
}

.preview-empty {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    min-height: 0;
    overflow: auto;
}

.preview-icon-container {
    display: flex;
    width: 100%;
    height: var(--preview-width, 350px);
    max-height: 50vh;
    min-height: 120px;
    flex-shrink: 1;
    flex-direction: row;
    flex-wrap: wrap-reverse;
}

.preview-icon {
    background-repeat: no-repeat;
    background-position: center;
    background-size: contain;
    flex-grow: 1;
    min-width: 64px;
    min-height: 64px;
}

.preview-tabs {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    padding: 0 10px 10px;
}

.preview-tabs :deep(.pankow-tabview) {
    height: 100%;
}

.preview-tabs :deep(.pankow-tabview-content) {
    overflow-y: auto;
    flex: 1;
    min-height: 0;
}

.detail > p {
    color: #888;
    margin-top: 5px;
    margin-bottom: 5px;
}

.detail {
    margin-bottom: 5px;
}

.detail-value {
    display: block;
    word-break: break-word;
}

.detail-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}

.detail-shared-width {
  margin: 2px 0;
}

.activity-empty {
  color: #888;
  font-size: 13px;
  padding-top: 4px;
}

.activity-item {
  margin-bottom: 8px;
  font-size: 13px;
}

.activity-actor {
  font-weight: 600;
}

.activity-label {
  word-break: break-word;
}

.activity-time {
  color: #888;
  font-size: 12px;
}

@media only screen and (max-width: 767px)  {
    .preview-container {
        display: none;
    }
}

.toggle-button {
  position: absolute;
  right: 0;
  padding: 10px 15px;
  cursor: pointer;
}

@media only screen and (max-width: 767px) {
  .toggle-button {
    display: none;
  }
}

</style>
