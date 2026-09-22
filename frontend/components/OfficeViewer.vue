<template>
  <div class="office-viewer">
    <div style="display: none">
      <form :action="wopiUrl" ref="wopiForm" enctype="multipart/form-data" method="post" target="document-viewer">
        <input name="ui_defaults" value="UIMode=compact;SavedUIState=false;TextSidebar=false" type="hidden"/>
        <input name="css_variables" value="--co-primary-element=#0071e3;" type="hidden"/>
        <input name="access_token" :value="wopiToken" type="hidden"/>
        <input type="submit" value="" />
      </form>
    </div>

    <iframe ref="officeViewer" name="document-viewer" class="viewer" allow="clipboard-read *; clipboard-write *"></iframe>

    <Button class="close-button" icon="fa-solid fa-xmark" secondary tool v-tooltip.left="utils.translation('main.dialog.close')" @click="onClose" />
  </div>
</template>

<script setup>

import { ref, nextTick, onMounted, onBeforeUnmount, useTemplateRef } from 'vue';
import { Button, utils } from '@cloudron/pankow';
import MainModel from '../models/MainModel.js';

const emit = defineEmits(['close']);

const wopiForm = useTemplateRef('wopiForm');
const officeViewer = useTemplateRef('officeViewer');

const wopiToken = ref('');
const wopiUrl = ref('');

let saveAndCloseSent = false;

function sendSaveAndClose() {
  if (saveAndCloseSent) return;

  const iframe = officeViewer.value;
  if (!iframe || !iframe.contentWindow) return;

  saveAndCloseSent = true;
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
  saveAndCloseSent = false;

  const [error, handle] = await MainModel.getOfficeHandle(item);
  if (error) {
    console.error('Failed to get office handle', error);
    emit('close');
    return;
  }

  const wopiSrc = `${window.location.origin}/api/v1/office/wopi/files/${handle.handleId}`;
  wopiUrl.value = `${handle.url}WOPISrc=${wopiSrc}`;
  wopiToken.value = handle.token;

  await nextTick();
  wopiForm.value?.submit();
}

function onClose() {
  sendSaveAndClose();
  emit('close');
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

.office-viewer {
  position: relative;
  width: 100%;
  height: 100%;
  background-color: white;
}

@media (prefers-color-scheme: dark) {
  .office-viewer {
    background-color: black;
  }
}

.viewer {
  display: block;
  width: 100%;
  height: 100%;
  border: none;
}

.close-button {
  position: absolute;
  top: 2px;
  right: 2px;
  z-index: 1;
}

</style>
