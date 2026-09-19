<template>
  <MainLayout :gap="false" class="main-layout">
    <template #header>
      <TopBar class="navbar" :gap="false">
        <template #center>
          <div class="file-name">{{ entry ? entry.fileName : '' }}</div>
        </template>
        <template #right>
          <Button v-if="entry && entry.downloadFileUrl" icon="fa-solid fa-download" outline tool @click="onDownload" style="margin-right: 5px;">Download</Button>
          <Button icon="fa-solid fa-xmark" @click="onClose">{{ utils.translation('main.dialog.close') }}</Button>
        </template>
      </TopBar>
    </template>
    <template #body>
      <div class="office-container">
        <div style="display: none">
          <form :action="wopiUrl" ref="wopiForm" enctype="multipart/form-data" method="post" target="document-viewer">
            <input name="ui_defaults" value="UIMode=compact;SavedUIState=false;TextSidebar=false" type="hidden"/>
            <input name="css_variables" value="--co-primary-element=#0071e3;" type="hidden"/>
            <input name="access_token" :value="wopiToken" type="hidden"/>
            <input type="submit" value="" />
          </form>
        </div>

        <iframe ref="officeViewer" name="document-viewer" class="viewer" allow="clipboard-read *; clipboard-write *"></iframe>
      </div>
    </template>
  </MainLayout>
</template>

<script setup>

import { ref, onMounted, onBeforeUnmount, useTemplateRef } from 'vue';
import { Button, MainLayout, TopBar, utils } from '@cloudron/pankow';
import MainModel from '../models/MainModel.js';

const emit = defineEmits(['close']);

const wopiForm = useTemplateRef('wopiForm');
const officeViewer = useTemplateRef('officeViewer');

const entry = ref(null);
const wopiToken = ref('');
const wopiUrl = ref('');

function sendSaveAndClose() {
  const iframe = officeViewer.value;
  if (!iframe || !iframe.contentWindow) return;
  try {
    iframe.contentWindow.postMessage(JSON.stringify({ MessageId: 'UI_Save' }), '*');
    iframe.contentWindow.postMessage(JSON.stringify({ MessageId: 'UI_Close' }), '*');
  } catch (e) {
    console.error('Failed to send postMessage to WOPI editor', e);
  }
}

function onMessage(event) {
  try {
    let data = event.data;
    if (!data) return;

    if (typeof data === 'string') data = JSON.parse(data);

    if (data.MessageId === 'close') {
      // the editor has already closed the document internally
      emit('close');
    }
  } catch (e) {
    console.error('Failed to parse message from WOPI editor', e);
  }
}

async function open(item) {
  if (!item) return;
  entry.value = item;

  const [error, handle] = await MainModel.getOfficeHandle(item);
  if (error) {
    console.error('Failed to get office handle', error);
    emit('close');
    return;
  }

  const wopiSrc = `${window.location.origin}/api/v1/office/wopi/files/${handle.handleId}`;
  wopiUrl.value = `${handle.url}WOPISrc=${wopiSrc}`;
  wopiToken.value = handle.token;

  setTimeout(() => {
    wopiForm.value?.submit();
  }, 3000);
}

function onClose() {
  emit('close');
}

function onDownload() {
  if (entry.value) window.location.href = entry.value.downloadFileUrl;
}

onMounted(() => {
  window.addEventListener('message', onMessage, false);
  window.addEventListener('pagehide', sendSaveAndClose);
});

onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage, false);
  window.removeEventListener('pagehide', sendSaveAndClose);
  sendSaveAndClose();
});

defineExpose({ open });

</script>

<style scoped>

.main-layout {
  background-color: white;
}

.office-container {
  display: flex;
  height: 100%;
  width: 100%;
}

.viewer {
  width: 100%;
  border: none;
}

.file-name {
  margin: 0 0.5rem;
}

</style>
