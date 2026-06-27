<script setup>

import { ref, onMounted, onBeforeUnmount, useTemplateRef, computed, provide } from 'vue';
import { BASE_URL, parseResourcePath } from './utils.js';
import { Button, Notification, SideBar, TopBar } from '@cloudron/pankow';
import MainModel from './models/MainModel.js';
import LoginView from './components/LoginView.vue';
import SharesView from './components/SharesView.vue';
import SettingsView from './components/SettingsView.vue';
import FileBrowser from './components/FileBrowser.vue';
import FileViewerOverlay from './components/FileViewerOverlay.vue';
import RecentView from './components/RecentView.vue';
import FavoriteView from './components/FavoriteView.vue';
import SearchBar from './components/SearchBar.vue';
import ShareDialog from './components/ShareDialog.vue';
import ProfileMenuButton from './components/ProfileMenuButton.vue';

const VIEWS = {
  LOGIN: 'login',
  FILES_HOME: 'files-home',
  FILES_SHARES: 'files-shares',
  FILES_GROUPFOLDERS: 'files-groupfolders',
  FAVORITES: 'favorites',
  RECENT: 'recent',
  SETTINGS: 'settings',
  SHARES: 'shares'
};

const shareDialog = useTemplateRef('shareDialog');
const fileBrowser = useTemplateRef('fileBrowser');
const fileViewerOverlay = useTemplateRef('fileViewerOverlay');
const sideBar = useTemplateRef('sideBar');

const ready = ref(false);
const view = ref('');
const profile = ref({});
const config = ref({});
const currentHash = ref('');

const profileMenu = computed(() => {
  const items = [];
  if (profile.value.admin) {
    items.push({
      label: 'Settings',
      icon: 'fa-solid fa-cog',
      action: () => { window.location.href = '#settings'; },
    });
    items.push({ separator: true });
  }
  items.push({
    label: 'Log out',
    icon: 'fa-solid fa-right-from-bracket',
    action: onLogout,
  });
  return items;
});

const newMenu = [{
  separator: true,
  label: 'Upload',
}, {
  label: 'Upload file',
  icon: 'fa-solid fa-file-arrow-up',
  action: () => fileBrowser.value?.openUploadFile()
}, {
  label: 'Upload folder',
  icon: 'fa-regular fa-folder-open',
  action: () => fileBrowser.value?.openUploadFolder()
}, {
  separator: true,
  label: 'Create new',
}, {
  label: 'New file',
  icon: 'fa-solid fa-file-circle-plus',
  action: () => fileBrowser.value?.openNewFile()
}, {
  label: 'New folder',
  icon: 'fa-solid fa-folder-plus',
  action: () => fileBrowser.value?.openNewFolder()
}];

const isReadonly = computed(() => fileBrowser.value?.isReadonly ?? true);

const isFileBrowserView = computed(() =>
  view.value === VIEWS.FILES_HOME ||
  view.value === VIEWS.FILES_SHARES ||
  view.value === VIEWS.FILES_GROUPFOLDERS
);

const showTopBarNew = computed(() => isFileBrowserView.value);
const showTopBarBack = computed(() => view.value === VIEWS.SETTINGS);

function onCloseSidebar() {
  sideBar.value.close();
}

async function onLogin() {
  view.value = VIEWS.LOGIN;
}

async function onLogout() {
  await MainModel.logout();
  window.location.href = '/';
}

function onInvalidSession() {
  localStorage.returnTo = window.location.hash.slice(1);
  profile.value = {};
  onLogin();
}

let lastSessionCheckAt = 0;
let sessionRevalidateDebounceTimer = null;

async function revalidateSession() {
  if (!ready.value) return;
  if (view.value === VIEWS.LOGIN) return;
  if (!profile.value.username) return;

  const now = Date.now();
  if (now - lastSessionCheckAt < 30000) return;

  let fetched;
  try {
    fetched = await MainModel.getProfile();
  } catch (e) {
    console.error('session revalidate: getProfile() error', e);
    return;
  }

  lastSessionCheckAt = Date.now();

  if (!fetched || !fetched.username) {
    if (profile.value.username) onInvalidSession();
    return;
  }

  profile.value = fetched;
}

function scheduleSessionRevalidate() {
  if (sessionRevalidateDebounceTimer !== null) clearTimeout(sessionRevalidateDebounceTimer);
  sessionRevalidateDebounceTimer = setTimeout(() => {
    sessionRevalidateDebounceTimer = null;
    revalidateSession();
  }, 400);
}

function onVisibilityChangeForSession() {
  if (document.visibilityState !== 'visible') return;
  scheduleSessionRevalidate();
}

function onWindowFocusForSession() {
  scheduleSessionRevalidate();
}

function onFileViewerClose() {
  const folderPath = fileBrowser.value?.currentResourcePath || '/home/';
  const resource = parseResourcePath(folderPath);
  window.location.hash = `files${resource.resourcePath}`;
}

