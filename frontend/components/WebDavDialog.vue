<script setup>

import { computed, inject, ref, useTemplateRef } from 'vue';
import { ClipboardButton, Dialog, InputGroup, TextInput } from '@cloudron/pankow';
import MainModel from '../models/MainModel.js';

const profile = inject('profile');
const dialog = useTemplateRef('dialog');
const appPasswordsUrl = ref('');

const webdavUrl = computed(() => {
  const username = profile.value?.username;
  if (!username) return '';
  return `${window.location.origin}/webdav/${encodeURIComponent(username)}/`;
});

defineExpose({
  async open() {
    try {
      const config = await MainModel.getConfig();
      appPasswordsUrl.value = config.appPasswordsUrl || '';
    } catch {
      appPasswordsUrl.value = '';
    }
    dialog.value.open();
  }
});

</script>

<template>
  <Dialog
    ref="dialog"
    title="WebDAV"
    reject-label="Close"
    reject-style="secondary"
    :style="{ width: 'min(560px, calc(100% - 20px))', maxWidth: 'min(560px, calc(100% - 20px))' }"
  >
    <p>
      Use this URL in a file manager, tablet, or backup app. Authenticate with your username and an
      <a v-if="appPasswordsUrl" :href="appPasswordsUrl" target="_blank" rel="noopener">App password</a>
      <template v-else>App password</template>
      from the Cloudron dashboard.
    </p>

    <label class="webdav-label" for="webdavUrl">WebDAV URL</label>
    <InputGroup>
      <TextInput id="webdavUrl" readonly :model-value="webdavUrl" style="flex-grow: 1" />
      <ClipboardButton :value="webdavUrl" />
    </InputGroup>

    <label class="webdav-label" for="webdavUsername">Username</label>
    <InputGroup>
      <TextInput id="webdavUsername" readonly :model-value="profile.username" style="flex-grow: 1" />
      <ClipboardButton :value="profile.username" />
    </InputGroup>

    <p class="webdav-hint">
      The root lists <strong>home</strong>, <strong>shares</strong>, and <strong>groupfolders</strong>.
      Append <code>home/</code> to open your files directly.
    </p>
  </Dialog>
</template>

<style scoped>

.webdav-label {
  display: block;
  margin-top: 12px;
  margin-bottom: 4px;
  font-weight: var(--pankow-font-weight-bold);
}

.webdav-hint {
  margin-top: 16px;
  margin-bottom: 0;
  color: var(--pankow-color-text-secondary);
}

</style>
