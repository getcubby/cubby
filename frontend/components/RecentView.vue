<script setup>

import { ref, onMounted } from 'vue';
import moment from 'moment';
import MainModel from '../models/MainModel.js';
import { API_ORIGIN, getResultFolderPath, getResultLocationLabel } from '../utils.js';
import { followLink, go } from '../router.js';
import EmptyState from './EmptyState.vue';
import PreviewPanel from './PreviewPanel.vue';
import { Button, ButtonGroup, ProgressBar } from '@cloudron/pankow';
import { prettyFileSize } from '@cloudron/pankow/utils';

const emit = defineEmits(['item-activated']);

const buckets = ref([]);
const selectedEntries = ref([]);
const busy = ref(true);
const viewMode = ref(localStorage.viewMode === 'grid' ? 'grid' : 'list');

function setViewMode(mode) {
  viewMode.value = mode;
  localStorage.viewMode = mode;
}

onMounted(async () => {
  const entries = await MainModel.recent();

  // sort into time buckets
  const today = entries.filter(e => moment(e.atime).isSame(new Date(), 'day'));

  const endYesterday = moment().subtract(1,'days').endOf('day');
  const startYesterday = moment().subtract(1,'days').startOf('day');
  const yesterday = entries.filter(e => moment(e.atime).isBetween(startYesterday, endYesterday));

  const endLastWeek = moment().subtract(2,'days').endOf('day');
  const startLastWeek = moment().subtract(7,'days').startOf('day');
  const lastWeek = entries.filter(e => moment(e.atime).isBetween(startLastWeek, endLastWeek));

  const endLastMonth = moment().subtract(8,'days').endOf('day');
  const startLastMonth = moment().subtract(31,'days').startOf('day');
  const lastMonth = entries.filter(e => moment(e.atime).isBetween(startLastMonth, endLastMonth));

  const endOther = moment().subtract(32,'days').endOf('day');
  const older = entries.filter(e => moment(e.atime).isBefore(endOther));

  if (today.length) buckets.value.push({ label: 'Today', entries: today });
  if (yesterday.length) buckets.value.push({ label: 'Yesterday', entries: yesterday });
  if (lastWeek.length) buckets.value.push({ label: 'Last week', entries: lastWeek });
  if (lastMonth.length) buckets.value.push({ label: 'Last month', entries: lastMonth });
  if (older.length) buckets.value.push({ label: 'Older', entries: older });

  busy.value = false;
});

function onSelect(event, entry) {
  if (event.button !== 0) return;
  selectedEntries.value = [entry];
}

function onOpenName(event, entry) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  emit('item-activated', entry);
}

