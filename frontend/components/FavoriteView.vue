<script setup>

import { ref, onMounted } from 'vue';
import FavoriteModel from '../models/FavoriteModel.js';
import { API_ORIGIN, getFilesViewHashHref, getResultFolderPath, getResultLocationLabel } from '../utils.js';
import { followLink, go } from '../router.js';
import EmptyState from './EmptyState.vue';
import PreviewPanel from './PreviewPanel.vue';
import { Button, Icon, ProgressBar } from '@cloudron/pankow';
import { prettyFileSize } from '@cloudron/pankow/utils';

const emit = defineEmits(['item-activated']);

const favorites = ref([]);
const selectedEntries = ref([]);
const busy = ref(true);

async function refresh() {
  busy.value = true;

  try {
    favorites.value = await FavoriteModel.list();
  } catch (e) {
    console.error('Failed to list favorites.', e);
  }

  busy.value = false;
}

async function onUnFavorite(entry) {
  await FavoriteModel.remove(entry.favorite.id);
  favorites.value = favorites.value.filter(item => item.favorite?.id !== entry.favorite.id);
  if (selectedEntries.value[0]?.id === entry.id) selectedEntries.value = [];
}

function onSelect(event, entry) {
  if (event.button !== 0) return;
  selectedEntries.value = [entry];
}

function onOpenName(event, entry) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  emit('item-activated', entry);
}

function parentFolderUrl(entry) {
  if (entry.share && entry.filePath === '/') return null;
  return getFilesViewHashHref(entry, getResultFolderPath(entry));
}

function entryMenu(entry) {
  const url = parentFolderUrl(entry);
  if (!url) return [];
  return [{
    label: 'Open folder',
    icon: 'fa-regular fa-folder-open',
    action: () => { go(url); },
  }];
}

function iconError(event, entry) {
  event.target.src = `${API_ORIGIN}/mime-types/application-x-generic.svg`;

  setTimeout(() => {
    if (typeof entry._previewRetries === 'undefined') entry._previewRetries = 0;
    if (entry._previewRetries > 10) return;
    ++entry._previewRetries

    event.target.src = entry.previewUrl;
  }, 1000);
}

onMounted(refresh);

</script>

<template>
  <div class="favorites">
    <div class="favorites-main">
      <ProgressBar v-if="busy" mode="indeterminate" :show-label="false" :slim="true" :show-track="false"/>
      <div class="favorite-body" v-else>
        <div v-if="favorites.length" class="favorite-container">
          <div v-for="entry in favorites" :key="entry.id" class="favorite-item" :class="{ selected: selectedEntries[0]?.id === entry.id }" @mouseup="onSelect($event, entry)">
            <img :src="entry.previewUrl || entry.icon" @error="iconError($event, entry)"/>
            <div class="favorite-text">
              <a class="favorite-name" :href="entry.href" @mouseup.stop @click.stop="onOpenName($event, entry)">{{ entry.fileName }}</a>
              <div class="favorite-path-row">
                <span class="favorite-location">{{ getResultLocationLabel(entry) }}</span>
                <span class="favorite-folder-path">{{ getResultFolderPath(entry) }}</span>
              </div>
            </div>
            <span v-if="typeof entry.size === 'number'" class="favorite-size">{{ prettyFileSize(entry.size) }}</span>
            <Icon icon="fa-solid fa-star" class="star-icon" @mouseup.stop @click.stop.prevent="onUnFavorite(entry)" />
            <div v-if="parentFolderUrl(entry)" class="favorite-actions" @mouseup.stop @click.stop>
              <Button icon="fa-solid fa-ellipsis-vertical" plain tool :show-dropdown="false" :menu="entryMenu(entry)" />
            </div>
          </div>
        </div>
        <EmptyState v-else icon="fa-solid fa-star" title="No favorites" description="Files and folders you mark as favorite will show up here" />
      </div>
    </div>
    <PreviewPanel
      v-if="!busy && favorites.length"
      :parent-entry="{}"
      :selected-entries="selectedEntries"
      :show-download="false"
      :show-delete="false"
      :show-share="false"
    />
  </div>
</template>

<style scoped>

.favorites {
  display: flex;
  flex-direction: row;
  overflow: hidden;
  height: 100%;
  flex-grow: 1;
  min-height: 0;
}

.favorites-main {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-grow: 1;
  min-width: 0;
  min-height: 0;
}

.favorite-body {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  overflow: hidden;
  justify-content: center;
}

.favorite-body:has(.favorite-container) {
  justify-content: flex-start;
}

.favorite-container {
  overflow: auto;
  padding: 20px;
  flex-grow: 1;
}

.favorite-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 6px 10px;
  border-radius: var(--pankow-border-radius);
}

.favorite-item:hover {
  background-color: var(--pankow-color-background-hover);
}

.favorite-item.selected,
.favorite-item.selected:hover {
  background-color: #dbedfb;
}

@media (prefers-color-scheme: dark) {
  .favorite-item.selected,
  .favorite-item.selected:hover {
    background-color: rgba(255, 255, 255, 0.2);
  }
}

.favorite-item > img {
  width: 35px;
  height: 35px;
  object-fit: cover;
  flex-shrink: 0;
}

.favorite-text {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  min-width: 0;
  margin: 0 10px;
}

.favorite-name {
  align-self: flex-start;
  max-width: 100%;
  width: fit-content;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: inherit;
  text-decoration: none;
  cursor: pointer;
}

.favorite-name:hover {
  text-decoration: underline;
}

.favorite-path-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  min-width: 0;
  width: 100%;
}

.favorite-location,
.favorite-folder-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.favorite-location {
  flex-shrink: 0;
  max-width: 45%;
  color: var(--pankow-color-text-secondary);
}

.favorite-folder-path {
  min-width: 0;
}

.favorite-size {
  flex-shrink: 0;
  margin-right: 8px;
  color: var(--pankow-color-text-secondary);
  font-size: 13px;
}

.favorite-actions {
  flex-shrink: 0;
}

.star-icon {
  flex-shrink: 0;
  width: 36px;
  color: #ffcb00;
  padding: 8px;
  cursor: pointer;
}

.star-icon:hover {
  transform: scale(1.5);
  transform-origin: center center;
}

</style>
