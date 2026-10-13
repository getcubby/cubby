<script setup>

import { computed, inject, ref, onMounted } from 'vue';
import { ClipboardButton, InputGroup, TextInput } from '@cloudron/pankow';
import GroupFoldersSettings from './settings/GroupFoldersSettings.vue';
import Section from './Section.vue';
import MainModel from '../models/MainModel.js';

const emit = defineEmits(['groupfolders-changed']);

const profile = inject('profile');
const users = ref([]);
const appPasswordsUrl = ref('');

const webdavUrl = computed(() => {
  const username = profile.value?.username;
  if (!username) return '';
  return `${window.location.origin}/webdav/${encodeURIComponent(username)}/`;
});

async function loadUsers() {
  try {
    users.value = await MainModel.getUsers();
  } catch (error) {
    console.error('Failed to list users.', error);
  }
}

async function loadConfig() {
  try {
    const config = await MainModel.getConfig();
    appPasswordsUrl.value = config.appPasswordsUrl || '';
  } catch (error) {
    console.error('Failed to get config.', error);
    appPasswordsUrl.value = '';
  }
}

onMounted(() => {
  loadUsers();
  loadConfig();
});

</script>

<template>
  <div class="settings-container">
    <div class="settings-scroll">
      <div class="settings-content content">
        <h1 class="settings-page-header">Settings</h1>

        <Section title="WebDAV">
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
        </Section>

        <GroupFoldersSettings :users="users" @groupfolders-changed="emit('groupfolders-changed')" />
      </div>
    </div>
  </div>
</template>

<style scoped>

.settings-container {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 100%;
  flex-grow: 1;
  min-height: 0;
}

.settings-scroll {
  overflow: auto;
  flex-grow: 1;
}

.settings-content.content {
  max-width: 900px;
  width: 100%;
  margin: 0 auto;
  padding: 0 15px 30px;
  box-sizing: border-box;
}

.settings-page-header {
  margin-top: 18px;
  margin-bottom: 18px;
  font-size: 20px;
  font-weight: var(--pankow-font-weight-bold);
}

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
