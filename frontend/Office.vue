<script setup>

import { ref, onMounted, useTemplateRef } from 'vue';
import { utils } from 'pankow';
import { parseResourcePath } from './utils.js';
import MainModel from './models/MainModel.js';
import DirectoryModel from './models/DirectoryModel.js';

const wopiForm = useTemplateRef('wopiForm');

const wopiToken = ref('');
const wopiUrl = ref('');

onMounted(async () => {
  const resource = parseResourcePath(window.location.hash.slice(1));
  const entry = await DirectoryModel.get(resource);
  const [error, handle] = await MainModel.getOfficeHandle(entry);
  if (error) return console.error(error);

  window.document.title = entry.fileName + ' - Cubby';

  const wopiSrc = `${window.location.origin}/api/v1/office/wopi/files/${handle.handleId}`;
  wopiUrl.value = `${handle.url}WOPISrc=${wopiSrc}`;
  wopiToken.value = handle.token;

  // https://sdk.collaboraonline.com/docs/postmessage_api.html#
  window.addEventListener('message', (event) => {
    try {
      let data = event.data;
      if (!data) return;

      if (typeof data === 'string') data = JSON.parse(data);

      if (data.MessageId === 'App_LoadingStatus') {
        if (data.Values && data.Values.Status === 'Document_Loaded') {

          // Example to remove buttons in the editor UI
          // const msg = {
          //   MessageId: 'Remove_Button',
          //   SendTime: Date.now(),
          //   Values: {
          //     id: 'print'
          //   }
          // };

          // this.$refs.officeViewer.contentWindow.postMessage(JSON.stringify(msg), event.origin);
        }
      } else if (data.MessageId === 'close') {
        // cannot prompt the user here as collabora has already closed the document internally
        window.close();
      }
    } catch (e) {
      console.error('Failed to parse message from WOPI editor', e);
    }
  }, false);

  setTimeout(() => {
    wopiForm.value.submit();
  }, 500);
});

</script>

<template>
  <div class="main">
    <div style="display: none">
      <form :action="wopiUrl" ref="wopiForm" enctype="multipart/form-data" method="post" target="document-viewer">
        <input name="ui_defaults" value="UIMode=compact;SavedUIState=false;TextSidebar=false" type="hidden"/>
        <input name="css_variables" value="--co-primary-element=#0071e3;" type="hidden"/>
        <input name="access_token" :value="wopiToken" type="hidden" id="access-token"/>
        <input type="submit" value="" />
      </form>
    </div>

    <iframe ref="officeViewer" name="document-viewer" class="viewer" allow="clipboard-read *; clipboard-write *"></iframe>
  </div>
</template>

<style scoped>

.main {
  height: 100%;
  height: 100%;
}

.viewer {
  height: 100%;
  width: 100%;
  border: none;
}

</style>
