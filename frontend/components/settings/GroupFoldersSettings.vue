<script setup>

import { ref, computed, inject, onMounted, useTemplateRef } from 'vue';
import { Button, Dialog, FormGroup, InputDialog, ListItem, ProgressBar, SingleSelect, TextInput } from '@cloudron/pankow';
import Section from '../Section.vue';
import GroupFolderModel from '../../models/GroupFolderModel.js';
import slugify from '../../slugify.js';
import { ROLES, roleOptions } from '../../roles.js';

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

const groupFolderTableModel = ref([]);
const groupFoldersBusy = ref(true);
const groupFolderAdd = ref({
  error: '',
  busy: false,
  name: '',
  slug: '',
});
const groupFolderEdit = ref({
  error: '',
  busy: false,
  id: '',
  name: '',
  members: [],
  newMember: '',
  newMemberRole: ROLES.EDITOR,
});

const userOptions = computed(() => props.users.map((u) => ({
  ...u,
  label: u.username || u.email,
})));

const availableUserOptions = computed(() => {
  const existing = new Set(groupFolderEdit.value.members.map((m) => m.username));
  return userOptions.value.filter((u) => !existing.has(u.username));
});

function currentUserRole(groupFolder) {
  const member = groupFolder.members.find((m) => m.username === profile.value?.username);
  return member ? member.role : null;
}

function roleLabel(role) {
  return roleOptions.find((o) => o.value === role)?.label || role;
}

function onAddMember() {
  const username = groupFolderEdit.value.newMember;
  const role = groupFolderEdit.value.newMemberRole;
  if (!username || !role) return;
  if (groupFolderEdit.value.members.some((m) => m.username === username)) return;

  groupFolderEdit.value.members.push({ username, role });
  groupFolderEdit.value.newMember = '';
  groupFolderEdit.value.newMemberRole = ROLES.EDITOR;
}

async function refreshGroupFolders() {
  groupFoldersBusy.value = true;

  try {
    groupFolderTableModel.value = await GroupFolderModel.list();
  } catch (error) {
    console.error('Failed to list groupFolder.', error);
  }

  groupFoldersBusy.value = false;
  emit('groupfolders-changed');
}

async function onAddGroupFolder() {
  groupFolderAdd.value.busy = false;
  groupFolderAdd.value.error = '';
  groupFolderAdd.value.name = '';
  groupFolderAdd.value.slug = '';
  addGroupFolderDialog.value.open();
}

