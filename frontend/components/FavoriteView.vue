<script setup>

import { ref, onMounted } from 'vue';
import FavoriteModel from '../models/FavoriteModel.js';
import { getFilesViewHashHref, getResultFolderPath, getResultLocationLabel } from '../utils.js';
import { followLink, go } from '../router.js';
import EmptyState from './EmptyState.vue';
import { Button, Icon, ProgressBar } from '@cloudron/pankow';
import { prettyFileSize } from '@cloudron/pankow/utils';

const favorites = ref([]);
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
    <ProgressBar v-if="busy" mode="indeterminate" :show-label="false" :slim="true" :show-track="false"/>
    <div class="favorite-body" v-else>
      <div v-if="favorites.length" class="favorite-container">
        <div v-for="entry in favorites" :key="entry.id" class="favorite-item">
          <a class="favorite-main" :href="entry.href" @click="followLink($event, entry.href)">
            <img :src="entry.previewUrl || entry.icon" @error="iconError($event, entry)"/>
            <div class="favorite-text">
              <span class="favorite-name">{{ entry.fileName }}</span>
              <div class="favorite-path-row">
                <span class="favorite-location">{{ getResultLocationLabel(entry) }}</span>
                <span class="favorite-folder-path">{{ getResultFolderPath(entry) }}</span>
              </div>
            </div>
            <span v-if="typeof entry.size === 'number'" class="favorite-size">{{ prettyFileSize(entry.size) }}</span>
          </a>
          <Icon icon="fa-solid fa-star" class="star-icon" @click.stop.prevent="onUnFavorite(entry)" />
          <div v-if="parentFolderUrl(entry)" class="favorite-actions" @click.stop>
            <Button icon="fa-solid fa-ellipsis-vertical" plain tool :show-dropdown="false" :menu="entryMenu(entry)" />
          </div>
        </div>
      </div>
      <EmptyState v-else icon="fa-solid fa-star" title="No favorites" description="Files and folders you mark as favorite will show up here" />
    </div>
  </div>
</template>

<style scoped>

.favorites {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 100%;
  flex-grow: 1;
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
  cursor: pointer;
}

.favorite-item:hover {
  background-color: var(--pankow-color-background-hover);
}

.favorite-main {
  display: flex;
  align-items: center;
  flex-grow: 1;
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

.favorite-main > img {
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
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  width: 100%;
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
}

.star-icon:hover {
  transform: scale(1.5);
  transform-origin: center center;
}

</style>
