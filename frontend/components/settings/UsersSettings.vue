<script setup>

import { ref, computed, watch, useTemplateRef } from 'vue';
import { Checkbox, Dialog, TableView, TableViewActionBar, TextInput } from '@cloudron/pankow';
import Section from '../Section.vue';
import MainModel from '../../models/MainModel.js';

const props = defineProps({
  profile: {
    type: Object,
    default: () => ({}),
  },
  users: {
    type: Array,
    default: () => [],
  },
  busy: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['users-changed']);

const tableColumns = {
  username: {
    label: 'Username',
    sort: true,
  },
  email: {
    label: 'Email',
    sort: true,
  },
  admin: {
    label: 'Admin',
    sort: true,
  },
  action: {
    label: '',
    width: '100px',
    sort: false,
  },
};

const editDialog = useTemplateRef('editDialog');
const deleteDialog = useTemplateRef('deleteDialog');
const tableModel = ref([]);
const searchQuery = ref('');
const edit = ref({
  admin: false,
  user: {},
});
const remove = ref({
  busy: false,
  user: {},
});

watch(() => props.users, (users) => {
  tableModel.value = users;
}, { immediate: true });

const filteredTableModel = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return tableModel.value;
  return tableModel.value.filter((u) => {
    const username = (u.username || '').toLowerCase();
    const email = (u.email || '').toLowerCase();
    return username.includes(q) || email.includes(q);
  });
});

const tablePlaceholder = computed(() => {
  if (tableModel.value.length === 0) return 'No users';
  if (searchQuery.value.trim() && filteredTableModel.value.length === 0) return 'No matching users';
  return '';
});

function onEdit(user) {
  edit.value.admin = user.admin;
  edit.value.user = user;
  editDialog.value.open();
}

async function onEditSubmit() {
  try {
    await MainModel.setAdmin(edit.value.user.username, edit.value.admin);
  } catch (e) {
    return console.error(e);
  }

  emit('users-changed');
  editDialog.value.close();
}

function onRemove(user) {
  remove.value.busy = false;
  remove.value.user = user;
  deleteDialog.value.open();
}

async function onRemoveSubmit() {
  remove.value.busy = true;

  try {
    await MainModel.removeUser(remove.value.user.username);
  } catch (e) {
    remove.value.busy = false;
    return console.error('Failed to remove user.', e);
  }

  emit('users-changed');
  remove.value.busy = false;
  deleteDialog.value.close();
}

</script>

<template>
  <Section title="Users">
    <template #header-title-extra>
      <span class="section-count">({{ busy ? '-' : tableModel.length }})</span>
    </template>
    <template #filter-bar>
      <TextInput v-model="searchQuery" placeholder="Search users..." style="flex-grow: 1; min-width: 120px;"/>
    </template>

    <Dialog
      :title="`Edit user ${edit.user.username}`"
      ref="editDialog"
      reject-label="Cancel"
      reject-style="secondary"
      confirm-label="Save"
      confirm-style="success"
      @confirm="onEditSubmit"
    >
      <Checkbox v-model="edit.admin" required :disabled="edit.user.username === profile.username" label="Admin"/>
    </Dialog>

    <Dialog
      title="Delete user"
      ref="deleteDialog"
      reject-label="Cancel"
      reject-style="secondary"
      confirm-label="Delete"
      confirm-style="danger"
      :confirm-busy="remove.busy"
      @confirm="onRemoveSubmit"
    >
      <p>Delete user "{{ remove.user.username }}" and all their files? This cannot be undone.</p>
    </Dialog>

    <TableView :columns="tableColumns" :model="filteredTableModel" :busy="busy" :placeholder="tablePlaceholder">
      <template #username="{ item: slotProps }">{{ slotProps.username }}</template>
      <template #email="{ item: slotProps }">{{ slotProps.email }}</template>
      <template #admin="{ item: slotProps }"><i class="fa-solid fa-check" v-show="slotProps.admin"></i></template>
      <template #action="{ item: slotProps }">
        <TableViewActionBar
          :actions="[{
            label: 'Edit',
            icon: 'fa-solid fa-wrench',
            action: () => onEdit(slotProps),
            quickAction: true,
            visible: slotProps.username !== profile.username,
          }, {
            label: 'Remove',
            icon: 'fa-solid fa-trash',
            action: () => onRemove(slotProps),
            quickAction: true,
            visible: slotProps.username !== profile.username,
          }]"
        />
      </template>
    </TableView>
  </Section>
</template>

<style scoped>

.section-count {
  font-weight: normal;
  font-size: 14px;
}

</style>
