<script setup>

import { ref, useTemplateRef, inject } from 'vue';
import { prettyDate } from '@cloudron/pankow/utils';
import { copyToClipboard } from '../utils.js';
import {
  Button,
  Dialog,
  Checkbox,
  SingleSelect,
  TabView,
  InputGroup
} from '@cloudron/pankow';
import DirectoryModel from '../models/DirectoryModel.js';
import MainModel from '../models/MainModel.js';
import ShareModel from '../models/ShareModel.js';

const profile = inject('profile');

const dialog = useTemplateRef('dialog');

const error = ref('');
const receiverUsername = ref('');
const readonly = ref(false);
const users = ref([]);
const sharedWith = ref([]);
const sharedLinks = ref([]);
const entry = ref({});
const shareLinkReadonly = ref(true);
const shareLink = ref({
  expires: false,
  expiresDate: '',
});

function defaultExpiresDateStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

/** End of selected calendar day in local time, as Unix ms (for API). */
function endOfLocalDayMs(ymd) {
  const parts = String(ymd).split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return 0;
  const [y, m, day] = parts;
  return new Date(y, m - 1, day, 23, 59, 59, 999).getTime();
}

async function refresh(item = null) {
  entry.value = await DirectoryModel.get(item || entry.value);

  sharedWith.value = entry.value.sharedWith.filter((s) => s.receiverUsername);
  sharedLinks.value = entry.value.sharedWith.filter((s) => !s.receiverUsername);

  users.value.forEach((user) => {
    user.alreadyUsed = entry.value.sharedWith.find((share) => { return share.receiverUsername === user.username; });
  });
}

async function onCreateShare() {
  const ownerUsername = entry.value.group ? null : entry.value.owner;
  const ownerGroupfolder = entry.value.group ? entry.value.group.id : null;

  await ShareModel.create({ ownerUsername, ownerGroupfolder, path: entry.value.filePath, readonly: readonly.value, receiverUsername: receiverUsername.value });

  // reset the form
  error.value = '';
  receiverUsername.value = '';
  readonly.value = false;

  // refresh the entry
  entry.value = await DirectoryModel.get(entry.value);
  await refresh();
}

async function onDeleteShare(share) {
  await ShareModel.remove(share.id);
  refresh();
}

function copyShareIdLinkToClipboard(shareId) {
  copyToClipboard(ShareModel.getLink(shareId));
  window.pankow.notify('Share link copied to clipboard');
}

async function onCreateShareLink() {
  let expiresAt = 0;
  if (shareLink.value.expires) {
    expiresAt = endOfLocalDayMs(shareLink.value.expiresDate);
    if (!expiresAt) {
      window.pankow.notify('Invalid expiration date', { type: 'error' });
      return;
    }
  }
  const ownerUsername = entry.value.group ? null : entry.value.owner;
  const ownerGroupfolder = entry.value.group ? entry.value.group.id : null;

  const shareId = await ShareModel.create({ ownerUsername, ownerGroupfolder, path: entry.value.filePath, readonly: shareLinkReadonly.value, expiresAt });

  copyShareIdLinkToClipboard(shareId);

  await refresh();
}

defineExpose({
  async open(item) {
    error.value = '';
    receiverUsername.value = '';
    readonly.value = false;
    shareLinkReadonly.value = true;
    shareLink.value.expires = false;
    shareLink.value.expiresDate = defaultExpiresDateStr();

    // prepare available users for sharing
    users.value = (await MainModel.getUsers()).filter((u) => { return u.username !== profile.value.username; });
    users.value.forEach((u) => { u.userAndDisplayName = u.displayName + ' ( ' + u.username + ' )'; });

    await refresh(item);

    dialog.value.open();
  }
});

</script>

<template>
  <Dialog ref="dialog" :title="'Sharing ' + entry.fileName" :show-x="true">
    <div>
      <TabView :tabs="{ user: 'with a User', link: 'via Link' }" default-active="user">
        <template #user>
          <div style="margin-bottom: 10px;">
            <div v-for="link in sharedWith" class="shared-link" :key="link.id">
              <div><b>{{ link.receiverUsername || link.receiverEmail }}</b></div>
              <Button danger outline tool icon="fa-solid fa-trash" title="Delete" @click="onDeleteShare(link)"/>
            </div>
            <div v-show="sharedWith.length === 0" class="shared-link-empty">
              Not shared with anyone yet
            </div>
          </div>

          <form @submit="onCreateShare" @submit.prevent>
            <!-- TODO optionDisabled="alreadyUsed"  -->
            <small v-show="error">{{ error }}</small>
            <InputGroup>
              <SingleSelect v-model="receiverUsername" :options="users" option-key="username" option-label="userAndDisplayName" placeholder="Select a user"/>
              <Button icon="fa-solid fa-check" success @click="onCreateShare" :disabled="!receiverUsername">Create share</Button>
            </InputGroup>
          </form>
        </template>
        <template #link>
          <div style="margin-bottom: 10px;">
            <div v-for="link in sharedLinks" class="shared-link" :key="link.id">
              <div>
                <div>Created {{ prettyDate(link.createdAt) }}</div>
                <small style="color: var(--pankow-color-text-secondary)">
                  {{ link.readonly ? 'Read only' : 'Read & Write' }}
                  <span v-if="link.expiresAt"> - Expires {{ prettyDate(link.expiresAt) }}</span>
                </small>
              </div>
              <div style="display: flex; gap: 5px">
                <Button outline tool icon="fa-regular fa-copy" title="Copy to clipboard" @click="copyShareIdLinkToClipboard(link.id)"/>
                <Button danger outline tool icon="fa-solid fa-trash" title="Delete" @click="onDeleteShare(link)"/>
              </div>
            </div>
            <div v-show="sharedLinks.length === 0" class="shared-link-empty">
              No shared links yet
            </div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <Checkbox id="shareLinkReadonly" label="Read only" v-model="shareLinkReadonly" />
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <Checkbox id="expireShareLinkAt" label="Expire At" v-model="shareLink.expires" />
              <input type="date" v-model="shareLink.expiresDate" :min="new Date().toISOString().split('T')[0]" :disabled="!shareLink.expires"/>
              <Button icon="fa-solid fa-link" success @click="onCreateShareLink">Create and Copy Link</Button>
            </div>
          </div>
        </template>
      </TabView>
    </div>
  </Dialog>
</template>

<style scoped>

.shared-link, .shared-link-empty {
  display: flex;
  justify-content: space-between;
  padding: 6px;
  align-items: center;
}

.shared-link:hover {
  background-color: var(--pankow-color-background-hover);
}

</style>