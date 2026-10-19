<script setup>

import { ref, onMounted } from 'vue';
import FavoriteModel from '../models/FavoriteModel.js';
import { getFilesViewHashHref, getResultFolderPath } from '../utils.js';
import { go } from '../router.js';
import EmptyState from './EmptyState.vue';
import FileResultRow from './FileResultRow.vue';
import PreviewPanel from './PreviewPanel.vue';
import { Button, Icon, ProgressBar } from '@cloudron/pankow';

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

function onSelect(entry) {
  selectedEntries.value = [entry];
}

function onOpenName(entry) {
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

onMounted(refresh);

</script>

<template>
  <div class="favorites">
    <div class="favorites-main">
      <ProgressBar v-if="busy" mode="indeterminate" :show-label="false" :slim="true" :show-track="false"/>
      <div class="favorite-body" v-else>
        <div v-if="favorites.length" class="favorite-container">
          <FileResultRow v-for="entry in favorites" :key="entry.id" :entry="entry" :selected="selectedEntries[0]?.id === entry.id" @select="onSelect" @open="onOpenName">
            <Icon icon="fa-solid fa-star" class="star-icon" @mouseup.stop @click.stop.prevent="onUnFavorite(entry)" />
            <div v-if="parentFolderUrl(entry)" class="favorite-actions" @mouseup.stop @click.stop>
              <Button icon="fa-solid fa-ellipsis-vertical" plain tool :show-dropdown="false" :menu="entryMenu(entry)" />
            </div>
          </FileResultRow>
        </div>
        <EmptyState v-else icon="fa-solid fa-star" title="No favorites" description="Files and folders you mark as favorite will show up here" />
      </div>
    </div>
    <PreviewPanel
      v-if="!busy && favorites.length"
      :parent-entry="{}"
      :selected-entries="selectedEntries"
      empty-icon="fa-solid fa-star"
      empty-message="Select a file to see details"
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
