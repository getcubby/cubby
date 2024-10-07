<template>
  <!-- This is re-used and thus global -->
  <InputDialog ref="inputDialog" />
  <Notification/>

  <div v-show="ready" style="height: 100%;">
    <LoginView v-show="view === VIEWS.LOGIN"/>

    <div class="container" v-show="view === VIEWS.USERS || view === VIEWS.SETTINGS || view === VIEWS.MAIN">
      <SideBar class="side-bar" ref="sideBar">
        <h1 style="margin-bottom: 50px; text-align: center;"><img src="/logo-transparent.svg" height="60" width="60"/><br/>Cubby</h1>

        <a class="side-bar-entry" v-show="profile.username" :class="{'active': activeResourceType === 'home'}" href="#files/home/" @click="onCloseSidebar"><i class="fa-solid fa-house"></i> My Files</a>
        <a class="side-bar-entry" v-show="profile.username" :class="{'active': activeResourceType === 'recent'}" href="#files/recent/" @click="onCloseSidebar"><i class="fa-regular fa-clock"></i> Recent Files</a>
        <a class="side-bar-entry" v-show="profile.username" :class="{'active': activeResourceType === 'shares'}" href="#files/shares/" @click="onCloseSidebar"><i class="fa-solid fa-share-nodes"></i> Shared With You</a>
        <a class="side-bar-entry" v-show="profile.username" :class="{'active': activeResourceType === 'groupfolders'}" href="#files/groupfolders/" @click="onCloseSidebar"><i class="fa-solid fa-user-group"></i> Group Folders</a>

        <div style="flex-grow: 1">&nbsp;</div>

        <Menu ref="mainMenuElement" :model="mainMenu"></Menu>
        <div class="side-bar-entry side-bar-entry-button" id="profileMenuDropdown" v-show="profile.username" @click="onMainMenu($event)" style="text-align: center; padding-left: 10px;">{{ profile.displayName }}</div>
      </SideBar>
      <div class="content">
        <TopBar :gap="false" :left-grow="true">
          <template #left>
            <template v-if="view === VIEWS.USERS">
              <span style="font-size: 24px;">Users</span>
            </template>
            <template v-if="view === VIEWS.SETTINGS">
              <span style="font-size: 24px;">Settings</span>
            </template>
            <template v-if="view === VIEWS.MAIN">
              <SearchBar @item-activated="onOpen"/>
            </template>
          </template>

          <template #right>
            <template v-if="view === VIEWS.MAIN">
              <div class="file-actions">
                <Button v-show="!isReadonly() && selectedEntries.length" icon="fa-regular fa-trash-can" outline danger tool @click="deleteHandler(selectedEntries)"/>
                <Button icon="fa-solid fa-download" outline tool @click="downloadHandler(selectedEntries || null)"/>
              </div>

              <Button icon="fa-solid fa-arrow-up-from-bracket" :menu="uploadMenu" :disabled="isReadonly()" tool><span class="pankow-no-mobile">Upload</span></Button>
              <Button icon="fa-solid fa-plus" label="New" :menu="newMenu" :disabled="isReadonly()" tool><span class="pankow-no-mobile">New</span></Button>
            </template>

            <Button v-show="!profile.username" class="profile-dropdown" icon="fa-solid fa-arrow-right-to-bracket" secondary @click="onLogin">Login</Button>
          </template>
        </TopBar>

        <UsersView v-show="view === VIEWS.USERS" ref="usersView" :profile="profile" />
        <SettingsView v-show="view === VIEWS.SETTINGS" ref="settingsView" :profile="profile" />

        <div class="container" style="overflow: hidden;" v-show="view === VIEWS.MAIN">
          <div class="main-container-content">
            <div class="side-bar-toggle" @click="onTogglePreviewPanel" :title="previewPanelVisible ? 'Hide Preview' : 'Show Preview'"><i :class="'fa-solid ' + (previewPanelVisible ? 'fa-chevron-right' : 'fa-chevron-left')"></i></div>
            <div class="breadcrumb-bar">
              <Button icon="fa-solid fa-chevron-left" :disabled="breadCrumbs.length === 0" @click="onUp" plain tool></Button>
              <Breadcrumb :home="breadCrumbHome" :items="breadCrumbs" />
            </div>
            <div style="overflow: hidden; height: calc(100% - 46px);">
              <DirectoryView
                :show-owner="false"
                :show-extract="false"
                :show-size="true"
                :show-modified="true"
                :show-share="'isSharedWith'"
                :editable="!isReadonly()"
                :multi-download="true"
                @selection-changed="onSelectionChanged"
                @item-activated="onOpen"
                :delete-handler="deleteHandler"
                :share-handler="shareHandler"
                :rename-handler="renameHandler"
                :paste-handler="pasteHandler"
                :download-handler="downloadHandler"
                :new-file-handler="onNewFile"
                :new-folder-handler="onNewFolder"
                :upload-file-handler="onUploadFile"
                :upload-folder-handler="onUploadFolder"
                :drop-handler="onDrop"
                :items="entries"
                :fallback-icon="`${BASE_URL}mime-types/none.svg`"
              >
                <template #empty>
                  <div v-show="!entries.length" class="no-entries-placeholder">
                    <p v-show="activeResourceType === 'home' || (activeResourceType === 'shares' && breadCrumbs.length) || (activeResourceType === 'groupfolders' && breadCrumbs.length)">Folder is empty</p>
                    <p v-show="activeResourceType === 'recent'">No recent files</p>
                    <p v-show="activeResourceType === 'groupfolders' && !breadCrumbs.length">Not part of any group folder yet</p>
                    <p v-show="activeResourceType === 'shares' && !breadCrumbs.length">Nothing shared with you yet</p>
                  </div>
                </template>
              </DirectoryView>
            </div>
          </div>
          <PreviewPanel :parent-entry="entry" :selected-entries="selectedEntries" :visible="previewPanelVisible"/>
        </div>

        <FileUploader
          ref="fileUploader"
          :upload-handler="uploadHandler"
          :job-pre-flight-check-handler="uploadJobPreFlightCheckHandler"
          @finished="onUploadFinished"
        />
      </div>
    </div>
  </div>

  <!-- About Dialog -->
  <Dialog title="About Cubby" ref="aboutDialog" reject-label="Close">
    <div>
      Cubby the painless file sharing solution!
      <br/>
      <br/>
      Developed by <a href="https://cloudron.io" target="_blank">Cloudron</a>
      <br/>
    </div>
  </Dialog>

  <!-- WebDAV Password Dialog -->
  <Dialog title="WebDAV Password" ref="webDavPasswordDialog" reject-label="Cancel" confirm-label="Save" confirm-style="success" @confirm="onWebDavSettingsSubmit">
    <p>Files can be used over WebDAV at <i>{{ API_ORIGIN }}/webdav/{{ profile.username }}/</i></p>
    <p>Set a WebDAV password (will overwrite old one):</p>
    <form @submit="onWebDavSettingsSubmit" @submit.prevent>
      <PasswordInput v-model="webDavPasswordDialog.password" autofocus required :class="{ 'has-error': webDavPasswordDialog.error }" style="width: 100%"/>
      <small class="has-error" v-show="webDavPasswordDialog.error">{{ webDavPasswordDialog.error }}</small>
    </form>
  </Dialog>

  <!-- Share Dialog -->
  <Dialog :title="'Sharing ' + shareDialog.entry.fileName" ref="shareDialog" reject-label="Close">
    <div>
      <TabView :tabs="{ user: 'with a User', link: 'via Link' }" default-active="user">
        <template #user>
          <div style="margin-bottom: 10px;">
            <div v-for="link in shareDialog.sharedWith" class="shared-link" :key="link.id">
              <div><b>{{ link.receiverUsername || link.receiverEmail }}</b></div>
              <Button small danger outline tool icon="fa-solid fa-trash" title="Delete" @click="onDeleteShare(link)"/>
            </div>
            <div v-show="shareDialog.sharedWith.length === 0" class="shared-link-empty">
              Not shared with anyone yet
            </div>
          </div>

          <form @submit="onCreateShare" @submit.prevent>
            <!-- TODO optionDisabled="alreadyUsed"  -->
            <small v-show="shareDialog.error">{{ shareDialog.error }}</small>
            <Dropdown v-model="shareDialog.receiverUsername" :options="shareDialog.users" option-key="username" option-label="userAndDisplayName" placeholder="Select a user"/>
            <Button icon="fa-solid fa-check" success @click="onCreateShare" :disabled="!shareDialog.receiverUsername">Create share</Button>
          </form>
        </template>
        <template #link>
          <div style="margin-bottom: 10px;">
            <div v-for="link in shareDialog.sharedLinks" class="shared-link" :key="link.id">
              <div>Created {{ prettyDate(link.createdAt) }}</div>
              <Button small outline tool @click="copyShareIdLinkToClipboard(link.id)">Copy Link to Clipboard</Button>
              <Button small danger outline tool icon="fa-solid fa-trash" title="Delete" @click="onDeleteShare(link)"/>
            </div>
            <div v-show="shareDialog.sharedLinks.length === 0" class="shared-link-empty">
              No shared links yet
            </div>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <Checkbox id="expireShareLinkAt" label="Expire At" v-model="shareDialog.shareLink.expire" />
            <input type="date" v-model="shareDialog.shareLink.expiresAt" :min="new Date().toISOString().split('T')[0]" :disabled="!shareDialog.shareLink.expire"/>
            <Button icon="fa-solid fa-link" success @click="onCreateShareLink">Create and Copy Link</Button>
          </div>
        </template>
      </TabView>
    </div>
  </Dialog>

  <Transition name="pankow-fade">
    <div class="viewer-container" v-show="viewer === 'image'">
      <ImageViewer ref="imageViewer" @close="onViewerClose" :navigation-handler="onViewerEntryChanged" :download-handler="downloadHandler" />
    </div>
  </Transition>
  <Transition name="pankow-fade">
    <div class="viewer-container" v-show="viewer === 'text'">
      <TextViewer ref="textViewer" @close="onViewerClose" :save-handler="onFileSaved" />
    </div>
  </Transition>
  <Transition name="pankow-fade">
    <div class="viewer-container" v-show="viewer === 'pdf'">
      <PdfViewer ref="pdfViewer" @close="onViewerClose" />
    </div>
  </Transition>
  <Transition name="pankow-fade">
    <div class="viewer-container" v-show="viewer === 'office'">
      <OfficeViewer ref="officeViewer" :config="config" @close="onViewerClose" />
    </div>
  </Transition>
  <Transition name="pankow-fade">
    <div class="viewer-container" v-show="viewer === 'markdown'">
      <MarkdownViewer ref="markdownViewer" @close="onViewerClose" :profile="profile" :save-handler="onFileSaved" />
    </div>
  </Transition>
  <Transition name="pankow-fade">
    <div class="viewer-container" v-show="viewer === 'generic'">
      <GenericViewer ref="genericViewer" @close="onViewerClose" />
    </div>
  </Transition>
