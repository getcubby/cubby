<script setup>

import { ref, useTemplateRef } from 'vue';
import { Spinner, TextInput, Button } from '@cloudron/pankow';
import MainModel from '../models/MainModel.js';

const searchResultsPanel = useTemplateRef('searchResultsPanel');
const searchBar = useTemplateRef('searchBar');

const searchBusy = ref(false);
const dismissed = ref(false);
const searchQuery = ref('');
const searchResults = ref([]);
const resultsOpen = ref(false);
const open = ref(false);

async function onSearch() {
  if (!searchQuery.value) return;

  searchBusy.value = true;
  const results = await MainModel.search(searchQuery.value);
  searchBusy.value = false;

  if (dismissed.value) return;

  // order by recently modified
  results.sort((a,b) => {
    return new Date(b.entry.mtime).getTime() - new Date(a.entry.mtime).getTime();
  });

  searchResults.value = results;
  resultsOpen.value = true;
}

function onDismiss() {
  open.value = false;
  resultsOpen.value = false;

  searchQuery.value = '';
  searchBusy.value = false;
  dismissed.value = true;

  setTimeout(() => { searchResults.value = []; }, 1000);
}

function onFocus() {
  open.value = true;
  dismissed.value = false;
  searchResultsPanel.value.style.width = searchBar.value.offsetWidth + 'px';
}

// only personal files supported for now
function getEntryHref(entry) {
  return `/#files/home${entry.filePath}`;
}

function getDirectoryHref(entry) {
  const folderPath = entry.isDirectory ? entry.filePath : entry.filePath.slice(0, -entry.fileName.length);
  return `/#files/home${folderPath}`;
}

</script>

<template>
  <div class="search-bar-container" @keydown.esc="onDismiss" tabindex="1">
    <Transition name="pankow-fade">
      <div class="pankow-dialog-backdrop" @click="onDismiss" v-show="open"></div>
    </Transition>
    <div class="search-bar" ref="searchBar" :class="{'open': open,'results-open': resultsOpen}">
      <i class="fa-solid fa-magnifying-glass" v-show="!searchBusy" style="cursor: pointer;" @click="onSearch"></i>
      <Spinner v-show="searchBusy" />
      <TextInput v-model="searchQuery" placeholder="Search ..." @focus="onFocus" @click="onFocus" @keydown.enter="onSearch" :disabled="searchBusy" class="search-input"/>
    </div>
    <Transition name="pankow-roll-down">
      <div v-show="resultsOpen" ref="searchResultsPanel" class="search-result-panel">
        <div v-show="searchResults.length === 0" class="no-search-results">
          Nothing found
        </div>
        <a v-for="result in searchResults" :key="result.filepath" class="search-result-entry" :href="getEntryHref(result.entry)" @click.stop="onDismiss()">
          <img :src="result.entry.previewUrl"/>
          <div style="margin-left: 10px; flex-grow: 1;">
            <div style="margin-bottom: 10px"><b>{{ result.fileName }}</b></div>
            <div style="font-size: 12px">{{ result.entry.filePath.slice(0, -result.fileName.length) }}</div>
          </div>
          <div class="search-result-entry-actions">
            <Button plain :href="getDirectoryHref(result.entry)" @click.stop="onDismiss()">Open Folder</Button>
          </div>
        </a>
      </div>
    </Transition>
  </div>
</template>

<style scoped>

.search-bar-container {
  padding-left: 10px;
  padding-right: 10px;
  display: flex;
  flex-grow: 1;
}

/* do not cover the main sidebar toggle */
@media (max-width: 576px) {
  .search-bar-container {
    padding-left: 40px;
  }
}

.search-bar {
  padding-left: 10px;
  border-radius: var(--pankow-border-radius);
  display: flex;
  align-items: center;
  flex-grow: 1;
  position: relative;
}

.open {
  z-index: 3001;
  background: var(--pankow-dialog-background-color);
}

.search-bar.results-open {
  border-bottom-right-radius: 0;
  border-bottom-left-radius: 0;
}

.search-input {
  border: none;
  background: transparent;
  flex-grow: 1;
}

.search-result-entry {
  display: flex;
  align-items: start;
  cursor: pointer;
  padding: 10px 5px;
  align-items: center;
}

.search-result-entry:hover {
  background-color: var(--pankow-color-background-hover);
}

.search-result-entry > img {
  height: 60px;
  width: 60px;
  object-fit: cover;
}

.search-result-entry-actions {
  visibility: hidden;
  margin-right: 20px;
}

.search-result-entry:hover .search-result-entry-actions {
  visibility: visible;
}

.search-result-panel {
  border-bottom-left-radius: var(--pankow-border-radius);
  border-bottom-right-radius: var(--pankow-border-radius);
  position: absolute;
  background: var(--pankow-dialog-background-color);
  top: 35px;
  z-index: 3000;
  box-shadow: var(--pankow-menu-shadow);
  overflow: scroll;
  max-height: calc(100% - 60px);
}

.no-search-results {
  text-align: center;
  padding-bottom: 20px;
}

</style>
