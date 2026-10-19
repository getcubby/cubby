<script setup>

import { ref, computed, useTemplateRef, inject } from 'vue';
import { prettyDate } from '@cloudron/pankow/utils';
import { copyToClipboard } from '../utils.js';
import {
  Button,
  DateTimeInput,
  Dialog,
  FormGroup,
  ListItem,
  PasswordInput,
  Radiobutton,
  SingleSelect,
  TabView,
  TextInput,
  useNotify
} from '@cloudron/pankow';
import DirectoryModel from '../models/DirectoryModel.js';
import MainModel from '../models/MainModel.js';
import ShareModel from '../models/ShareModel.js';

const { notify } = useNotify();

const profile = inject('profile');

const dialog = useTemplateRef('dialog');

const receiver = ref('');
const access = ref('write');
const users = ref([]);
const groups = ref([]);
const sharedWith = ref([]);
const sharedLinks = ref([]);
const entry = ref({});
const linkAccess = ref('read');
const shareLink = ref({
  name: '',
  expiresDate: '',
  password: '',
});

const receiverOptions = computed(() => {
  const options = [];

  if (users.value.length) {
    options.push({ label: 'Users', separator: true });
    users.value.forEach((u) => { options.push({ id: `user:${u.id}`, label: u.userAndDisplayName, userId: u.id, type: 'user' }); });
  }

  if (groups.value.length) {
    options.push({ label: 'Groups', separator: true });
    groups.value.forEach((g) => { options.push({ id: `group:${g.id}`, label: g.name, groupId: g.id, type: 'group' }); });
  }

  return options;
});

const groupNameById = computed(() => {
  const map = {};
  groups.value.forEach((g) => { map[g.id] = g.name; });
  return map;
});

function todayDateStr() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
    ? { ownerUserId: null, ownerGroupfolder: entry.value.group.id }
    : { ownerUserId: entry.value.owner, ownerGroupfolder: null };
}

function receiverLabel(share) {
  if (share.receiverUsername) return share.receiverUsername;
  if (share.receiverGroup) return share.receiverGroupName || groupNameById.value[share.receiverGroup] || share.receiverGroup;
  return share.receiverEmail || '';
}

