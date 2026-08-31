<script setup>

import { ref, useTemplateRef, inject } from 'vue';
import { prettyDate } from '@cloudron/pankow/utils';
import { copyToClipboard } from '../utils.js';
import {
  Button,
  Dialog,
  Checkbox,
  ListItem,
  SingleSelect,
  TabView,
  InputGroup,
  useNotify
} from '@cloudron/pankow';
import DirectoryModel from '../models/DirectoryModel.js';
import MainModel from '../models/MainModel.js';
import ShareModel from '../models/ShareModel.js';

const { notify } = useNotify();

const profile = inject('profile');

const dialog = useTemplateRef('dialog');

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

function entryOwner() {
  return entry.value.group
    ? { ownerUsername: null, ownerGroupfolder: entry.value.group.id }
    : { ownerUsername: entry.value.owner, ownerGroupfolder: null };
}

async function refresh(item = null) {
  entry.value = await DirectoryModel.get(item || entry.value);

  sharedWith.value = entry.value.sharedWith.filter((s) => s.receiverUsername);
  sharedLinks.value = entry.value.sharedWith.filter((s) => !s.receiverUsername);
}

async function onCreateShare() {
  const { ownerUsername, ownerGroupfolder } = entryOwner();

  await ShareModel.create({ ownerUsername, ownerGroupfolder, path: entry.value.filePath, readonly: readonly.value, receiverUsername: receiverUsername.value });

  // reset the form
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
  notify('Share link copied to clipboard');
}

async function onCreateShareLink() {
  let expiresAt = 0;
  if (shareLink.value.expires) {
    expiresAt = endOfLocalDayMs(shareLink.value.expiresDate);
    if (!expiresAt) {
      notify('Invalid expiration date', { type: 'error' });
      return;
    }
  }
  const { ownerUsername, ownerGroupfolder } = entryOwner();

  const shareId = await ShareModel.create({ ownerUsername, ownerGroupfolder, path: entry.value.filePath, readonly: shareLinkReadonly.value, expiresAt });

  copyShareIdLinkToClipboard(shareId);

  await refresh();
}

defineExpose({
  async open(item) {
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
  <Dialog
    ref="dialog"
    title="Share"
    reject-label="Done"
    reject-style="secondary"
  >
    <p v-show="entry.fileName">
      Sharing "{{ entry.fileName }}" with other users or via a link.
    </p>
    <div>
      <TabView :tabs="{ user: 'With a user', link: 'Via link' }" default-active="user">
        <template #user>
          <div style="margin-bottom: 10px; display: flex; flex-direction: column; gap: 6px;">
            <ListItem
              v-for="link in sharedWith"
              :key="link.id"
              :label="link.receiverUsername || link.receiverEmail"
              :subtext="link.readonly ? 'Read only' : 'Read & write'"
              :actions="[{
                label: 'Delete',
                icon: 'fa-solid fa-trash',
                action: () => onDeleteShare(link),
                quickAction: true,
              }]"
            />
            <div v-show="sharedWith.length === 0" class="shared-link-empty">
              Not shared with anyone yet
            </div>
          </div>

          <form @submit="onCreateShare" @submit.prevent>
            <InputGroup>
              <SingleSelect v-model="receiverUsername" :options="users" option-key="username" option-label="userAndDisplayName" placeholder="Select a user"/>
              <Button icon="fa-solid fa-check" success @click="onCreateShare" :disabled="!receiverUsername">Create share</Button>
            </InputGroup>
            <div style="display: flex; align-items: center; gap: 10px; margin-top: 8px;">
              <Checkbox id="shareReadonly" label="Read only" v-model="readonly" />
            </div>
          </form>
        </template>
        <template #link>
          <div style="margin-bottom: 10px; display: flex; flex-direction: column; gap: 6px;">
            <ListItem
              v-for="link in sharedLinks"
              :key="link.id"
              :label="'Created ' + prettyDate(link.createdAt)"
              :actions="[{
                label: 'Copy to clipboard',
                icon: 'fa-regular fa-copy',
                action: () => copyShareIdLinkToClipboard(link.id),
                quickAction: true,
              }, {
                label: 'Delete',
                icon: 'fa-solid fa-trash',
                action: () => onDeleteShare(link),
                quickAction: true,
              }]"
            >
              <template #subtext>
                {{ link.readonly ? 'Read only' : 'Read & write' }}
                <span v-if="link.expiresAt"> - Expires {{ prettyDate(link.expiresAt) }}</span>
              </template>
            </ListItem>
            <div v-show="sharedLinks.length === 0" class="shared-link-empty">
              No shared links yet
            </div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <Checkbox id="shareLinkReadonly" label="Read only" v-model="shareLinkReadonly" />
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <Checkbox id="expireShareLinkAt" label="Expire at" v-model="shareLink.expires" />
              <input type="date" v-model="shareLink.expiresDate" :min="new Date().toISOString().split('T')[0]" :disabled="!shareLink.expires"/>
              <Button icon="fa-solid fa-link" success @click="onCreateShareLink">Create and copy link</Button>
            </div>
          </div>
        </template>
      </TabView>
    </div>
  </Dialog>
</template>

<style scoped>

.shared-link-empty {
  display: flex;
  justify-content: space-between;
  padding: 6px;
  align-items: center;
}

</style>
