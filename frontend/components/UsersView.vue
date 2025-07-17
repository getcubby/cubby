<script setup>

import { ref, onMounted, useTemplateRef } from 'vue';
import { Button, Checkbox, Dialog, TableView } from '@cloudron/pankow';
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

    <h1>Users</h1>

    <TableView style="max-height: 200px;" :columns="tableColumns" :model="tableModel">
      <template #username="slotProps">{{ slotProps.username }}</template>
      <template #email="slotProps">{{ slotProps.email }}</template>
      <template #admin="slotProps"><i class="fa-solid fa-check" v-show="slotProps.admin"></i></template>
      <template #action="slotProps"><Button small outline tool @click="onEdit(slotProps)" :disabled="slotProps.username === profile.username" style="float: right">Edit</Button></template>
    </TableView>
    <div class="user-count">{{ tableModel.length }} Users</div>
  </div>
</template>

<style scoped>

h1 {
  font-size: 20px;
  font-weight: normal;
}

.user-table-container {
  padding: 0 20px;
}

.user-count {
  margin-top: 10px;
}

</style>
