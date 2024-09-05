<template>
  <MainLayout :gap="false" class="main-layout">
    <template #header>
    </template>
    <template #body>
      <div class="main-nav-bar">
        <Button icon="fa-solid fa-download" success @click="onDownload" style="margin-right: 5px;"/>
        <Button icon="fa-solid fa-xmark" @click="onClose">{{ tr('main.dialog.close') }}</Button>
      </div>
      <div style="display: none">
        <form :action="wopiUrl" ref="wopiForm" enctype="multipart/form-data" method="post" target="document-viewer">
          <input name="ui_defaults" value="SavedUIState=false;TextSidebar=false" type="hidden"/>
          <input name="css_variables" value="--co-primary-element=#0071e3;" type="hidden"/>
          <input name="access_token" :value="wopiToken" type="hidden" id="access-token"/>
          <input type="submit" value="" />
        </form>
      </div>

      <iframe ref="officeViewer" name="document-viewer" class="viewer" allow="clipboard-read *; clipboard-write *"></iframe>
    </template>
  </MainLayout>
</template>

<script>

import { MainLayout, TopBar, Button, utils } from 'pankow';

export default {
  name: 'OfficeViewer',
  components: {
    Button,
    MainLayout,
    TopBar
  },
  props: {
    config: {
      type: Object,
      default(rawProps) { return { viewers: { collabora: { extensions: [] }}}; }
    },
    tr: {
      type: Function,
      default(id) { console.warn('Missing tr for OfficeViewer'); return utils.translation(id); }
    }
  },
  emits: [ 'close' ],
  data() {
    return {
      entry: null,
      wopiToken: '',
      wopiUrl: ''
    };
  },
  methods: {
    canHandle(entry) {
      if (!this.config) return false;
      if (!this.config.viewers) return false;
      if (!this.config.viewers.collabora) return false;
      if (!this.config.viewers.collabora.extensions) return false;

      return this.config.viewers.collabora.extensions.find(function (e) { return entry.fileName.endsWith(e); });
    },
    async open(entry) {
      if (!entry || entry.isDirectory || !this.canHandle(entry)) return;

      this.entry = entry;

      const handle = await this.$root.mainModel.getOfficeHandle(entry);

      const wopiSrc = `${window.location.origin}/api/v1/office/wopi/files/${handle.handleId}`;
      this.wopiUrl = `${handle.url}WOPISrc=${wopiSrc}`;
      this.wopiToken = handle.token;

      setTimeout(() => {
        this.$refs.wopiForm.submit();
      }, 500);
    },
    onClose() {
      this.$refs.officeViewer.src = 'about:blank';
      this.$emit('close');
    },
    onDownload() {
      window.location.href = this.entry.downloadFileUrl;
    }
  }
};

</script>

<style scoped>

.viewer {
  height: 100%;
  width: 100%;
  border: none;
  padding: 5px 10px;
}

.main-nav-bar {
  position: absolute;
  width: 100%;
  text-align: right;
}

.main-layout {
  background-color: #d4d4d7;
}

</style>
