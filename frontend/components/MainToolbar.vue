<template>
  <Toolbar>
    <template #start>
      <Button icon="fa-solid fa-chevron-left" :disabled="breadCrumbs.length === 0" @click="onUp" outline></Button>

      <Breadcrumb :home="breadCrumbHome" :model="breadCrumbs">
        <template #item="{ label, item, props }">
          <a :href="item.route" :target="item.target" v-bind="props.action">
            <span v-if="item.icon" v-bind="props.icon" />
            <span v-bind="props.label">{{ label }}</span>
          </a>
        </template>
      </Breadcrumb>
    </template>

    <template #end>
      <div class="file-actions">
        <Button v-show="displayName && selectedEntries.length" icon="pi pi-trash" outline danger @click="onDelete(selectedEntries)"/>
        <Button icon="fa-solid fa-download" outline @click="onDownload(selectedEntries || null)"/>
      </div>

      <Button icon="fa-solid fa-arrow-up-from-bracket" @click="onToggleMenuUpload" :disabled="readonly">Upload</Button>
      <Button icon="fa-solid fa-plus" label="New" @click="onToggleMenuNew" :disabled="readonly">New</Button>

      <div class="profile-actions">
        <Button v-show="displayName" icon="fa-regular fa-user" secondary @click="onToggleMenuMain">{{ displayName }}</Button>
        <Button v-show="!displayName" icon="fa-solid fa-arrow-right-to-bracket" secondary @click="onLogin">Login</Button>

        <Menu ref="menuUpload" :model="uploadMenu" :popup="true"/>
        <Menu ref="menuNew" :model="newMenu" :popup="true"/>
        <Menu ref="menuMain" :model="mainMenu" :popup="true"/>
      </div>
    </template>
  </Toolbar>

  <!-- About Dialog -->
  <Dialog header="About Cubby" v-model:visible="aboutDialog.visible" :dismissableMask="true" :closable="true" :style="{width: '450px'}" :modal="true">
    <div>
      Cubby the painless file sharing solution!<br/>
      Developed by <a href="https://cloudron.io" target="_blank">Cloudron</a>.
      <br/>
    </div>
    <template #footer>
      <Button @click="aboutDialog.visible = false">Close</Button>
    </template>
  </Dialog>

  <!-- Office Dialog -->
  <Dialog header="Office Integration" v-model:visible="officeDialog.visible" :dismissableMask="true" :closable="true" :style="{width: '620px'}" :modal="true">
    <div>
      Cubby can open office documents acting as a WOPI host. This is tested with Collabora at the moment.<br/>
      To enable support add the following to the <code>config.json</code> and restart the app:
      <pre>
{
  "collabora": {
    "host": "https://collabora.domain.com"
  }
}
</pre>
    </div>
    <template #footer>
      <Button @click="officeDialog.visible = false">Close</Button>
    </template>
  </Dialog>
</template>

<script>

import Breadcrumb from 'primevue/breadcrumb';
import Dialog from 'primevue/dialog';
import Menu from 'primevue/menu';
import Toolbar from 'primevue/toolbar';

import { Button } from 'pankow';

export default {
    name: 'MainToolbar',
    components: {
      Breadcrumb,
      Button,
      Dialog,
      Menu,
      Toolbar
    },
    emits: [ 'login', 'logout', 'upload-file', 'upload-folder', 'new-file', 'new-folder', 'directory-up' ],
    props: {
      breadCrumbs: {
        type: Array,
        default: () => []
      },
      breadCrumbHome: {
        type: Object,
        default: () => { return { icon: 'pi pi-home' }; }
      },
      displayName: {
        type: String,
        default: ''
      },
      selectedEntries: {
        type: Array,
        default: () => []
      },
      readonly: {
        type: Boolean,
        default: true
      },
      onWebDavSettings: {
        type: Function,
        default: () => {}
      },
      onDownload: {
        type: Function,
        default: () => {}
      },
      onDelete: {
        type: Function,
        default: () => {}
      }
    },
    data() {
      return {
        search: '',
        aboutDialog: {
          visible: false
        },
        officeDialog: {
          visible: false
        },
        breadCrumbModel: {
          home: { icon: 'pi pi-home' },
          items: []
        },
        mainMenu: [{
          label: 'WebDAV',
          icon: 'pi pi-globe',
          command: this.onWebDavSettings
        }, {
          label: 'Office Integration',
          icon: 'pi pi-building',
          command: () => this.officeDialog.visible = true
        }, {
          label: 'About',
          icon: 'pi pi-info-circle',
          command: () => this.aboutDialog.visible = true
        }, {
          separator:true
        }, {
          label: 'Logout',
          icon: 'pi pi-sign-out',
          command: this.onLogout
        }],
        newMenu: [{
          label: 'New File',
          icon: 'pi pi-file',
          command: () => this.onNewFile()
        }, {
          label: 'New Folder',
          icon: 'pi pi-folder',
          command: () => this.onNewFolder()
        }],
        uploadMenu: [{
          label: 'Upload File',
          icon: 'pi pi-file',
          command: () => this.onUploadFile()
        }, {
          label: 'Upload Folder',
          icon: 'pi pi-folder',
          command: () => this.onUploadFolder()
        }]
      };
    },
    methods: {
      onLogin() {
        this.$emit('login');
      },
      onToggleMenuUpload(event) {
        this.$refs.menuUpload.toggle(event);
      },
      onToggleMenuNew(event) {
        this.$refs.menuNew.toggle(event);
      },
      onToggleMenuMain(event) {
        this.$refs.menuMain.toggle(event);
      },
      onLogout() {
        this.$emit('logout');
      },
      onUp() {
        this.$emit('directory-up');
      },
      onUploadFile() {
        this.$emit('upload-file');
      },
      onUploadFolder() {
        this.$emit('upload-folder');
      },
      onNewFile() {
        this.$emit('new-file');
      },
      onNewFolder() {
        this.$emit('new-folder');
      }
    }
};

</script>

<style scoped>

.p-toolbar {
  padding: 0.5rem;
}

.p-toolbar .pankow-button {
  margin: 0 2px;
}

.file-actions {
  margin-right: 50px;
}

.profile-actions {
  margin-left: 50px;
}

pre {
  background-color: lightgray;
  border-radius: 2px;
  padding: 10px;
}

</style>