async function onOpenFile({ item, resource, siblingEntries }) {
  await fileViewerOverlay.value?.openFile(item, resource, siblingEntries);
}

function onCloseViewer() {
  fileViewerOverlay.value?.close();
}

async function fileViewerDownloadHandler(items) {
  return fileBrowser.value?.downloadHandler(items);
}

async function fileViewerSaveHandler(item, content, done) {
  return fileBrowser.value?.onFileSaved(item, content, done);
}

async function refreshConfig() {
  try {
    config.value = await MainModel.getConfig();
  } catch (e) {
    if (e.cause && e.cause.status !== 401) return console.error('Failed to get config.', e);
  }
}

provide('refreshConfig', refreshConfig);
provide('profile', profile);

function resetNonFileViewState() {
  onCloseViewer();
  fileBrowser.value?.reset();
}

function onOpen(item) {
  if (item.share && item.share.id) window.location.hash = `files/shares/${item.share.id}${item.filePath}`;
  else if (item.group && item.group.id) window.location.hash = `files/groupfolders/${item.group.id}${item.filePath}`;
  else window.location.hash = `files/home${item.filePath}`;
}

function onGroupFoldersChanged() {
  fileBrowser.value?.reload();
}

onMounted(async () => {
  const resumeParams = new URLSearchParams(window.location.search);
  if (resumeParams.has('resumeOffice')) {
    const p = resumeParams.get('resumeOffice');
    if (p) localStorage.returnToOffice = p;
    window.history.replaceState(null, '', window.location.pathname + (window.location.hash || ''));
  }

  async function handleHash(hash) {
    hash = decodeURIComponent(hash);

    if (hash.indexOf('files/home/') === 0) {
      if (await fileBrowser.value?.loadPath(hash.slice('files'.length), true)) view.value = VIEWS.FILES_HOME;
      else if (view.value !== VIEWS.LOGIN) window.location.hash = 'files/home/';
    } else if (hash.indexOf('files/shares/') === 0) {
      if (await fileBrowser.value?.loadPath(hash.slice('files'.length), true)) view.value = VIEWS.FILES_SHARES;
      else if (view.value !== VIEWS.LOGIN) window.location.hash = 'files/shares/';
    } else if (hash.indexOf('files/groupfolders/') === 0) {
      if (await fileBrowser.value?.loadPath(hash.slice('files'.length), true)) view.value = VIEWS.FILES_GROUPFOLDERS;
      else if (view.value !== VIEWS.LOGIN) window.location.hash = 'files/groupfolders/';
    } else if (hash === 'recent') {
      if (!profile.value?.username) {
        view.value = VIEWS.LOGIN;
        return;
      }
      resetNonFileViewState();
      view.value = VIEWS.RECENT;
    } else if (hash === 'favorites') {
      if (!profile.value?.username) {
        view.value = VIEWS.LOGIN;
        return;
      }
      resetNonFileViewState();
      view.value = VIEWS.FAVORITES;
    } else if ((hash.indexOf('users') === 0 || hash.indexOf('settings') === 0) && profile.value?.username && profile.value.admin) {
      if (hash.indexOf('users') === 0) window.location.hash = 'settings';
      resetNonFileViewState();
      view.value = VIEWS.SETTINGS;
      onCloseSidebar();
    } else if (hash === 'shares') {
      if (!profile.value?.username) {
        view.value = VIEWS.LOGIN;
        return;
      }
      resetNonFileViewState();
      view.value = VIEWS.SHARES;
      onCloseSidebar();
    } else {
      if (profile.value?.username) window.location.hash = 'files/home/';
      else view.value = VIEWS.LOGIN;
    }
  }

  try {
    profile.value = await MainModel.getProfile() || {};
  } catch (e) {
    return console.error('mounted: getProfile() error', e);
  }

  if (profile.value.username && localStorage.returnToOffice) {
    const officePath = localStorage.returnToOffice.trim();
    localStorage.returnToOffice = '';
    if (officePath) {
      const base = (BASE_URL || '/').replace(/\/?$/, '/');
      const u = new URL('office.html', window.location.origin + base);
      u.hash = officePath;
      window.location.replace(u.href);
      return;
    }
  }

  if (!profile.value.username) view.value = VIEWS.LOGIN;

  await refreshConfig();

  const urlHash = window.location.hash.slice(1);
  const storedReturnTo = localStorage.returnTo || '';
  const preferUrlForShare = storedReturnTo && urlHash && storedReturnTo !== urlHash
    && urlHash.indexOf('files/shares/') === 0;
  const hash = preferUrlForShare ? urlHash : (storedReturnTo || urlHash);
  localStorage.returnTo = '';

  await handleHash(hash);

  window.addEventListener('hashchange', () => {
    if (currentHash.value === decodeURIComponent(window.location.hash)) return;
    currentHash.value = window.location.hash;

    handleHash(window.location.hash.slice(1));
  }, false);

  ready.value = true;

  document.addEventListener('visibilitychange', onVisibilityChangeForSession);
  window.addEventListener('focus', onWindowFocusForSession);
});

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibilityChangeForSession);
  window.removeEventListener('focus', onWindowFocusForSession);
  if (sessionRevalidateDebounceTimer !== null) {
    clearTimeout(sessionRevalidateDebounceTimer);
    sessionRevalidateDebounceTimer = null;
  }
});

