<script setup>

import { ref, onMounted } from 'vue';
import moment from 'moment';
import MainModel from '../models/MainModel.js';
import SearchBar from './SearchBar.vue';
import { Button, TopBar } from '@cloudron/pankow';

const emit = defineEmits(['item-activated']);

const buckets = ref([]);

onMounted(async () => {
  const entries = await MainModel.recent();

  // sort into time buckets
  const today = entries.filter(e => moment(e.mtime).isSame(new Date(), 'day'));

  const endYesterday = moment().subtract(1,'days').endOf('day');
  const startYesterday = moment().subtract(1,'days').startOf('day');
  const yesterday = entries.filter(e => moment(e.mtime).isBetween(startYesterday, endYesterday));

  const endLastWeek = moment().subtract(2,'days').endOf('day');
  const startLastWeek = moment().subtract(7,'days').startOf('day');
  const lastWeek = entries.filter(e => moment(e.mtime).isBetween(startLastWeek, endLastWeek));

  const endLastMonth = moment().subtract(8,'days').endOf('day');
  const startLastMonth = moment().subtract(31,'days').startOf('day');
  const lastMonth = entries.filter(e => moment(e.mtime).isBetween(startLastMonth, endLastMonth));

  const endOther = moment().subtract(32,'days').endOf('day');
  const older = entries.filter(e => moment(e.mtime).isBefore(endOther));

  if (today.length) buckets.value.push({ label: 'Today', entries: today });
  if (yesterday.length) buckets.value.push({ label: 'Yesterday', entries: yesterday });
  if (lastWeek.length) buckets.value.push({ label: 'Last Week', entries: lastWeek });
  if (lastMonth.length) buckets.value.push({ label: 'Last Month', entries: lastMonth });
  if (older.length) buckets.value.push({ label: 'Older', entries: older });
});

function onActivateItem(entry) {
  emit('item-activated', entry);
}

function iconError(event, entry) {
  event.target.src = `${API_ORIGIN}/mime-types/none.svg`;

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
    <TopBar :gap="false" :left-grow="true">
      <template #left>
        <SearchBar @item-activated="onActivateItem"/>
      </template>
    </TopBar>

    <h1>Recent Files</h1>

    <div class="buckets">
      <div class="bucket" v-for="bucket in buckets" :key="bucket.label">
        <h2>{{ bucket.label }}</h2>
        <div class="hr"></div>
        <div class="grid">
          <div v-for="entry in bucket.entries" :key="entry.id" class="entry" @click="onActivateItem(entry)">
            <img :src="entry.previewUrl" width="48" height="48" style="object-fit: cover;" @error="iconError($event, entry)"/>
            <span>{{ entry.fileName }}</span>
            <Button small outline :href="entry.parentFolderUrl" @click.stop class="open-folder">Open Folder</Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>

.recent {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

h1 {
  font-size: 20px;
  font-weight: normal;
  padding: 0 20px;
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

.buckets {
  padding: 0 20px;
  flex-grow: 1;
  overflow: auto;
  margin-bottom: 20px;
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
  cursor: pointer;
  padding: 10px;
  transition: width 200ms ease-in-out;
}

.entry:hover {
  position: relative;
  background-color: var(--pankow-color-background-hover);
}

.entry > span {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  width: 100%;
  margin: 10px;
  text-align: center;
}

.entry:hover > span {
  overflow: visible;
  width: auto;
  margin: 5px;
  padding: 5px;
  border-radius: var(--pankow-border-radius);
  background-color: var(--pankow-color-background-hover);
}

.open-folder {
  visibility: hidden;
}

.entry:hover > .open-folder {
  visibility: visible;
}

</style>
