<script setup>

import { ref, useTemplateRef, inject } from 'vue';
import { prettyDate } from '@cloudron/pankow/utils';
import { copyToClipboard } from '../utils.js';
import {
  Button,
  Dialog,
  Checkbox,
  useNotify
} from '@cloudron/pankow';
import FileDropModel from '../models/FileDropModel.js';

const { notify } = useNotify();

const profile = inject('profile');

const dialog = useTemplateRef('dialog');

const entry = ref({});
const filedrops = ref([]);
const error = ref('');

const filedropLink = ref({
  expires: false,
  expiresDate: '',
});

function defaultExpiresDateStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

function endOfLocalDayMs(ymd) {
  const parts = String(ymd).split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return 0;
  const [y, m, day] = parts;
  return new Date(y, m - 1, day, 23, 59, 59, 999).getTime();
}

async function refresh() {
  try {
    const all = await FileDropModel.list();
    filedrops.value = all.filter((fd) => fd.filePath === entry.value.filePath);
    entry.value.fileDrops = filedrops.value;
    entry.value.isFileDrop = !!filedrops.value.length;
  } catch (e) {
    console.error('Failed to load filedrops', e);
    filedrops.value = [];
  }
}

async function onCreate() {
  let expiresAt = 0;
  if (filedropLink.value.expires) {
    expiresAt = endOfLocalDayMs(filedropLink.value.expiresDate);
    if (!expiresAt) {
      notify('Invalid expiration date', { type: 'error' });
      return;
    }
  }
  const ownerUsername = entry.value.group ? null : entry.value.owner;
  const ownerGroupfolder = entry.value.group ? entry.value.group.id : null;

  const filedropId = await FileDropModel.create({ ownerUsername, ownerGroupfolder, path: entry.value.filePath, expiresAt });

  copyToClipboard(FileDropModel.getLink(filedropId));
  notify('File drop link copied to clipboard');

  await refresh();
}

async function onDelete(filedrop) {
  await FileDropModel.remove(filedrop.id);
  refresh();
}

function copyLink(filedropId) {
  copyToClipboard(FileDropModel.getLink(filedropId));
  notify('File drop link copied to clipboard');
}

defineExpose({
  async open(item) {
    entry.value = item;
    error.value = '';
    filedropLink.value.expires = false;
    filedropLink.value.expiresDate = defaultExpiresDateStr();

    await refresh();

    dialog.value.open();
  }
});

</script>

<template>
  <Dialog
    ref="dialog"
    :title="'File drop for ' + entry.fileName"
    reject-label="Close"
    reject-style="secondary"
  >
    <div>
      <div style="margin-bottom: 10px;">
        <div v-for="filedrop in filedrops" class="filedrop-link" :key="filedrop.id">
          <div>
            <div>Created {{ prettyDate(filedrop.createdAt) }}</div>
            <small style="color: var(--pankow-color-text-secondary)">
              <span v-if="filedrop.expiresAt">Expires {{ prettyDate(filedrop.expiresAt) }}</span>
              <span v-else>Never expires</span>
            </small>
          </div>
          <div style="display: flex; gap: 5px">
            <Button outline tool icon="fa-regular fa-copy" title="Copy to clipboard" @click="copyLink(filedrop.id)"/>
            <Button danger outline tool icon="fa-solid fa-trash" title="Delete" @click="onDelete(filedrop)"/>
          </div>
        </div>
        <div v-show="filedrops.length === 0" class="filedrop-link-empty">
          No file drops yet
        </div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <Checkbox id="expireFileDropAt" label="Expire at" v-model="filedropLink.expires" />
          <input type="date" v-model="filedropLink.expiresDate" :min="new Date().toISOString().split('T')[0]" :disabled="!filedropLink.expires"/>
          <Button icon="fa-solid fa-cloud-arrow-up" success @click="onCreate">Create file drop</Button>
        </div>
      </div>
    </div>
  </Dialog>
</template>

<style scoped>

.filedrop-link, .filedrop-link-empty {
  display: flex;
  justify-content: space-between;
  padding: 6px;
  align-items: center;
}

.filedrop-link:hover {
  background-color: var(--pankow-color-background-hover);
}

</style>
