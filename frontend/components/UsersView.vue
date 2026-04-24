<script setup>

import { ref, computed, onMounted, useTemplateRef } from 'vue';
import { Button, Checkbox, Dialog, TableView, TextInput } from '@cloudron/pankow';
import MainModel from '../models/MainModel.js';

const props = defineProps({
  profile: {
    type: Object,
    default: function () { return {}; }
  },
});

const tableColumns = {
  username: {
    label: 'Username',
    sort: true
  },
  email: {
    label: 'Email',
    sort: true
  },
  admin: {
    label: 'Admin',
    sort: true
  },
  action: {
    label: '',
    sort: false
  }
};

const users = ref([]);
const edit = ref({
  admin: false,
  user: {}
});

const editDialog = useTemplateRef('editDialog');
const tableModel = ref([]);
const searchQuery = ref('');

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

  tableModel.value = await MainModel.getUsers();

  editDialog.value.close();
}

onMounted(async () => {
  tableModel.value = await MainModel.getUsers();
});

</script>

<template>
  <div class="user-table-container">
    <Dialog :title="`Edit User ${edit.user.username}`" ref="editDialog" reject-label="Cancel" confirm-label="Save" confirm-style="success" @confirm="onEditSubmit">
      <Checkbox v-model="edit.admin" required :disabled="edit.user.username === profile.username" label="Admin"/>
    </Dialog>

    <div class="user-header">
      <h1>Users ({{ tableModel.length }})</h1>
      <TextInput v-model="searchQuery" placeholder="Search users..." class="user-search-input"/>
    </div>

    <div class="user-table-wrap">
      <TableView :columns="tableColumns" :model="filteredTableModel" :placeholder="tablePlaceholder">
        <template #username="{ item:slotProps }">{{ slotProps.username }}</template>
        <template #email="{ item:slotProps }">{{ slotProps.email }}</template>
        <template #admin="{ item:slotProps }"><i class="fa-solid fa-check" v-show="slotProps.admin"></i></template>
        <template #action="{ item:slotProps }">
          <Button outline tool @click="onEdit(slotProps)" :disabled="slotProps.username === profile.username" style="float: right" icon="fa-solid fa-wrench"/>
        </template>
      </TableView>
    </div>
  </div>
</template>

<style scoped>

.user-header {
  flex-shrink: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 12px;
  margin-bottom: 8px;
}

h1 {
  margin: 0;
  font-size: 20px;
  font-weight: normal;
}

.user-search-input {
  flex: 0 1 280px;
  max-width: 100%;
  min-width: 120px;
}

.user-table-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 0 20px;
}

.user-table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

</style>
