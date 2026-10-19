<script setup>

import { ref, useTemplateRef } from 'vue';
import { prettyDate } from '@cloudron/pankow/utils';
import { copyToClipboard } from '../utils.js';
import {
  Button,
  DateTimeInput,
  Dialog,
  FormGroup,
  ListItem,
  PasswordInput,
  useNotify
} from '@cloudron/pankow';
import FileDropModel from '../models/FileDropModel.js';

const { notify } = useNotify();

const dialog = useTemplateRef('dialog');

const entry = ref({});
const filedrops = ref([]);

const filedropLink = ref({
  expiresDate: '',
  password: '',
});

function todayDateStr() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
    filedrops.value = all
      .filter((fd) => fd.filePath === entry.value.filePath)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    entry.value.fileDrops = filedrops.value;
    entry.value.isFileDrop = !!filedrops.value.length;
  } catch (e) {
    console.error('Failed to load filedrops', e);
    filedrops.value = [];
  }
}

async function onCreate() {
  let expiresAt = 0;
  if (filedropLink.value.expiresDate) {
    expiresAt = endOfLocalDayMs(filedropLink.value.expiresDate);
    if (!expiresAt) {
      notify('Invalid expiration date', { type: 'error' });
      return;
    }
  }
  const ownerUserId = entry.value.group ? null : entry.value.owner;
  const ownerGroupfolder = entry.value.group ? entry.value.group.id : null;

  await FileDropModel.create({ ownerUserId, ownerGroupfolder, path: entry.value.filePath, expiresAt, password: filedropLink.value.password || null });

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
    filedropLink.value.expiresDate = '';
    filedropLink.value.password = '';

    await refresh();

    dialog.value.open();
  }
});

</script>

<template>
  <Dialog
    ref="dialog"
    title="File drop"
    reject-label="Close"
    reject-style="secondary"
    :style="{ width: '560px' }"
  >
    <p v-show="entry.fileName">
      Anyone with the link can upload files to "{{ entry.fileName }}". Uploaded files are not visible to others. A file whose name is already taken is renamed.
    </p>
    <form class="filedrop-form" @submit.prevent="onCreate">
      <FormGroup>
        <label for="filedropPassword">Password (optional)</label>
        <PasswordInput id="filedropPassword" v-model="filedropLink.password" />
      </FormGroup>
      <FormGroup>
        <label for="filedropExpires">Expires (optional)</label>
        <DateTimeInput id="filedropExpires" date-only v-model="filedropLink.expiresDate" :min="todayDateStr()" />
      </FormGroup>
      <Button @click="onCreate">Create</Button>
    </form>

    <div v-if="filedrops.length" class="filedrop-existing">
      <div class="filedrop-heading">Existing file drops</div>
      <div class="filedrop-list">
        <ListItem
          v-for="filedrop in filedrops"
          :key="filedrop.id"
          :label="'Created ' + prettyDate(filedrop.createdAt)"
          :actions="[{
            label: 'Copy to clipboard',
            icon: 'fa-regular fa-copy',
            action: () => copyLink(filedrop.id),
            quickAction: true,
          }, {
            label: 'Delete',
            icon: 'fa-solid fa-trash',
            action: () => onDelete(filedrop),
            quickAction: true,
          }]"
        >
          <template v-if="filedrop.passwordProtected || filedrop.expiresAt" #subtext>
            <span v-if="filedrop.passwordProtected"><i class="fa-solid fa-lock"/> Password protected</span>
            <span v-if="filedrop.expiresAt">{{ filedrop.passwordProtected ? ' - ' : '' }}Expires {{ prettyDate(filedrop.expiresAt) }}</span>
          </template>
        </ListItem>
      </div>
    </div>
  </Dialog>
</template>

<style scoped>

.filedrop-existing {
  margin-top: 32px;
}

.filedrop-form :deep(.pankow-form-group:first-child) {
  margin-top: 0;
}

.filedrop-form :deep(.pankow-form-group:first-child label) {
  margin-top: 0;
}

.filedrop-form :deep(.pankow-form-group:last-of-type) {
  margin-bottom: 0;
}

.filedrop-form :deep(.pankow-button) {
  margin-top: 12px;
}

.filedrop-heading {
  margin-bottom: 6px;
  font-weight: var(--pankow-font-weight-bold);
}

.filedrop-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

</style>