</template>

<script>

'use strict';

import { parseResourcePath, getExtension, copyToClipboard, sanitize } from './utils.js';
import { prettyFileSize, prettyDate, prettyLongDate } from 'pankow/utils';

import {
  Breadcrumb,
  Button,
  Checkbox,
  Dialog,
  DirectoryView,
  Dropdown,
  FileUploader,
  InputDialog,
  Menu,
  Notification,
  PasswordInput,
  SideBar,
  Spinner,
  TabView,
  TextInput,
  TopBar
} from 'pankow';

import {
  GenericViewer,
  ImageViewer,
  PdfViewer,
  TextViewer
} from 'pankow-viewers';

import { createDirectoryModel, DirectoryModelError } from './models/DirectoryModel.js';
import { createMainModel } from './models/MainModel.js';
import { createShareModel } from './models/ShareModel.js';

import LoginView from './components/LoginView.vue';
import UsersView from './components/UsersView.vue';
import SettingsView from './components/SettingsView.vue';
import PreviewPanel from './components/PreviewPanel.vue';
import OfficeViewer from './components/OfficeViewer.vue';
import MarkdownViewer from './components/MarkdownViewer.vue';
import SearchBar from './components/SearchBar.vue';

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ? import.meta.env.VITE_API_ORIGIN : location.origin;
const BASE_URL = import.meta.env.BASE_URL || '/';

