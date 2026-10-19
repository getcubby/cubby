<script setup>

import { ref, onMounted } from 'vue';
import moment from 'moment';
import MainModel from '../models/MainModel.js';
import { followLink, go } from '../router.js';
import EmptyState from './EmptyState.vue';
import FileResultRow from './FileResultRow.vue';
import PreviewPanel from './PreviewPanel.vue';
import { Button, ButtonGroup, ProgressBar } from '@cloudron/pankow';

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

function onSelect(entry) {
  selectedEntries.value = [entry];
}

function onOpenName(entry) {
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
          <FileResultRow v-for="entry in bucket.entries" :key="entry.id" :entry="entry" :layout="viewMode" :selected="selectedEntries[0]?.id === entry.id" @select="onSelect" @open="onOpenName">
            <div v-if="viewMode === 'list' && entry.parentFolderUrl" class="entry-actions" @mouseup.stop @click.stop>
              <Button icon="fa-solid fa-ellipsis-vertical" plain tool :show-dropdown="false" :menu="entryMenu(entry)" />
            </div>
            <Button v-else-if="entry.parentFolderUrl" small outline :href="entry.parentFolderUrl" @mouseup.stop @click.stop="followLink($event, entry.parentFolderUrl)" class="open-folder">Open folder</Button>
          </FileResultRow>
        </div>
      </div>
    </div>
    </div>
    <PreviewPanel
      v-if="!busy && buckets.length"
      :parent-entry="{}"
      :selected-entries="selectedEntries"
      empty-icon="fa-regular fa-clock"
      empty-message="Select a file to see details"
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

.entry-actions {
  flex-shrink: 0;
}

</style>