</script>

<template>
  <Notification/>

  <div v-show="ready" style="height: 100%;">
    <LoginView v-if="view === VIEWS.LOGIN"/>
    <div class="container" v-else>
      <SideBar class="side-bar" ref="sideBar">
        <div class="sidebar-title">
          <a href="#files/home/" class="sidebar-title-link" @click="onCloseSidebar">
            <img src="/logo-transparent.svg" alt="" class="sidebar-icon" />
            <span class="sidebar-app-name">Cubby</span>
          </a>
        </div>

        <a class="side-bar-entry" v-show="profile.username" :class="{'active': view === VIEWS.FILES_HOME }" href="#files/home/" @click="onCloseSidebar"><i class="fa-solid fa-house"></i> My files</a>
        <a class="side-bar-entry" v-show="profile.username" :class="{'active': view === VIEWS.FILES_GROUPFOLDERS }" href="#files/groupfolders/" @click="onCloseSidebar"><i class="fa-solid fa-user-group"></i> Group folders</a>
        <a class="side-bar-entry" v-show="profile.username" :class="{'active': view === VIEWS.FAVORITES }" href="#favorites" @click="onCloseSidebar"><i class="fa-solid fa-star"></i> Favorites</a>
        <a class="side-bar-entry" v-show="profile.username" :class="{'active': view === VIEWS.RECENT }" href="#recent" @click="onCloseSidebar"><i class="fa-regular fa-clock"></i> Recent files</a>

        <div v-show="profile.username" class="side-bar-section-heading">Shares</div>
        <a class="side-bar-entry" v-show="profile.username" :class="{'active': view === VIEWS.FILES_SHARES }" href="#files/shares/" @click="onCloseSidebar"><i class="fa-solid fa-share-nodes"></i> Shared with you</a>
        <a class="side-bar-entry" v-show="profile.username" :class="{'active': view === VIEWS.SHARES }" href="#shares" @click="onCloseSidebar"><i class="fa-solid fa-share-from-square"></i> Shared by you</a>

        <div style="flex-grow: 1">&nbsp;</div>
      </SideBar>
      <div class="content">
        <TopBar :gap="false" :left-grow="true">
          <template #left>
            <div class="topbar-left-cluster">
              <div class="topbar-new-slot">
                <Button v-if="showTopBarNew" icon="fa-solid fa-plus" :menu="newMenu" :disabled="isReadonly" tool><span class="pankow-no-mobile">New</span></Button>
                <Button v-else-if="showTopBarBack" plain tool icon="fa-solid fa-chevron-left" href="#files/home/">Back</Button>
              </div>
              <SearchBar />
            </div>
          </template>

          <template #right>
            <ProfileMenuButton :profile="profile" :menu="profileMenu" @login="onLogin" />
          </template>
        </TopBar>

        <SharesView v-if="view === VIEWS.SHARES" />
        <SettingsView v-else-if="view === VIEWS.SETTINGS" @groupfolders-changed="onGroupFoldersChanged" />
        <RecentView v-else-if="view === VIEWS.RECENT" @item-activated="onOpen" />
        <FavoriteView v-else-if="view === VIEWS.FAVORITES" />
        <FileBrowser
          v-show="isFileBrowserView"
          ref="fileBrowser"
          @invalid-session="onInvalidSession"
          @share="(item) => shareDialog.open(item)"
          @close-viewer="onCloseViewer"
          @open-file="onOpenFile"
        />
      </div>
    </div>
  </div>

  <ShareDialog ref="shareDialog"/>

  <FileViewerOverlay
    ref="fileViewerOverlay"
    :readonly="isReadonly"
    :download-handler="fileViewerDownloadHandler"
    :save-handler="fileViewerSaveHandler"
    @close="onFileViewerClose"
  />
</template>

<style scoped>

.container {
  display: flex;
  width: 100%;
  height: 100%;
}

.topbar-left-cluster {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-grow: 1;
}

.topbar-new-slot {
  flex-shrink: 0;
  width: 76px;
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
  min-height: 38px;
}

.sidebar-title {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
  flex-shrink: 0;
}

.sidebar-title-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 10px;
  text-decoration: none;
  color: white;
  cursor: pointer;
}

.sidebar-title-link:hover {
  opacity: 0.9;
}

.sidebar-icon {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
}

.sidebar-app-name {
  font-size: 24px;
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

.side-bar-section-heading {
  margin-top: 16px;
  margin-bottom: 4px;
  padding: 0 20px;
  font-size: 11px;
  font-weight: var(--pankow-font-weight-bold);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.55);
}

.content {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
  flex-grow: 1;
  flex-direction: column;
}

</style>