const VIEWS = {
  LOGIN: 'login',
  MAIN: 'main',
  USERS: 'users',
  SETTINGS: 'settings'
};

const beforeUnloadListener = (event) => {
  event.preventDefault();
  return window.confirm('File operation still in progress. Really close?');
};

export default {
    name: 'IndexView',
    components: {
      Breadcrumb,
      Button,
      Checkbox,
      Dialog,
      DirectoryView,
      Dropdown,
      FileUploader,
      GenericViewer,
      SettingsView,
      ImageViewer,
      InputDialog,
      LoginView,
      Menu,
      Notification,
      MarkdownViewer,
      OfficeViewer,
      PasswordInput,
      PdfViewer,
      PreviewPanel,
      SearchBar,
      SideBar,
      Spinner,
      UsersView,
      TabView,
      TextViewer,
      TextInput,
      TopBar
    },
    data() {
      return {
        VIEWS,
        API_ORIGIN,
        BASE_URL,
        ready: false,
        busy: true,
        showLogin: false,
        mainModel: null,
        shareModel: null,
        directoryModel: null,
        view: '',
        search: '',
        viewer: '',
        activeResourceType: '',
        profile: {},
        config: {},
        viewers: [],
        currentHash: '',
        error: '',
        entry: {},
        entries: [],
        selectedEntries: [],
        currentPath: '/',
        currentResourcePath: '',
        currentShare: null,
        previewPanelVisible: localStorage.previewPanelVisible === 'true',
        breadCrumbs: [],
        breadCrumbHome: {
          icon: 'fa-solid fa-house',
          route: '#files'
        },
        webDavPasswordDialog: {
          error: '',
          password: ''
        },
        shareDialog: {
          visible: false,
          error: '',
          receiverUsername: '',
          readonly: false,
          users: [],
          sharedWith: [],
          sharedLinks: [],
          entry: {},
          shareLink: {
            expire: false,
            expiresAt: 0
          }
        },
        mainMenu: [{
          label: 'Users',
          icon: 'fa-solid fa-users',
          visible: () => this.profile.admin,
          action: () => window.location.href = '#users'
        }, {
          label: 'Settings',
          icon: 'fa-solid fa-cog',
          visible: () => this.profile.admin,
          action: () => window.location.href = '#settings'
        }, {
          label: 'WebDAV',
          icon: 'fa-solid fa-globe',
          action: this.onWebDavSettings
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
    async mounted() {
      const that = this;

      async function handleHash(hash) {
        // we handle decoded paths internally
        hash = decodeURIComponent(hash);

        if (hash.indexOf('files/home/') === 0) {
          if (await that.loadPath(hash.slice('files'.length))) that.view = VIEWS.MAIN;
        } else if (hash.indexOf('files/recent/') === 0) {
          if (await that.loadPath(hash.slice('files'.length))) that.view = VIEWS.MAIN;
        } else if (hash.indexOf('files/shares/') === 0) {
          that.loadPath(hash.slice('files'.length));
          that.view = VIEWS.MAIN;
        } else if (hash.indexOf('files/groupfolders/') === 0) {
          that.loadPath(hash.slice('files'.length));
          that.view = VIEWS.MAIN;
        } else if (hash.indexOf('users') === 0) {
          if (! await that.$refs.usersView.open()) return window.location.hash = 'files/home/';
          that.view = VIEWS.USERS;
        } else if (hash.indexOf('settings') === 0) {
          if (! await that.$refs.settingsView.open()) return window.location.hash = 'files/home/';
          that.view = VIEWS.SETTINGS;
        } else {
          window.location.hash = 'files/home/';
        }
      }

      this.mainModel = createMainModel(API_ORIGIN);
      this.shareModel = createShareModel(API_ORIGIN);
      this.directoryModel = createDirectoryModel(API_ORIGIN);

      try {
        this.profile = await this.mainModel.getProfile();
      } catch (e) {
        return console.error('mounted: getProfile() error', e);
      }

      if (this.profile) await this.refreshConfig();
      else this.profile = {};

      // initial load with hash if any
      const hash = localStorage.returnTo || window.location.hash.slice(1);
      localStorage.returnTo = '';

      await handleHash(hash);

      window.addEventListener('hashchange', () => {
        // allows us to not reload but only change the hash
        if (this.currentHash === decodeURIComponent(window.location.hash)) return;
        this.currentHash = window.location.hash;

        handleHash(window.location.hash.slice(1));
      }, false);

      this.ready = true;
    },
    methods: {
      prettyFileSize,
      prettyDate,
      prettyLongDate,
      onMainMenu(event, elem) {
        this.$refs.mainMenuElement.open(event, event.target);
      },
      showAllFiles() {
        window.location.hash = 'files/home/';
      },
      async uploadJobPreFlightCheckHandler(job) {
        // abort if target folder already exists
        if (job.folder && await this.directoryModel.exists(parseResourcePath(job.targetFolder), job.folder)) {
          window.pankow.notify({ text: `Cannot upload. Folder ${job.folder} already exists.`, type: 'danger', timeout: 5000 });
          return false;
        }

        return true;
      },
      async uploadHandler(targetDir, file, progressHandler) {
        const resource = parseResourcePath(targetDir);

        await this.directoryModel.upload(resource, file, progressHandler);

        this.refresh();
      },
      onCloseSidebar() {
        this.$refs.sideBar.close();
      },
      async onLogin() {
        this.view = VIEWS.LOGIN;
      },
      async onLogout() {
        await this.mainModel.logout();
        window.location.href = '/';
      },
      onInvalidSession() {
        // stash for use later after re-login
        localStorage.returnTo = window.location.hash.slice(1);

        this.profile.username = '';
        this.profile.email = '';
        this.profile.displayName = '';

        this.onLogin();
      },
      onViewerEntryChanged(entry) {
        // prevent to reload image
        this.currentHash = `#files${entry.resourcePath}`
        window.location.hash = `files${entry.resourcePath}`;
      },
      onUploadFinished() {
        this.refresh();
      },
      onUploadFile() {
        const resource = parseResourcePath(this.currentResourcePath || 'files/');
        this.$refs.fileUploader.onUploadFile(resource.resourcePath);
      },
      onUploadFolder() {
        const resource = parseResourcePath(this.currentResourcePath || 'files/');
        this.$refs.fileUploader.onUploadFolder(resource.resourcePath);
      },
      async onNewFile() {
        const newFileName = await this.$refs.inputDialog.prompt({
          message: 'New Filename',
          value: '',
          confirmStyle: 'success',
          confirmLabel: 'Save',
          rejectLabel: 'Close'
        });

        if (!newFileName) return;

        const resource = parseResourcePath(this.currentResourcePath || 'files/');

        try {
          await this.directoryModel.newFile(resource, newFileName);
        } catch (error) {
          if (error.reason === DirectoryModelError.NO_AUTH) this.onInvalidSession();
          else if (error.reason === DirectoryModelError.NOT_ALLOWED) console.error('File name not allowed');
          else if (error.reason === DirectoryModelError.CONFLICT) console.error('File already exists');
          else console.error('Failed to add file, unknown error:', error)
          return;
        }

        this.refresh();
      },
      async onNewFolder() {
        const newFolderName = await this.$refs.inputDialog.prompt({
          message: 'New Foldername',
          value: '',
          confirmStyle: 'success',
          confirmLabel: 'Save',
          rejectLabel: 'Close'
        });

        if (!newFolderName) return;

        const resource = parseResourcePath(this.currentResourcePath || 'files/');

        try {
          await this.directoryModel.newFolder(resource, newFolderName);
        } catch (error) {
          if (error.reason === DirectoryModelError.NO_AUTH) this.onInvalidSession();
          else if (error.reason === DirectoryModelError.NOT_ALLOWED) console.error('Folder name not allowed');
          else if (error.reason === DirectoryModelError.CONFLICT) console.error('Folder already exists');
          else console.error('Failed to add folder, unknown error:', error)
          return;
        }

        this.refresh();
      },
      async pasteHandler(action, files, target) {
        if (!files || !files.length) return;

        window.addEventListener('beforeunload', beforeUnloadListener, { capture: true });
        this.pasteInProgress = true;

        const resource = parseResourcePath((target && target.isDirectory) ? sanitize(this.currentResourcePath + '/' + target.fileName) : this.currentResourcePath);
        await this.directoryModel.paste(resource, action, files);
        await this.refresh();

        window.removeEventListener('beforeunload', beforeUnloadListener, { capture: true });
        this.pasteInProgress = false;
      },
      async onWebDavSettings() {
        this.webDavPasswordDialog.error = '';
        this.webDavPasswordDialog.password = '';
        this.$refs.webDavPasswordDialog.open();
      },
      async onWebDavSettingsSubmit() {
        try {
          await this.mainModel.setWebDavPassword(this.webDavPasswordDialog.password);
        } catch (error) {
          if (error.reason === DirectoryModelError.NO_AUTH) this.onInvalidSession();
          else {
            this.webDavPasswordDialog.error = 'Unkown error, check logs';
            console.error('Failed to set webdav password:', error)
          }

          return;
        }

        this.$refs.webDavPasswordDialog.close();
      },
      async refreshConfig() {
        try {
          this.config = await this.mainModel.getConfig();
        } catch (e) {
          if (e.cause && e.cause.status !== 401) return console.error('Failed to get config.', e);
        }
      },
      clearSelection() {
        this.selectedEntries = [];
      },
      onSelectionChanged(selectedEntries) {
        this.selectedEntries = selectedEntries;
      },
      onTogglePreviewPanel() {
        this.previewPanelVisible = !this.previewPanelVisible;
        localStorage.previewPanelVisible = this.previewPanelVisible;
      },
      async onFileSaved(entry, content, done) {
        try {
          await this.directoryModel.saveFile(entry.resource, content);
        } catch (error) {
          console.error(`Failed to save file ${entry.resourcePath}`, error);
        }

        if (typeof done === 'function') done();
      },
      // if entries is provided download those, otherwise selected entries, otherwise all entries
      async downloadHandler(entries) {
        // in case we got a single entry
        if (entries && !Array.isArray(entries)) entries = [ entries ];
        if (!entries) entries = this.selectedEntries;
        if (entries.length === 0) entries = this.entries;

        const resource = parseResourcePath(this.currentResourcePath);
        await this.directoryModel.download(resource, entries);
      },
      // either dataTransfer (external drop) or files (internal drag)
      async onDrop(targetFolder, dataTransfer, files) {
        const fullTargetFolder = sanitize(`${this.currentResourcePath}/${targetFolder}`);

        if (dataTransfer) {
          async function getFile(entry) {
            return new Promise((resolve, reject) => {
              entry.file(resolve, reject);
            });
          }

          const fileList = [];
          async function traverseFileTree(item, path) {
            return new Promise(async (resolve, reject) => {
              if (item.isFile) {
                fileList.push(await getFile(item));
                resolve();
              } else if (item.isDirectory) {
                // Get folder contents
                const dirReader = item.createReader();
                const entries = await new Promise((resolve, reject) => { dirReader.readEntries(resolve, reject); });

                for (let i in entries) {
                  await traverseFileTree(entries[i], item.name);
                }

                resolve();
              } else {
                console.log('Skipping uknown file type', item);
                resolve();
              }
            });
          }

          for (const item of dataTransfer.items) {
            const entry = item.webkitGetAsEntry();
            if (!entry) {
              console.warn('Dropped item not supported.', item, item.getAsString((s) => console.log(s)));
              continue;
            }

            if (entry.isFile) {
              fileList.push(await getFile(entry));
            } else if (entry.isDirectory) {
              await traverseFileTree(entry, sanitize(`${this.currentResourcePath}/${targetFolder}`));
            }
          }
          this.$refs.fileUploader.addFiles(fileList, sanitize(`${this.currentResourcePath}/${targetFolder}`));
        } else {
          if (!files.length) return;

          window.addEventListener('beforeunload', beforeUnloadListener, { capture: true });

          // check ctrl for cut/copy
          await this.directoryModel.paste(parseResourcePath(fullTargetFolder), 'cut', files);
          await this.refresh();

          window.removeEventListener('beforeunload', beforeUnloadListener, { capture: true });
        }
      },
      async deleteHandler(entries) {
        if (!entries) return;

        function start_and_end(str) {
          if (str.length > 100) {
            return str.substr(0, 45) + ' ... ' + str.substr(str.length-45, str.length);
          }
          return str;
        }

        const confirmed = await this.$refs.inputDialog.confirm({
          message: `Really delete ${entries.length} item${ entries.length === 1 ? '' : 's' }?`,
          confirmStyle: 'danger',
          confirmLabel: 'Yes',
          rejectLabel: 'Cancel'
        });

        if (!confirmed) return;

        window.addEventListener('beforeunload', beforeUnloadListener, { capture: true });

        for (let i in entries) {
          try {
            const resource = parseResourcePath(sanitize(this.currentResourcePath + '/' + entries[i].fileName));
            await this.directoryModel.remove(resource);
          } catch (e) {
            console.error(`Failed to remove file ${entries[i].name}:`, e);
          }
        }
        
        await this.refresh();

        window.removeEventListener('beforeunload', beforeUnloadListener, { capture: true });
      },
      async renameHandler(file, newName) {
        const fromResource = file.resource;
        const toResource = parseResourcePath(sanitize(this.currentResourcePath + '/' + newName));

        if (fromResource.resourcePath === toResource.resourcePath) return;

        await this.directoryModel.rename(fromResource, toResource);
        await this.refresh();
      },
      isReadonly() {
        if (window.location.hash === '#files/shares/' || window.location.hash === '#files/recent/') return true;
        if (!this.currentShare) return false;
        return this.currentShare.readonly;
      },
      isShareable() {
        const resource = parseResourcePath(this.currentResourcePath || 'files/');
        return resource.type !== 'shares';
      },
      async refreshShareDialogEntry(entry = null) {
        this.shareDialog.entry = await this.directoryModel.get(entry || this.shareDialog.entry);

        this.shareDialog.sharedWith = this.shareDialog.entry.sharedWith.filter((s) => s.receiverUsername);
        this.shareDialog.sharedLinks = this.shareDialog.entry.sharedWith.filter((s) => !s.receiverUsername);

        this.shareDialog.users.forEach((user) => {
          user.alreadyUsed = this.shareDialog.entry.sharedWith.find((share) => { return share.receiverUsername === user.username; });
        });

        this.refresh(this.shareDialog.entry);
      },
      async shareHandler(entry) {
        this.shareDialog.error = '';
        this.shareDialog.receiverUsername = '';
        this.shareDialog.readonly = false;
        this.shareDialog.shareLink.expires = false;
        this.shareDialog.shareLink.expiresAt = new Date()

        // start with tomorrow
        this.shareDialog.shareLink.expiresAt.setDate(this.shareDialog.shareLink.expiresAt.getDate() + 1);

        // prepare available users for sharing
        const users = await this.mainModel.getUsers();
        this.shareDialog.users = users.filter((u) => { return u.username !== this.profile.username; });
        this.shareDialog.users.forEach((u) => { u.userAndDisplayName = u.displayName + ' ( ' + u.username + ' )'; });

        this.refreshShareDialogEntry(entry);

        this.$refs.shareDialog.open();
      },
      copyShareIdLinkToClipboard(shareId) {
        copyToClipboard(this.shareModel.getLink(shareId));
        window.pankow.notify('Share link copied to clipboard');
      },
      async onCreateShareLink() {
        const path = this.shareDialog.entry.filePath;
        const readonly = true; // always readonly for now
        const expiresAt = this.shareDialog.shareLink.expires ? this.shareDialog.shareLink.expiresAt : 0;
        const ownerUsername = this.shareDialog.entry.group ? null : this.shareDialog.entry.owner;
        const ownerGroupfolder = this.shareDialog.entry.group ? this.shareDialog.entry.group.id : null;

        const shareId = await this.shareModel.create({ ownerUsername, ownerGroupfolder, path, readonly, expiresAt });

        this.copyShareIdLinkToClipboard(shareId);

        this.refreshShareDialogEntry();
      },
      async onCreateShare() {
        const path = this.shareDialog.entry.filePath;
        const readonly = this.shareDialog.readonly;
        const receiverUsername = this.shareDialog.receiverUsername;
        const ownerUsername = this.shareDialog.entry.group ? null : this.shareDialog.entry.owner;
        const ownerGroupfolder = this.shareDialog.entry.group ? this.shareDialog.entry.group.id : null;

        await this.shareModel.create({ ownerUsername, ownerGroupfolder, path, readonly, receiverUsername });

        // reset the form
        this.shareDialog.error = '';
        this.shareDialog.receiverUsername = '';
        this.shareDialog.readonly = false;

        // refresh the entry
        this.shareDialog.entry = await this.directoryModel.get(this.shareDialog.entry);
        this.refreshShareDialogEntry();
      },
      async onDeleteShare(share) {
        await this.shareModel.remove(share.id);
        this.refreshShareDialogEntry();
      },
      async refresh(entry = null) {
        if (entry) {
          try {
            entry = await this.directoryModel.get(entry.resource, entry.resource.path);
          } catch (error) {
            if (error.status === 401) return this.onInvalidSession();
            else if (error.status === 404) this.error = 'Does not exist';
            else console.error(error);
            return;
          }

          // this will replace the entry to keep bindings alive
          const idx = this.entries.findIndex((e) => e.id === entry.id );
          if (idx !== -1) this.entries.splice(idx, 1, entry);
        } else {
          const resource = parseResourcePath(this.currentResourcePath);

          try {
            entry = await this.directoryModel.get(resource, resource.path);
          } catch (error) {
            if (error.status === 401) return this.onInvalidSession();
            else if (error.status === 404) this.error = 'Does not exist';
            else console.error(error);
            return;
          }

          entry.files.forEach(function (e) {
            e.extension = getExtension(e);
            e.filePathNew = e.fileName;
          });

          this.entry = entry;
          this.entries = entry.files;
        }
      },
      async loadMainDirectory(path, entry, forceLoad = false) {
        // path is files/filepath or shares/shareid/filepath
        const resource = parseResourcePath(path);

        // nothing new
        if (!forceLoad && this.currentResourcePath === resource.resourcePath) return;

        if (!entry) {
          try {
            entry = await this.directoryModel.get(resource, resource.path);
          } catch (error) {
            this.entries = [];
            entry = {};

            if (error.status === 401) return this.onInvalidSession();
            else if (error.status === 404) this.error = 'Does not exist';
            else console.error(error);
          }
        }

        this.activeResourceType = resource.type;
        this.currentPath = resource.path;
        this.currentResourcePath = resource.resourcePath;
        this.currentShare = entry.share || null;

        if (resource.type === 'home') {
          this.breadCrumbs = sanitize(resource.path).split('/').filter(function (i) { return !!i; }).map(function (e, i, a) {
            return {
              label: decodeURIComponent(e),
              route: '#files/home' + sanitize('/' + a.slice(0, i).join('/') + '/' + e)
            };
          });
          this.breadCrumbHome = {
            icon: 'fa-solid fa-house',
            route: '#files/home/'
          };
        } else if (resource.type === 'recent') {
          this.breadCrumbs = [];
          this.breadCrumbHome = {
            icon: 'fa-regular fa-clock',
            route: '#files/recent/'
          };
        } else if (resource.type === 'shares') {
          this.breadCrumbs = sanitize(resource.path).split('/').filter(function (i) { return !!i; }).map(function (e, i, a) {
            return {
              label: decodeURIComponent(e),
              route: '#files/shares/' + resource.shareId  + sanitize('/' + a.slice(0, i).join('/') + '/' + e)
            };
          });
          this.breadCrumbHome = {
            icon: 'fa-solid fa-share-nodes',
            route: '#files/shares/'
          };

          // if we are not toplevel, add the share information
          if (entry.share) {
            this.breadCrumbs.unshift({
              label: entry.share.filePath.slice(1), // remove slash at the beginning
              route: '#files/shares/' + resource.shareId + '/'
            });
          }
        } else if (resource.type === 'groupfolders') {
          this.breadCrumbs = sanitize(resource.path).split('/').filter(function (i) { return !!i; }).map(function (e, i, a) {
            return {
              label: decodeURIComponent(e),
              route: '#files/groupfolders/' + resource.groupId  + sanitize('/' + a.slice(0, i).join('/') + '/' + e)
            };
          });
          this.breadCrumbHome = {
            icon: 'fa-solid fa-user-group',
            route: '#files/groupfolders/'
          };

          // if we are not toplevel, add the groupfolder information
          if (entry.group) {
            this.breadCrumbs.unshift({
              label: entry.group.name,
              route: '#files/groupfolders/' + entry.group.id + '/'
            });
          }
        } else {
          console.error('FIXME breadcrumbs for resource type', resource.type);
        }

        entry.files.forEach(function (e) {
          e.extension = getExtension(e);
          e.filePathNew = e.fileName;
        });

        this.entry = entry;
        this.entries = entry.files;
        this.viewer = '';
      },
      // return false/true on fail/success
      async loadPath(path, forceLoad = false) {
        const resource = parseResourcePath(path || this.currentResourcePath);

        // clear potential viewer first
        if (this.viewer) this.viewer = '';

        if (!forceLoad && this.currentResourcePath === resource.resourcePath) return true;

        let entry;
        try {
          entry = await this.directoryModel.get(resource);
        } catch (error) {
          this.entries = [];
          entry = {};

          if (error.status === 401 || error.status === 403) {
            this.onInvalidSession();
            return false;
          } else if (error.status === 404) {
            console.error('Failed to load entry', resource, error);
            return false;
          } else {
            console.error(error);
          }
        }

        // update the browser hash
        window.location.hash = `files${resource.resourcePath}`;

        if (entry.isDirectory) await this.loadMainDirectory(resource.resourcePath, entry, forceLoad);
        else await this.loadMainDirectory(resource.parentResourcePath, null, forceLoad);

        // if we don't have a folder load the viewer
        if (!entry.isDirectory) {
          if (this.$refs.imageViewer.canHandle(entry)) {
            const otherSupportedEntries = this.entries.filter((e) => this.$refs.imageViewer.canHandle(e));

            this.$refs.imageViewer.open(entry, otherSupportedEntries);
            this.viewer = 'image';
          } else if (this.$refs.pdfViewer.canHandle(entry)) {
            this.$refs.pdfViewer.open(entry);
            this.viewer = 'pdf';
          } else if (this.$refs.officeViewer.canHandle(entry)) {
            this.$refs.officeViewer.open(entry);
            this.viewer = 'office';
          } else if (this.$refs.markdownViewer.canHandle(entry)) {
            this.$refs.markdownViewer.open(entry, await this.directoryModel.getRawContent(resource));
            this.viewer = 'markdown';
          } else if (this.$refs.textViewer.canHandle(entry)) {
            this.$refs.textViewer.open(entry, await this.directoryModel.getRawContent(resource));
            this.viewer = 'text';
          } else {
            this.viewer = 'generic';
            this.$refs.genericViewer.open(entry);
          }
        } else {
          this.clearSelection();
        }

        return true;
      },
      onOpen(entry) {
        if (entry.share && entry.share.id) window.location.hash = `files/shares/${entry.share.id}${entry.filePath}`;
        else if (entry.group && entry.group.id) window.location.hash = `files/groupfolders/${entry.group.id}${entry.filePath}`;
        else window.location.hash = `files/home/${entry.filePath}`;
      },
      onViewerClose() {
        this.viewer = '';

        // update the browser hash
        const resource = parseResourcePath(this.currentResourcePath || '/home/');
        window.location.hash = `files${resource.resourcePath}`;
      },
      onUp() {
        if (window.location.hash.indexOf('#shares/') === 0) {
          const hash = window.location.hash.slice('#shares/'.length);

          // if we are first level of that share, go back to all shares
          if (!hash.split('/')[1]) window.location.hash = 'shares/';
          else window.location.hash = hash.split('/')[0] + sanitize(hash.split('/').filter(function (p) { return !!p; }).slice(1, -1).join('/'));
        } else {
          const hash = window.location.hash.slice(1);
          window.location.hash = hash.split('/')[0] + sanitize(hash.split('/').filter(function (p) { return !!p; }).slice(1, -1).join('/'));
        }
      },
    }
};

</script>

<style scoped>

hr {
    border: none;
    border-top: 1px solid #d0d0d0;
}

.container {
    display: flex;
    width: 100%;
    height: 100%;
}

.no-entries-placeholder {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}

.viewer-container {
  z-index: 30;
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
}

.file-actions {
  white-space: nowrap;
}

@media only screen and (min-width: 767px) {
  .file-actions {
    margin-right: 50px;
  }

  .profile-dropdown {
    margin-left: 50px;
  }
}

pre {
  background-color: lightgray;
  border-radius: 2px;
  padding: 10px;
}

@media (prefers-color-scheme: dark) {
  pre {
    background-color: black;
  }
}

.side-bar {
    display: flex;
    height: 100%;
    min-width: 250px;
    background: linear-gradient(90deg, rgb(168, 85, 247) 0%, var(--pankow-color-primary) 100%);
    color: white;
    padding: 10px;
    flex-direction: column;
}

.side-bar-entry {
  cursor: pointer;
  color: white;
  padding: 10px;
  padding-left: 20px;
  margin-bottom: 5px;
  border-radius: 3px;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

.side-bar-entry.active {
  background-color: rgba(255,255,255,0.1);
  font-weight: bold;
}

.side-bar-entry:hover {
  background-color: rgba(255,255,255,0.2);
}

.side-bar-entry > i {
  padding-right: 10px;
}

.side-bar-entry-button {
  background-color: rgba(255,255,255,0.2);
}

.side-bar-entry-button:hover {
  background-color: rgba(255,255,255,0.7);
  color: var(--pankow-text-color);
}

.content {
  display: flex;
  height: 100%;
  width: 100%;
  flex-direction: column;
}

.upload {
  display: flex;
  height: 50px;
  width: 100%;
  padding: 10px;
  flex-direction: column;
}

.main-container-content {
  position: relative;
  overflow: hidden;
  flex-grow: 1;
}

.side-bar-toggle {
  float: right;
  padding: 10px 15px;
  cursor: pointer;
}

.shared-link, .shared-link-empty {
  display: flex;
  justify-content: space-between;
  padding-left: 10px;
  align-items: center;
}

.shared-link:hover {
  background-color: var(--pankow-color-background-hover);
}

.breadcrumb-bar {
  display: flex;
  margin: auto 0px;
  align-items: center;
}

@media only screen and (max-width: 767px) {
  .side-bar-toggle {
    display: none;
  }
}

</style>