async function onAddGroupFolderSubmit() {
  groupFolderAdd.value.busy = true;

  try {
    await GroupFolderModel.add({
      name: groupFolderAdd.value.name,
      slug: groupFolderAdd.value.slug,
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
  groupFolderEdit.value.newMember = '';
  groupFolderEdit.value.newMemberRole = ROLES.EDITOR;
  editGroupFolderDialog.value.open();
}

function onRemoveMember(index) {
  const member = groupFolderEdit.value.members[index];
  if (!member || member.username === profile.value?.username) return;
  groupFolderEdit.value.members.splice(index, 1);
}

async function onEditGroupFolderSubmit() {
  groupFolderEdit.value.busy = true;

  try {
    await GroupFolderModel.update(groupFolderEdit.value.id, {
      name: groupFolderEdit.value.name,
      members: groupFolderEdit.value.members.map((m) => ({ username: m.username, role: m.role })),
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

onMounted(refreshGroupFolders);

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
      confirm-style="success"
      @confirm="onAddGroupFolderSubmit"
    >
      <p class="has-error" v-show="groupFolderAdd.error">{{ groupFolderAdd.error }}</p>
      <label>Name</label>
      <TextInput v-model="groupFolderAdd.name" style="width: 100%;" @change="groupFolderAdd.slug = slugify(groupFolderAdd.name)"/>
      <label>Slug (cannot be changed later)</label>
      <TextInput v-model="groupFolderAdd.slug" placeholder="Optional slug for prettier URLs" style="width: 100%;" />
    </Dialog>

    <Dialog
      :title="`Edit group folder ${groupFolderEdit.id}`"
      ref="editGroupFolderDialog"
      reject-label="Cancel"
      reject-style="secondary"
      confirm-label="Save"
      :confirm-busy="groupFolderEdit.busy"
      :confirm-active="!!groupFolderEdit.name"
      confirm-style="success"
      @confirm="onEditGroupFolderSubmit"
    >
      <p class="has-error" v-show="groupFolderEdit.error">{{ groupFolderEdit.error }}</p>
      <label>Name</label>
      <TextInput v-model="groupFolderEdit.name" style="width: 100%;" />
      <FormGroup>
        <label>Members</label>
        <ListItem v-for="(member, index) in groupFolderEdit.members" :key="member.username">
          <template #left>
            <i class="fa-solid fa-circle-user member-avatar"></i>
          </template>
          <template #label>
            <div class="member-label-row">
              <span>{{ member.username }}</span>
              <span v-if="member.username === profile?.username" class="member-self-role">{{ roleLabel(member.role) }} (you)</span>
              <span v-else class="member-role-controls">
                <SingleSelect v-model="member.role" :options="roleOptions" option-key="value" style="width: 120px;" />
                <Button icon="fa-solid fa-xmark" plain tool @click="onRemoveMember(index)" />
              </span>
            </div>
          </template>
        </ListItem>
        <div class="add-member-row">
          <SingleSelect v-model="groupFolderEdit.newMember" :options="availableUserOptions" option-key="username" placeholder="Select user" style="flex-grow: 1;" />
          <SingleSelect v-model="groupFolderEdit.newMemberRole" :options="roleOptions" option-key="value" style="width: 120px;" />
          <Button icon="fa-solid fa-plus" :disabled="!groupFolderEdit.newMember" @click="onAddMember()">Add</Button>
        </div>
      </FormGroup>
    </Dialog>

    <ProgressBar v-if="groupFoldersBusy" mode="indeterminate" :show-label="false" :slim="true" :show-track="false" />
    <div v-else-if="groupFolderTableModel.length" class="group-folder-list">
      <ListItem
        v-for="groupFolder in groupFolderTableModel" :key="groupFolder.id" :actions="[{
          label: 'Edit',
          icon: 'fa-solid fa-pen',
          action: () => onEditGroupFolder(groupFolder),
          quickAction: true,
          visible: currentUserRole(groupFolder) === ROLES.OWNER,
        }, {
          label: 'Remove',
          icon: 'fa-solid fa-trash',
          action: () => onRemoveGroupFolder(groupFolder),
          quickAction: true,
          visible: currentUserRole(groupFolder) === ROLES.OWNER,
        }]"
      >
        <template #left>
          <i class="fa-solid fa-user-group group-folder-icon"></i>
        </template>
        <template #label>{{ groupFolder.name }}</template>
        <template #subtext>
          <div class="group-folder-subtext">
            <span class="group-folder-slug">{{ groupFolder.id }}/</span>
            <span v-if="groupFolder.members.length">{{ groupFolder.members.map((m) => m.username).join(', ') }}</span>
          </div>
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

.group-folder-icon {
  font-size: 24px;
  color: var(--pankow-color-text-secondary);
}

.group-folder-subtext {
  display: flex;
  gap: 8px;
}

.group-folder-slug {
  color: var(--pankow-color-text-secondary);
}

.group-folder-empty {
  color: var(--pankow-color-text-secondary);
  text-align: center;
  padding: 20px 0;
}

.member-avatar {
  font-size: 24px;
  color: var(--pankow-color-text-secondary);
}

.member-label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  gap: 8px;
}

.member-role-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: normal;
}

.member-self-role {
  font-weight: normal;
  font-size: 13px;
  color: var(--pankow-color-text-secondary);
}

.add-member-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

</style>
