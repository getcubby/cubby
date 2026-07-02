<script setup>

import { ref, computed, watch } from 'vue';
import { Button, TabView } from '@cloudron/pankow';
import { getPreviewUrl } from '../utils.js';
import { prettyLongDate, prettyFileSize, prettyDate } from '@cloudron/pankow/utils';
import MainModel from '../models/MainModel.js';

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
});

const emit = defineEmits(['download', 'delete', 'share']);

const visible = ref(localStorage.previewPanelVisible === 'true');
const hasContent = computed(() => props.selectedEntries.length > 0 || Object.keys(props.parentEntry).length !== 0);
const entry = computed(() =>{
  return props.selectedEntries.length ? props.selectedEntries[0] : props.parentEntry;
});
const displayName = computed(() => entry.value.name || entry.value.fileName || '');
const displayPath = computed(() => entry.value.filePath || entry.value.resource?.path || '');
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

const activityItems = ref([]);

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
  case 'shared': {
    const receiver = item.details?.receiverUsername || item.details?.receiverEmail || 'link';
    return `shared with ${receiver}`;
  }
  case 'unshared': {
    const receiver = item.details?.receiverUsername || item.details?.receiverEmail || 'link';
    return `unshared with ${receiver}`;
  }
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

</script>

<template>
  <div class="preview-container" :class="{ 'visible': visible }">
    <div class="toggle-button" @click="onToggle" :title="visible ? 'Hide preview' : 'Show preview'"><i :class="'fa-solid ' + (visible ? 'fa-chevron-right' : 'fa-chevron-left')"></i></div>

    <div v-if="hasContent" class="preview-body">
      <div class="preview-icon-container">
        <div class="preview-icon" v-for="selectedEntry in selectedEntries.slice(0, 15)" :key="selectedEntry.id" :style="{ backgroundImage: selectedEntry && getPreviewUrl(selectedEntry) ? 'url(' + getPreviewUrl(selectedEntry) + ')' : 'none' }"></div>
        <div class="preview-icon" v-show="!selectedEntries.length" :style="{ backgroundImage: parentEntry && getPreviewUrl(parentEntry) ? 'url(' + getPreviewUrl(parentEntry) + ')' : 'none' }"></div>
      </div>

      <TabView :key="tabViewKey" :tabs="{ details: 'Details', activity: 'Activity' }" default-active="details" class="preview-tabs">
        <template #details>
          <div class="detail" v-show="selectedEntries.length <= 1 && displayName">
            <p>Name</p>
            <span class="detail-value">{{ displayName }}</span>
          </div>
          <div class="detail" v-show="selectedEntries.length <= 1 && displayPath">
            <p>Path</p>
            <span class="detail-value detail-path">{{ displayPath }}</span>
          </div>
          <div class="detail" v-show="selectedEntries.length <= 1">
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
            <div class="detail-shared-width" v-for="share in entry.sharedWith" :key="share.id">{{ share.receiverUsername || 'link' }}</div>
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
              <span class="activity-label" v-tooltip.top="prettyLongDate(item.createdAt)">
                <strong class="activity-actor">{{ item.actor }}</strong> {{ formatActivityAction(item) }}
              </span>
              <span class="activity-time">{{ prettyDate(item.createdAt) }}</span>
            </div>
          </template>
        </template>
      </TabView>
    </div>
  </div>
</template>

<style scoped>

.preview-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    width: 0;
    transition: width ease-in 300ms;
}

.preview-container.visible {
    width: min(33%, 350px);
}

.preview-body {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
}

.preview-icon-container {
    display: flex;
    width: 100%;
    height: 250px;
    flex-shrink: 0;
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

.detail-path {
    font-family: var(--font-family-monospace, monospace);
    font-size: 13px;
}

.detail-actions {
  display: flex;
  flex-wrap: wrap;
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
  display: flex;
  flex-direction: column;
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