function entryMenu(entry) {
  if (!entry.parentFolderUrl) return [];
  return [{
    label: 'Open folder',
    icon: 'fa-regular fa-folder-open',
    action: () => { go(entry.parentFolderUrl); },
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

</script>

<template>
  <div class="recent">
    <div class="recent-main">
    <div class="recent-toolbar">
      <div class="recent-toolbar-spacer"></div>
      <ButtonGroup>
        <Button icon="fa-solid fa-list" secondary :outline="viewMode !== 'list' ? true : null" tool @click="setViewMode('list')" />
        <Button icon="fa-solid fa-grip" secondary :outline="viewMode !== 'grid' ? true : null" tool @click="setViewMode('grid')" />
      </ButtonGroup>
    </div>
    <ProgressBar v-if="busy" mode="indeterminate" :show-label="false" :slim="true" :show-track="false"/>
    <div class="buckets" v-else>
      <div class="no-recents" v-if="buckets.length === 0">
        <EmptyState icon="fa-regular fa-clock" title="No recent files" description="Files you open will show up here" />
      </div>
      <div class="bucket" v-for="bucket in buckets" :key="bucket.label">
        <h2>{{ bucket.label }}</h2>
        <div class="hr"></div>
        <div :class="viewMode === 'list' ? 'list' : 'grid'">
          <div v-for="entry in bucket.entries" :key="entry.id" class="entry" :class="{ selected: selectedEntries[0]?.id === entry.id }" @mouseup="onSelect($event, entry)">
            <img class="entry-icon" :src="entry.previewUrl" @error="iconError($event, entry)"/>
            <div class="entry-body">
              <a class="entry-name" :href="entry.href" @mouseup.stop @click.stop="onOpenName($event, entry)">{{ entry.fileName }}</a>
              <div v-if="viewMode === 'list'" class="entry-path-row">
                <span class="entry-location">{{ getResultLocationLabel(entry) }}</span>
                <span class="entry-folder-path">{{ getResultFolderPath(entry) }}</span>
              </div>
            </div>
            <span v-if="viewMode === 'list'" class="entry-size">{{ prettyFileSize(entry.size) }}</span>
            <div v-if="viewMode === 'list' && entry.parentFolderUrl" class="entry-actions" @mouseup.stop @click.stop>
              <Button icon="fa-solid fa-ellipsis-vertical" plain tool :show-dropdown="false" :menu="entryMenu(entry)" />
            </div>
            <Button v-else-if="entry.parentFolderUrl" small outline :href="entry.parentFolderUrl" @mouseup.stop @click.stop="followLink($event, entry.parentFolderUrl)" class="open-folder">Open folder</Button>
          </div>
        </div>
      </div>
    </div>
    </div>
    <PreviewPanel
      v-if="!busy && buckets.length"
      :parent-entry="{}"
      :selected-entries="selectedEntries"
      :show-download="false"
      :show-delete="false"
      :show-share="false"
    />
  </div>
</template>

<style scoped>

.recent {
  display: flex;
  flex-direction: row;
  overflow: hidden;
  height: 100%;
  flex-grow: 1;
  min-height: 0;
}

.recent-main {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-grow: 1;
  min-width: 0;
  min-height: 0;
}

.recent-toolbar {
  display: flex;
  align-items: center;
  padding: 8px 20px 0;
  flex-shrink: 0;
}

.recent-toolbar-spacer {
  flex-grow: 1;
}

.no-recents {
  width: 100%;
  padding: 0 20px;
  flex-grow: 1;
  overflow: auto;
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.buckets {
  width: 100%;
  padding: 0 20px;
  flex-grow: 1;
  overflow: auto;
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
}

.bucket {
  width: 100%;
}

.bucket > h2 {
  font-size: 16px;
  font-weight: normal;
}

.hr {
  height: 2px;
  width: 100%;
  margin-bottom: 10px;
  background: linear-gradient(90deg, var(--pankow-color-primary) 0%, rgb(0, 120, 241) 60%, transparent 80%);
}

.grid {
  display: flex;
  width: 100%;
  flex-wrap: wrap;
  gap: 10px;
  position: relative;
}

.entry {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 120px;
  border-radius: var(--pankow-border-radius);
  padding: 10px;
  transition: width 200ms ease-in-out;
}

.entry:hover {
  position: relative;
  background-color: var(--pankow-color-background-hover);
}

.entry-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.grid .entry-body {
  width: 100%;
  align-items: center;
}

.entry.selected,
.entry.selected:hover {
  background-color: #dbedfb;
}

@media (prefers-color-scheme: dark) {
  .entry.selected,
  .entry.selected:hover {
    background-color: rgba(255, 255, 255, 0.2);
  }
}

.entry-name {
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

.entry-name:hover {
  text-decoration: underline;
}

.grid .entry-name {
  align-self: center;
  margin: 10px;
  text-align: center;
}

.entry-icon {
  object-fit: cover;
}

.grid .entry-icon {
  width: 48px;
  height: 48px;
}

.grid .entry:hover .entry-name {
  overflow: visible;
  width: auto;
  margin: 5px;
  padding: 5px;
  border-radius: var(--pankow-border-radius);
  background-color: var(--pankow-color-background-hover);
}

.list .entry {
  flex-direction: row;
  align-items: center;
  width: 100%;
  padding: 6px 10px;
}

.list .entry-icon {
  width: 35px;
  height: 35px;
  flex-shrink: 0;
}

.list .entry-body {
  flex-grow: 1;
  margin: 0 10px;
}

.entry-path-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  min-width: 0;
}

.entry-location {
  flex-shrink: 0;
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--pankow-color-text-secondary);
}

.entry-folder-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entry-size {
  flex-shrink: 0;
  margin-right: 8px;
  color: var(--pankow-color-text-secondary);
  font-size: 13px;
}

.entry-actions {
  flex-shrink: 0;
}

.grid .open-folder {
  visibility: hidden;
}

.grid .entry:hover > .open-folder {
  visibility: visible;
}

</style>
