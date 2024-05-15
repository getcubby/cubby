<template>
  <TopBar :gap="false">
    <template #left>
      <Button icon="fa-solid fa-chevron-left" :disabled="breadCrumbs.length === 0" @click="onUp" plain></Button>
      <Breadcrumb :home="breadCrumbHome" :items="breadCrumbs" />
    </template>

    <template #right>
      <div class="file-actions">
        <Button v-show="displayName && selectedEntries.length" icon="fa-regular fa-trash-can" outline danger @click="onDelete(selectedEntries)"/>
        <Button icon="fa-solid fa-download" outline @click="onDownload(selectedEntries || null)"/>
      </div>

      <Button icon="fa-solid fa-arrow-up-from-bracket" :menu="uploadMenu" :disabled="readonly">Upload</Button>
      <Button icon="fa-solid fa-plus" label="New" :menu="newMenu" :disabled="readonly">New</Button>

      <div class="profile-actions">
        <Button v-show="displayName" icon="fa-regular fa-user" secondary :menu="mainMenu">{{ displayName }}</Button>
        <Button v-show="!displayName" icon="fa-solid fa-arrow-right-to-bracket" secondary @click="onLogin">Login</Button>
      </div>
    </template>
  </TopBar>

  <!-- About Dialog -->
  <Dialog title="About Cubby" ref="aboutDialog" confirmLabel="Close">
    <div>
      Cubby the painless file sharing solution!
      <br/>
      <br/>
      Developed by <a href="https://cloudron.io" target="_blank">Cloudron</a>
      <br/>
    </div>
  </Dialog>

  <!-- Office Dialog -->
  <Dialog title="Office Integration" ref="officeDialog" confirmLabel="Close">
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
  </Dialog>
</template>

<script>

import { Button, Breadcrumb, Dialog, Menu, TopBar } from 'pankow';

export default {
    name: 'MainToolbar',
    components: {
      Breadcrumb,
      Button,
      Dialog,
      Menu,
      TopBar
    },
    emits: [ 'login', 'logout', 'upload-file', 'upload-folder', 'new-file', 'new-folder', 'directory-up' ],
    props: {
      breadCrumbs: {
        type: Array,
        default: () => []
      },
      breadCrumbHome: {
        type: Object,
        default: () => { return { icon: 'fa-solid fa-house' }; }
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
        breadCrumbModel: {
          home: { icon: 'fa-solid fa-house' },
          items: []
        },
        mainMenu: [{
          label: 'WebDAV',
          icon: 'fa-solid fa-globe',
          action: this.onWebDavSettings
        }, {
          label: 'Office Integration',
          icon: 'fa-solid fa-briefcase',
          action: () => this.$refs.officeDialog.open()
        }, {
          label: 'About',
          icon: 'fa-solid fa-circle-info',
          action: () => this.$refs.aboutDialog.open()
        }, {
          separator:true
        }, {
          label: 'Logout',
          icon: 'fa-solid fa-right-from-bracket',
          action: this.onLogout
        }],
        newMenu: [{
          label: 'New File',
          icon: 'fa-solid fa-file-circle-plus',
          action: () => this.onNewFile()
        }, {
          label: 'New Folder',
          icon: 'fa-solid fa-folder-plus',
          action: () => this.onNewFolder()
        }],
        uploadMenu: [{
          label: 'Upload File',
          icon: 'fa-solid fa-file-arrow-up',
          action: () => this.onUploadFile()
        }, {
          label: 'Upload Folder',
          icon: 'fa-regular fa-folder-open',
          action: () => this.onUploadFolder()
        }]
      };
    },
    methods: {
      onLogin() {
        this.$emit('login');
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
