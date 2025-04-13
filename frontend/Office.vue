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

<script>

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ? import.meta.env.VITE_API_ORIGIN : location.origin;

import { utils } from 'pankow';

import { parseResourcePath } from './utils.js';
import { createMainModel } from './models/MainModel.js';
import { createDirectoryModel } from './models/DirectoryModel.js';

const mainModel = createMainModel(API_ORIGIN);
const directoryModel = createDirectoryModel(API_ORIGIN);

export default {
  name: 'Office',
  data() {
    return {
      wopiToken: '',
      wopiUrl: ''
    };
  },
  async mounted() {
    const resource = parseResourcePath(window.location.hash.slice(1));
    const entry = await directoryModel.get(resource);
    const handle = await mainModel.getOfficeHandle(entry);

    const wopiSrc = `${window.location.origin}/api/v1/office/wopi/files/${handle.handleId}`;
    this.wopiUrl = `${handle.url}WOPISrc=${wopiSrc}`;
    this.wopiToken = handle.token;

    // https://sdk.collaboraonline.com/docs/postmessage_api.html#
    window.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
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
      this.$refs.wopiForm.submit();
    }, 500);
  },
};

</script>

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
