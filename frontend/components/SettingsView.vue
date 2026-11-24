<script setup>

import { computed, inject, ref, onMounted, useTemplateRef } from 'vue';
import { ClipboardButton, InputGroup, SaveIndicator, SettingsItem, Switch, TextInput } from '@cloudron/pankow';
import GroupFoldersSettings from './settings/GroupFoldersSettings.vue';
import Section from './Section.vue';
import MainModel from '../models/MainModel.js';

const emit = defineEmits(['groupfolders-changed']);

const profile = inject('profile');
const users = ref([]);
const appPasswordsUrl = ref('');
const documentViewer = ref(true);
const documentViewerBusy = ref(false);
const documentViewerSaveIndicator = useTemplateRef('documentViewerSaveIndicator');

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
    documentViewer.value = config.documentViewer !== false;
  } catch (error) {
    console.error('Failed to get config.', error);
    appPasswordsUrl.value = '';
  }
}

async function onDocumentViewerChange(enabled) {
  documentViewerBusy.value = true;
  try {
    documentViewer.value = await MainModel.setDocumentViewer(enabled);
    documentViewerSaveIndicator.value.success();
  } catch (error) {
    documentViewer.value = !enabled;
    documentViewerSaveIndicator.value.error();
    console.error('Failed to save document viewer.', error);
  }
  documentViewerBusy.value = false;
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

        <GroupFoldersSettings :users="users" @groupfolders-changed="emit('groupfolders-changed')" />

        <Section title="Document viewer">
          <SettingsItem>
            <div class="document-viewer-label">
              Open spreadsheets in <a href="https://github.com/storytold/gridcraft" target="_blank" rel="noopener">GridCraft</a>, documents in <a href="https://github.com/storytold/wordcraft" target="_blank" rel="noopener">WordCraft</a> and presentations in <a href="https://github.com/storytold/deckcraft" target="_blank" rel="noopener">DeckCraft</a>.
            </div>
            <SaveIndicator ref="documentViewerSaveIndicator">
              <Switch :model-value="documentViewer" :disabled="documentViewerBusy" @update:model-value="onDocumentViewerChange" />
            </SaveIndicator>
          </SettingsItem>
        </Section>

        <Section title="WebDAV">
          <p class="webdav-intro">
            Use this URL in a file manager, tablet, or backup app. Authenticate with your username and an
            <a v-if="appPasswordsUrl" :href="appPasswordsUrl" target="_blank" rel="noopener">App token</a>
            <template v-else>App token</template>
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
        </Section>
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

.webdav-intro {
  margin: 0;
}

.webdav-intro a {
  color: var(--pankow-color-primary);
  text-decoration: underline;
}

.document-viewer-label a {
  color: var(--pankow-color-primary);
  text-decoration: underline;
}

.webdav-label {
  display: block;
  margin-top: 12px;
  margin-bottom: 4px;
  font-weight: var(--pankow-font-weight-bold);
}

</style>
