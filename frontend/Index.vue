<script setup>

import { ref, reactive, onMounted, onBeforeUnmount, useTemplateRef, computed, provide, watch } from 'vue';
import { useRoute } from 'vue-router';
import { parseResourcePath, API_ORIGIN } from './utils.js';
import { consumeIgnore, go, goBack, replace, toRoutePath } from './router.js';
import { Button, SideBar, TopBar, LoginView } from '@cloudron/pankow';
import MainModel from './models/MainModel.js';
import SharesView from './components/SharesView.vue';
import SettingsView from './components/SettingsView.vue';
import FileBrowser from './components/FileBrowser.vue';
import FileViewerOverlay from './components/FileViewerOverlay.vue';
import RecentView from './components/RecentView.vue';
import FavoriteView from './components/FavoriteView.vue';
import SearchBar from './components/SearchBar.vue';
import SearchView from './components/SearchView.vue';
import ShareDialog from './components/ShareDialog.vue';
import FileDropDialog from './components/FileDropDialog.vue';
import ProfileMenuButton from './components/ProfileMenuButton.vue';

const VIEWS = {
  LOGIN: 'login',
  FILES_HOME: 'files-home',
  FILES_SHARES: 'files-shares',
  FILES_GROUPFOLDERS: 'files-groupfolders',
  FAVORITES: 'favorites',
  RECENT: 'recent',
  SEARCH: 'search',
  SETTINGS: 'settings',
  SHARES: 'shares'
};

const shareDialog = useTemplateRef('shareDialog');
const fileDropDialog = useTemplateRef('fileDropDialog');
const fileBrowser = useTemplateRef('fileBrowser');
const fileViewerOverlay = useTemplateRef('fileViewerOverlay');
const sideBar = useTemplateRef('sideBar');

const ready = ref(false);
const view = ref('');
const profile = ref({});
const searchQuery = ref('');
const fileClipboard = reactive({
  action: '',
  files: [],
});
const route = useRoute();
const loginProviderName = ref('Cloudron');
const fileOpenedFromList = ref(false);
let openedFileHash = '';

const loginLabel = computed(() => `Log in with ${loginProviderName.value || 'Cloudron'}`);

