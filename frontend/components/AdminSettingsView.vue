<script setup>

import { computed, ref, onMounted, useTemplateRef } from 'vue';
import { SaveIndicator, SettingsItem, SingleSelect } from '@cloudron/pankow';
import Section from './Section.vue';
import MainModel from '../models/MainModel.js';

const denied = ref(false);
const officeSettings = ref(null);
const viewer = ref('');
let savedViewer = '';
const busy = ref(false);
const saveIndicator = useTemplateRef('saveIndicator');

const officeApps = computed(() => {
  return (officeSettings.value?.apps || []).filter((app) => MainModel.OFFICE_MANIFEST_IDS.has(app.manifestId) && app.fqdn);
});

const options = computed(() => {
  return [
    { origin: '', label: 'ArtCraft (built-in)' },
    ...officeApps.value.map((app) => ({ origin: `https://${app.fqdn}`, label: app.label || app.fqdn }))
  ];
});

const showViewer = computed(() => officeSettings.value?.configurable === true && officeApps.value.length > 0);

async function load() {
  try {
    officeSettings.value = await MainModel.getOffice();
    viewer.value = officeSettings.value.origin || '';
    savedViewer = viewer.value;
    denied.value = false;
  } catch (error) {
    officeSettings.value = null;
    denied.value = true;
  }
}

async function onViewerChange(origin) {
  origin = origin || '';
  const previous = savedViewer;
  viewer.value = origin;
  busy.value = true;
  try {
    viewer.value = await MainModel.setOffice(origin);
    savedViewer = viewer.value;
    saveIndicator.value.success();
    await MainModel.getConfig();
  } catch (error) {
    viewer.value = previous;
    saveIndicator.value.error();
    console.error('Failed to save document viewer.', error);
  }
  busy.value = false;
}

onMounted(load);

</script>

<template>
  <div class="settings-container">
    <div class="settings-scroll">
      <div class="settings-content content">
        <h1 class="settings-page-header">Admin settings</h1>

        <Section v-if="denied" title="Access">
          <p class="viewer-description">Only administrators and app operators can open this page.</p>
        </Section>

        <Section v-else-if="showViewer" title="Document viewer">
          <SettingsItem>
            <div>
              <p v-if="!viewer" class="viewer-description">
                Open spreadsheets in <a href="https://github.com/storytold/gridcraft" target="_blank" rel="noopener">GridCraft</a>, documents in <a href="https://github.com/storytold/wordcraft" target="_blank" rel="noopener">WordCraft</a> and presentations in <a href="https://github.com/storytold/deckcraft" target="_blank" rel="noopener">DeckCraft</a>.
              </p>
              <p v-else class="viewer-description">Open office documents with this app.</p>
            </div>
            <SaveIndicator ref="saveIndicator">
              <SingleSelect v-model="viewer" :options="options" option-key="origin" option-label="label" :disabled="busy" @select="onViewerChange" />
            </SaveIndicator>
          </SettingsItem>
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

.viewer-description {
  margin: 0;
}

.viewer-description a {
  color: var(--pankow-color-primary);
  text-decoration: underline;
}

</style>