async function refresh(item = null) {
  entry.value = await DirectoryModel.get(item || entry.value);

  sharedWith.value = entry.value.sharedWith.filter((s) => s.receiverUsername || s.receiverGroup);
  sharedLinks.value = entry.value.sharedWith
    .filter((s) => !s.receiverUsername && !s.receiverGroup)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function onCreateShare() {
  const selected = receiverOptions.value.find((o) => o.id === receiver.value);
  if (!selected) return;

  const receiverUserId = selected.type === 'user' ? selected.userId : null;
  const receiverGroup = selected.type === 'group' ? selected.groupId : null;
  const { ownerUserId, ownerGroupfolder } = entryOwner();

  await ShareModel.create({ ownerUserId, ownerGroupfolder, path: entry.value.filePath, readonly: access.value === 'read', receiverUserId, receiverGroup });

  receiver.value = '';
  access.value = 'write';

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
  if (shareLink.value.expiresDate) {
    expiresAt = endOfLocalDayMs(shareLink.value.expiresDate);
    if (!expiresAt) {
      notify('Invalid expiration date', { type: 'error' });
      return;
    }
  }
  const { ownerUserId, ownerGroupfolder } = entryOwner();

  const name = shareLink.value.name.trim();
  if (!name) return;

  await ShareModel.create({ ownerUserId, ownerGroupfolder, path: entry.value.filePath, readonly: linkAccess.value === 'read', expiresAt, password: shareLink.value.password || null, name });

  shareLink.value.name = '';
  await refresh();
}

defineExpose({
  async open(item) {
    receiver.value = '';
    access.value = 'write';
    linkAccess.value = 'read';
    shareLink.value.name = '';
    shareLink.value.expiresDate = '';
    shareLink.value.password = '';

    // prepare available users and groups for sharing
    users.value = (await MainModel.getUsers()).filter((u) => { return u.username !== profile.value.username; });
    users.value.forEach((u) => { u.userAndDisplayName = u.displayName + ' ( ' + u.username + ' )'; });
    groups.value = await MainModel.getGroups();

    await refresh(item);

    dialog.value.open();
  }
});

</script>

<template>
  <Dialog
    ref="dialog"
    title="Share"
    reject-label="Close"
    reject-style="secondary"
    :style="{ width: '560px' }"
  >
    <p v-show="entry.fileName">
      Sharing "{{ entry.fileName }}" with other users or via a link.
    </p>
    <div>
      <TabView :tabs="{ user: 'People', link: 'Link' }" default-active="user">
        <template #user>
          <form class="share-form" @submit.prevent="onCreateShare">
            <FormGroup>
              <label for="shareReceiver">Share with</label>
              <SingleSelect id="shareReceiver" v-model="receiver" :options="receiverOptions" option-key="id" option-label="label" placeholder="User or group" />
            </FormGroup>
            <FormGroup>
              <label>Access</label>
              <Radiobutton v-model="access" name="shareAccess" value="read" label="Read only" />
              <Radiobutton v-model="access" name="shareAccess" value="write" label="Read & write" />
            </FormGroup>
            <Button @click="onCreateShare" :disabled="!receiver">Create</Button>
          </form>

          <div class="people-shared">
            <div class="people-shared-heading">Shared with</div>
            <div class="people-list">
            <ListItem
              v-for="link in sharedWith"
              :key="link.id"
              :label="receiverLabel(link)"
              :subtext="link.readonly ? 'Read only' : 'Read & write'"
              :actions="[{
                label: 'Delete',
                icon: 'fa-solid fa-trash',
                action: () => onDeleteShare(link),
                quickAction: true,
              }]"
            />
            <div v-show="sharedWith.length === 0" class="shared-link-empty">
              Not shared with anyone
            </div>
            </div>
          </div>
        </template>
        <template #link>
          <form class="share-form" @submit.prevent="onCreateShareLink">
            <FormGroup>
              <label for="linkName">Name</label>
              <TextInput id="linkName" v-model="shareLink.name" placeholder="For Jane" />
            </FormGroup>
            <FormGroup>
              <label>Access</label>
              <Radiobutton v-model="linkAccess" name="linkAccess" value="read" label="Read only" />
              <Radiobutton v-model="linkAccess" name="linkAccess" value="write" label="Read & write" />
            </FormGroup>
            <FormGroup>
              <label for="linkPassword">Password (optional)</label>
              <PasswordInput id="linkPassword" v-model="shareLink.password" />
            </FormGroup>
            <FormGroup>
              <label for="linkExpires">Expires (optional)</label>
              <DateTimeInput id="linkExpires" date-only v-model="shareLink.expiresDate" :min="todayDateStr()" />
            </FormGroup>
            <Button @click="onCreateShareLink" :disabled="!shareLink.name.trim()">Create</Button>
          </form>

          <div class="people-shared">
            <div class="people-shared-heading">Existing links</div>
            <div class="people-list">
              <ListItem
                v-for="link in sharedLinks"
                :key="link.id"
                :label="link.name"
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
                  Created {{ prettyDate(link.createdAt) }}
                  - {{ link.readonly ? 'Read only' : 'Read & write' }}
                  <span v-if="link.passwordProtected"> - <i class="fa-solid fa-lock"/> Password protected</span>
                  <span v-if="link.expiresAt"> - Expires {{ prettyDate(link.expiresAt) }}</span>
                </template>
              </ListItem>
              <div v-show="sharedLinks.length === 0" class="shared-link-empty">
                No shared links
              </div>
            </div>
          </div>
        </template>
      </TabView>
    </div>
  </Dialog>
</template>

<style scoped>

.share-form {
  margin-bottom: 16px;
}

.share-form :deep(.pankow-form-group:first-child) {
  margin-top: 0;
}

.share-form :deep(.pankow-form-group:first-child label) {
  margin-top: 0;
}

.share-form :deep(.pankow-form-group:last-of-type) {
  margin-bottom: 0;
}

.share-form :deep(.pankow-button) {
  margin-top: 12px;
}

.people-shared-heading {
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 800;
  color: var(--pankow-color-text-secondary, #888);
}

.people-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.shared-link-empty {
  display: flex;
  justify-content: space-between;
  padding: 6px;
  align-items: center;
}

</style>
