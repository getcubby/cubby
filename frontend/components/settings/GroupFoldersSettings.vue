<script setup>

import { ref, computed, inject, onMounted, useTemplateRef } from 'vue';
import { Button, Dialog, InputDialog, ListItem, ProgressBar, TextInput } from '@cloudron/pankow';
import Section from '../Section.vue';
import GroupFolderMembers from './GroupFolderMembers.vue';
import GroupFolderModel from '../../models/GroupFolderModel.js';
import MainModel from '../../models/MainModel.js';
import slugify from '../../slugify.js';
import { ROLES } from '../../roles.js';

const props = defineProps({
  users: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(['groupfolders-changed']);

const profile = inject('profile');

const addGroupFolderDialog = useTemplateRef('addGroupFolderDialog');
const editGroupFolderDialog = useTemplateRef('editGroupFolderDialog');
const settingsInputDialog = useTemplateRef('settingsInputDialog');

const groups = ref([]);
const groupFolders = ref([]);
const groupFoldersBusy = ref(true);
const groupFolderAdd = ref({
  error: '',
  busy: false,
  name: '',
  slug: '',
  members: [],
  groupMembers: [],
  newMember: '',
  newMemberRole: ROLES.EDITOR,
});
const groupFolderEdit = ref({
  error: '',
  busy: false,
  id: '',
  name: '',
  members: [],
  groupMembers: [],
  newMember: '',
  newMemberRole: ROLES.EDITOR,
});

const groupNameById = computed(() => {
  const map = {};
  groups.value.forEach((g) => { map[g.id] = g.name; });
  return map;
});

function memberFields(includeSelf) {
  const username = profile.value?.username;
  return {
    members: includeSelf && username ? [{ username, role: ROLES.OWNER }] : [],
    groupMembers: [],
    newMember: '',
    newMemberRole: ROLES.EDITOR,
  };
}

function currentUserRole(groupFolder) {
  return groupFolder.myRole || null;
}

function groupFolderMemberLabels(groupFolder) {
  const labels = groupFolder.members.filter((m) => m.active !== false).map((m) => m.username);
  for (const gm of (groupFolder.groupMembers || [])) {
    labels.push(gm.name || groupNameById.value[gm.groupId] || gm.groupId);
  }
  return labels.join(', ');
}

function groupFolderActions(groupFolder) {
  if (currentUserRole(groupFolder) !== ROLES.OWNER) return [];

  return [{
    label: 'Edit',
    icon: 'fa-solid fa-pen',
    action: () => onEditGroupFolder(groupFolder),
    quickAction: true,
  }, {
    label: 'Remove',
    icon: 'fa-solid fa-trash',
    action: () => onRemoveGroupFolder(groupFolder),
    quickAction: true,
  }];
}

async function loadGroups() {
  try {
    groups.value = await MainModel.getGroups();
  } catch (error) {
    console.error('Failed to list groups.', error);
  }
}

async function refreshGroupFolders() {
  groupFoldersBusy.value = true;

  try {
    groupFolders.value = await GroupFolderModel.list();
  } catch (error) {
    console.error('Failed to list groupFolder.', error);
  }

  groupFoldersBusy.value = false;
  emit('groupfolders-changed');
}

async function onAddGroupFolder() {
  groupFolderAdd.value = {
    error: '',
    busy: false,
    name: '',
    slug: '',
    ...memberFields(true),
  };
  addGroupFolderDialog.value.open();
}

async function onAddGroupFolderSubmit() {
  groupFolderAdd.value.busy = true;

  try {
    await GroupFolderModel.add({
      name: groupFolderAdd.value.name,
      slug: groupFolderAdd.value.slug,
      members: groupFolderAdd.value.members.map((m) => ({ username: m.username, role: m.role })),
      groupMembers: groupFolderAdd.value.groupMembers.map((m) => ({ groupId: m.groupId, role: m.role })),
    });
  } catch (e) {
    groupFolderAdd.value.error = e.message;
    groupFolderAdd.value.busy = false;
    return;
  }

  await refreshGroupFolders();
  groupFolderAdd.value.busy = false;
  addGroupFolderDialog.value.close();
}

function onEditGroupFolder(groupFolder) {
  groupFolderEdit.value.busy = false;
  groupFolderEdit.value.error = '';
  groupFolderEdit.value.id = groupFolder.id;
  groupFolderEdit.value.name = groupFolder.name;
  groupFolderEdit.value.members = groupFolder.members.map((m) => ({ username: m.username, role: m.role }));
  groupFolderEdit.value.groupMembers = (groupFolder.groupMembers || []).map((m) => ({ groupId: m.groupId, role: m.role, name: m.name }));
  groupFolderEdit.value.newMember = '';
  groupFolderEdit.value.newMemberRole = ROLES.EDITOR;
  editGroupFolderDialog.value.open();
}

async function onEditGroupFolderSubmit() {
  groupFolderEdit.value.busy = true;

  try {
    await GroupFolderModel.update(groupFolderEdit.value.id, {
      name: groupFolderEdit.value.name,
      members: groupFolderEdit.value.members.map((m) => ({ username: m.username, role: m.role })),
      groupMembers: groupFolderEdit.value.groupMembers.map((m) => ({ groupId: m.groupId, role: m.role })),
    });
  } catch (e) {
    groupFolderEdit.value.error = e.message;
    groupFolderEdit.value.busy = false;
    return;
  }

  await refreshGroupFolders();
  groupFolderEdit.value.busy = false;
  editGroupFolderDialog.value.close();
}

async function onRemoveGroupFolder(groupFolder) {
  const yes = await settingsInputDialog.value.confirm({
    message: `Remove group folder "${groupFolder.name}"?`,
    confirmStyle: 'danger',
    confirmLabel: 'Remove',
    rejectLabel: 'Cancel',
    rejectStyle: 'secondary',
  });

  if (!yes) return;

  try {
    await GroupFolderModel.remove(groupFolder.id);
  } catch (e) {
    return console.error('Failed to delete groupFolder.', e);
  }

  await refreshGroupFolders();
}

onMounted(() => { loadGroups(); refreshGroupFolders(); });

</script>

<template>
  <Section title="Group folders">
    <template #header-buttons>
      <Button icon="fa-solid fa-plus" @click="onAddGroupFolder()">Add</Button>
    </template>

    <InputDialog ref="settingsInputDialog" />

    <Dialog
      title="Add group folder"
      ref="addGroupFolderDialog"
      reject-label="Cancel"
      reject-style="secondary"
      confirm-label="Add"
      :confirm-busy="groupFolderAdd.busy"
      :confirm-active="!!groupFolderAdd.name"
      @confirm="onAddGroupFolderSubmit"
    >
      <p class="has-error" v-show="groupFolderAdd.error">{{ groupFolderAdd.error }}</p>
      <label>Name</label>
      <TextInput v-model="groupFolderAdd.name" style="width: 100%;" @change="groupFolderAdd.slug = slugify(groupFolderAdd.name)"/>
      <label>Slug</label>
      <TextInput v-model="groupFolderAdd.slug" placeholder="design" style="width: 100%;" />
      <small class="helper-text">Optional. Used in the folder URL and cannot be changed later. A short id is generated if left empty.</small>
      <GroupFolderMembers :form="groupFolderAdd" :users="users" :groups="groups" />
    </Dialog>

    <Dialog
      title="Edit group folder"
      ref="editGroupFolderDialog"
      reject-label="Cancel"
      reject-style="secondary"
      confirm-label="Save"
      :confirm-busy="groupFolderEdit.busy"
      :confirm-active="!!groupFolderEdit.name"
      @confirm="onEditGroupFolderSubmit"
    >
      <p class="has-error" v-show="groupFolderEdit.error">{{ groupFolderEdit.error }}</p>
      <label>Name</label>
      <TextInput v-model="groupFolderEdit.name" style="width: 100%;" />
      <label>Slug</label>
      <TextInput v-model="groupFolderEdit.id" readonly style="width: 100%;" />
      <small class="helper-text">Used in the folder URL and cannot be changed.</small>
      <GroupFolderMembers :form="groupFolderEdit" :users="users" :groups="groups" />
    </Dialog>

    <ProgressBar v-if="groupFoldersBusy" mode="indeterminate" :show-label="false" :slim="true" :show-track="false" />
    <div v-else-if="groupFolders.length" class="group-folder-list">
      <ListItem v-for="groupFolder in groupFolders" :key="groupFolder.id" :actions="groupFolderActions(groupFolder)">
        <template #left>
          <i class="fa-solid fa-user-group item-icon"></i>
        </template>
        <template #label>
          {{ groupFolder.name }}
        </template>
        <template #subtext>
          <div class="group-folder-subtext">{{ groupFolderMemberLabels(groupFolder) }}</div>
        </template>
      </ListItem>
    </div>
    <div v-else class="group-folder-empty">No group folders</div>
  </Section>
</template>

<style scoped>

.group-folder-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.item-icon {
  font-size: 24px;
  color: var(--pankow-color-text-secondary);
}

.helper-text {
  display: block;
  font-size: 0.9em;
  color: #2d2323;
  margin-top: 0.25em;
}

@media (prefers-color-scheme: dark) {
  .helper-text {
    color: #927f7f;
  }
}

.group-folder-subtext {
  display: flex;
  gap: 8px;
}

.group-folder-empty {
  color: var(--pankow-color-text-secondary);
  text-align: center;
  padding: 20px 0;
}

</style>