const profileMenu = computed(() => {
  const items = [{
    label: 'Settings',
    icon: 'fa-solid fa-cog',
    action: () => { go('/settings'); },
  }];
  items.push({ separator: true });
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
  label: 'Create',
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

function onLogin() {
  view.value = VIEWS.LOGIN;
}

const redirectToLogin = () => {
  window.location.href = API_ORIGIN + '/auth/login';
};

async function onLogout() {
  await MainModel.logout();
  window.location.href = '/';
}

function onInvalidSession() {
  localStorage.returnTo = route.fullPath;
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
  if (fileOpenedFromList.value) {
    onOriginBack();
    return;
  }

  const folderPath = fileBrowser.value?.currentResourcePath || '/home/';
  const resource = parseResourcePath(folderPath);
  go(`/files${resource.resourcePath}`);
}

function onOriginBack() {
  fileOpenedFromList.value = false;
  openedFileHash = '';
  goBack();
}

function clearFileListReturn(hash) {
  if (!fileOpenedFromList.value) return;
  if (hash === openedFileHash) return;
  fileOpenedFromList.value = false;
  openedFileHash = '';
}

async function onOpenFile({ item, resource, siblingEntries, viewer }) {
  await fileViewerOverlay.value?.openFile(item, resource, siblingEntries, viewer);
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
    const config = await MainModel.getConfig();
    if (config.oidcProviderName) loginProviderName.value = config.oidcProviderName;
  } catch (e) {
    if (e.cause && e.cause.status !== 401) return console.error('Failed to get config.', e);
  }
}

provide('profile', profile);

function resetNonFileViewState() {
  onCloseViewer();
  fileBrowser.value?.reset();
}

function onOpen(item) {
  const fromList = !item.isDirectory && (view.value === VIEWS.SEARCH || view.value === VIEWS.RECENT || view.value === VIEWS.FAVORITES);
  let nextPath;
  if (item.share && item.share.id) nextPath = `/files/shares/${item.share.id}${item.filePath}`;
  else if (item.group && item.group.id) nextPath = `/files/groupfolders/${item.group.id}${item.filePath}`;
  else nextPath = `/files/home${item.filePath}`;

  fileOpenedFromList.value = fromList;
  openedFileHash = fromList ? nextPath.replace(/^\//, '') : '';
  go(nextPath);
}

function onSidebar(path, event) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  onCloseSidebar();
  go(path);
}

function onGroupFoldersChanged() {
  fileBrowser.value?.reload();
}

async function handleLocation() {
  const hash = route.path.replace(/^\//, '');
  clearFileListReturn(hash);

  if (hash === 'files/home' || hash === 'files/shares' || hash === 'files/groupfolders') {
    replace(`/${hash}/`);
    return;
  }

  if (hash.indexOf('files/home/') === 0) {
    if (await fileBrowser.value?.loadPath(hash.slice('files'.length), true)) view.value = VIEWS.FILES_HOME;
    else if (view.value !== VIEWS.LOGIN) replace('/files/home/');
  } else if (hash.indexOf('files/shares/') === 0) {
    if (await fileBrowser.value?.loadPath(hash.slice('files'.length), true)) view.value = VIEWS.FILES_SHARES;
    else if (view.value !== VIEWS.LOGIN) replace('/files/shares/');
  } else if (hash.indexOf('files/groupfolders/') === 0) {
    if (await fileBrowser.value?.loadPath(hash.slice('files'.length), true)) view.value = VIEWS.FILES_GROUPFOLDERS;
    else if (view.value !== VIEWS.LOGIN) replace('/files/groupfolders/');
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
  } else if (hash.indexOf('search/') === 0) {
    if (!profile.value?.username) {
      view.value = VIEWS.LOGIN;
      return;
    }
    const query = hash.slice('search/'.length);
    if (!query) {
      replace('/files/home/');
      return;
    }
    resetNonFileViewState();
    searchQuery.value = query;
    view.value = VIEWS.SEARCH;
  } else if (hash.indexOf('settings') === 0 && profile.value?.username) {
    resetNonFileViewState();
    view.value = VIEWS.SETTINGS;
    onCloseSidebar();
  } else if (hash === 'shares' || hash === 'shares/') {
    if (!profile.value?.username) {
      view.value = VIEWS.LOGIN;
      return;
    }
    resetNonFileViewState();
    view.value = VIEWS.SHARES;
    onCloseSidebar();
  } else {
    if (profile.value?.username) replace('/files/home/');
    else view.value = VIEWS.LOGIN;
  }
}

onMounted(async () => {
  try {
    profile.value = await MainModel.getProfile() || {};
  } catch (e) {
    return console.error('mounted: getProfile() error', e);
  }

  await refreshConfig();

  const urlPath = route.fullPath;
  const storedReturnTo = localStorage.returnTo || '';
  const storedPath = storedReturnTo ? toRoutePath(storedReturnTo) : '';
  const preferUrlForShare = storedPath && urlPath && storedPath !== urlPath
    && urlPath.indexOf('/files/shares/') === 0;
  const target = preferUrlForShare ? urlPath : (storedPath || urlPath);
  localStorage.returnTo = '';

  if (target !== urlPath) await replace(target);

  await handleLocation();

  watch(() => route.fullPath, () => {
    if (consumeIgnore()) return;
    handleLocation();
  });

  if (!profile.value.username && view.value === '') view.value = VIEWS.LOGIN;

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
  <div v-show="ready" style="height: 100%;">
    <div v-if="view === VIEWS.LOGIN" class="login-wrapper">
      <LoginView
        icon-url="/logo.svg"
        title="Cubby"
        :login-label="loginLabel"
        message="The painless file sharing solution"
        footer="By Cloudron"
        @login="redirectToLogin"
      />
    </div>
    <div class="container" v-else>
      <SideBar class="side-bar" ref="sideBar">
        <div class="sidebar-title">
          <a href="#/files/home/" class="sidebar-title-link" @click="onSidebar('/files/home/', $event)">
            <img src="/logo-transparent.svg" alt="" class="sidebar-icon" />
            <span class="sidebar-app-name">Cubby</span>
          </a>
        </div>

        <a class="side-bar-entry" v-show="profile.username" :class="{'active': view === VIEWS.FILES_HOME }" href="#/files/home/" @click="onSidebar('/files/home/', $event)"><i class="fa-solid fa-house"></i> My files</a>
        <a class="side-bar-entry" v-show="profile.username" :class="{'active': view === VIEWS.FILES_GROUPFOLDERS }" href="#/files/groupfolders/" @click="onSidebar('/files/groupfolders/', $event)"><i class="fa-solid fa-user-group"></i> Group folders</a>
        <a class="side-bar-entry" v-show="profile.username" :class="{'active': view === VIEWS.FAVORITES }" href="#/favorites" @click="onSidebar('/favorites', $event)"><i class="fa-solid fa-star"></i> Favorites</a>
        <a class="side-bar-entry" v-show="profile.username" :class="{'active': view === VIEWS.RECENT }" href="#/recent" @click="onSidebar('/recent', $event)"><i class="fa-regular fa-clock"></i> Recent files</a>

        <div v-show="profile.username" class="side-bar-section-heading">Shares</div>
        <a class="side-bar-entry" v-show="profile.username" :class="{'active': view === VIEWS.FILES_SHARES }" href="#/files/shares/" @click="onSidebar('/files/shares/', $event)"><i class="fa-solid fa-share-nodes"></i> Shared with you</a>
        <a class="side-bar-entry" v-show="profile.username" :class="{'active': view === VIEWS.SHARES }" href="#/shares" @click="onSidebar('/shares', $event)"><i class="fa-solid fa-share-from-square"></i> Shared by you</a>

        <div style="flex-grow: 1">&nbsp;</div>
      </SideBar>
      <div class="content">
        <TopBar :gap="false" :left-grow="true">
          <template #left>
            <div class="topbar-left-cluster">
              <Button v-if="showTopBarNew" icon="fa-solid fa-plus" :menu="newMenu" :disabled="isReadonly" tool><span class="pankow-no-mobile">New</span></Button>
              <Button v-else-if="showTopBarBack" plain tool icon="fa-solid fa-chevron-left" @click="goBack()">Back</Button>
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
        <FavoriteView v-else-if="view === VIEWS.FAVORITES" @item-activated="onOpen" />
        <SearchView
          v-else-if="view === VIEWS.SEARCH"
          :query="searchQuery"
          :clipboard="fileClipboard"
          @item-activated="onOpen"
          @invalid-session="onInvalidSession"
          @share="(item) => shareDialog.open(item)"
        />
        <FileBrowser
          v-show="isFileBrowserView"
          ref="fileBrowser"
          :clipboard="fileClipboard"
          :origin-back="fileOpenedFromList"
          @origin-back="onOriginBack"
          @invalid-session="onInvalidSession"
          @share="(item) => shareDialog.open(item)"
          @filedrop="(item) => fileDropDialog.open(item)"
          @close-viewer="onCloseViewer"
          @open-file="onOpenFile"
        />
      </div>
    </div>
  </div>

  <ShareDialog ref="shareDialog"/>

  <FileDropDialog ref="fileDropDialog"/>

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
  min-width: 0;
  flex-grow: 1;
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
  gap: 6px;
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

.login-wrapper {
  height: 100%;
  min-height: 100vh;
}</style>
