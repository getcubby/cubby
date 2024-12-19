<template>
  <div class="main">
    <div style="display: none">
      <form :action="wopiUrl" ref="wopiForm" enctype="multipart/form-data" method="post" target="document-viewer">
        <input name="ui_defaults" value="SavedUIState=false;TextSidebar=false" type="hidden"/>
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
    console.log('open ', window.location);

    const resource = parseResourcePath(window.location.hash.slice(1));
    console.log('resource', resource)

    const entry = await directoryModel.get(resource);

    console.log('entry', entry)

    const handle = await mainModel.getOfficeHandle(entry);

    console.log('handle', handle)

    const wopiSrc = `${window.location.origin}/api/v1/office/wopi/files/${handle.handleId}`;
    this.wopiUrl = `${handle.url}WOPISrc=${wopiSrc}`;
    this.wopiToken = handle.token;

    setTimeout(() => {
      this.$refs.wopiForm.submit();
    }, 500);
  }
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
