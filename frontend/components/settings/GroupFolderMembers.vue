<script setup>

import { computed, inject } from 'vue';
import { Button, FormGroup, ListItem, SingleSelect } from '@cloudron/pankow';
import { ROLES, roleOptions } from '../../roles.js';

const props = defineProps({
  form: {
    type: Object,
    required: true,
  },
  users: {
    type: Array,
    default: () => [],
  },
  groups: {
    type: Array,
    default: () => [],
  },
});

const profile = inject('profile');

const userOptions = computed(() => props.users.map((u) => ({
  ...u,
  label: u.username || u.email,
})));

const groupNameById = computed(() => {
  const map = {};
  props.groups.forEach((g) => { map[g.id] = g.name; });
  return map;
});

// Inactive members stay visible. Removing one drops them from the save payload; leaving them keeps the membership.
const visibleMembers = computed(() => props.form.members
  .map((member, index) => ({ member, index })));

const memberOptions = computed(() => {
  const options = [];

  const existingUsers = new Set(props.form.members.map((m) => m.userId));
  const availableUsers = userOptions.value.filter((u) => !existingUsers.has(u.id));
  if (availableUsers.length) {
    options.push({ label: 'Users', separator: true });
    availableUsers.forEach((u) => { options.push({ id: `user:${u.id}`, label: u.label, userId: u.id, username: u.username, type: 'user' }); });
  }

  const existingGroups = new Set(props.form.groupMembers.map((m) => m.groupId));
  const availableGroups = props.groups.filter((g) => !existingGroups.has(g.id));
  if (availableGroups.length) {
    options.push({ label: 'Groups', separator: true });
    availableGroups.forEach((g) => { options.push({ id: `group:${g.id}`, label: g.name, groupId: g.id, type: 'group' }); });
  }

  return options;
});

function roleLabel(role) {
  return roleOptions.find((o) => o.value === role)?.label || role;
}

function onAddMember() {
  const id = props.form.newMember;
  const role = props.form.newMemberRole;
  if (!id || !role) return;

  const option = memberOptions.value.find((o) => o.id === id);
  if (!option) return;

  if (option.type === 'user') {
    if (props.form.members.some((m) => m.userId === option.userId)) return;
    props.form.members.push({ userId: option.userId, username: option.username, role });
  } else {
    if (props.form.groupMembers.some((m) => m.groupId === option.groupId)) return;
    props.form.groupMembers.push({ groupId: option.groupId, role, name: option.label });
  }

  props.form.newMember = '';
  props.form.newMemberRole = ROLES.EDITOR;
}

function onRemoveMember(index) {
  const member = props.form.members[index];
  if (!member || member.userId === profile.value?.id) return;
  props.form.members.splice(index, 1);
}

function onRemoveGroupMember(index) {
  props.form.groupMembers.splice(index, 1);
}

</script>

<template>
  <FormGroup>
    <label>Members</label>
    <ListItem v-for="{ member, index } in visibleMembers" :key="`u-${member.userId}`">
      <template #left>
        <i class="fa-solid fa-circle-user item-icon"></i>
      </template>
      <template #label>
        <div class="member-label-row">
          <span>{{ member.username }}</span>
          <span v-if="member.userId === profile?.id" class="member-self-role">{{ roleLabel(member.role) }} (you)</span>
          <span v-else-if="member.active === false">
            <Button icon="fa-solid fa-xmark" outline tool @click="onRemoveMember(index)" />
          </span>
          <span v-else class="member-role-controls">
            <SingleSelect v-model="member.role" :options="roleOptions" option-key="value" style="width: 120px;" />
            <Button icon="fa-solid fa-xmark" outline tool @click="onRemoveMember(index)" />
          </span>
        </div>
      </template>
    </ListItem>
    <ListItem v-for="(member, index) in form.groupMembers" :key="`g-${member.groupId}`">
      <template #left>
        <i class="fa-solid fa-user-group item-icon"></i>
      </template>
      <template #label>
        <div class="member-label-row">
          <span>{{ member.name || groupNameById[member.groupId] || member.groupId }}</span>
          <span v-if="member.active === false">
            <Button icon="fa-solid fa-xmark" outline tool @click="onRemoveGroupMember(index)" />
          </span>
          <span v-else class="member-role-controls">
            <SingleSelect v-model="member.role" :options="roleOptions" option-key="value" style="width: 120px;" />
            <Button icon="fa-solid fa-xmark" outline tool @click="onRemoveGroupMember(index)" />
          </span>
        </div>
      </template>
    </ListItem>
    <div class="add-member-row">
      <SingleSelect v-model="form.newMember" :options="memberOptions" option-key="id" option-label="label" placeholder="Select user or group" style="flex-grow: 1;" />
      <SingleSelect v-model="form.newMemberRole" :options="roleOptions" option-key="value" style="width: 120px;" />
      <Button icon="fa-solid fa-plus" outline :disabled="!form.newMember" @click="onAddMember()">Add</Button>
    </div>
  </FormGroup>
</template>

<style scoped>

.item-icon {
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
