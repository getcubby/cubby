<script setup>

import { ref, inject, onMounted } from 'vue';
import UsersSettings from './settings/UsersSettings.vue';
import GroupFoldersSettings from './settings/GroupFoldersSettings.vue';
import OfficeIntegrationSettings from './settings/OfficeIntegrationSettings.vue';
import MainModel from '../models/MainModel.js';

const profile = inject('profile');

const emit = defineEmits(['groupfolders-changed']);

const users = ref([]);
const usersBusy = ref(true);

async function refreshUsers() {
  usersBusy.value = true;

  try {
    users.value = await MainModel.getUsers();
  } catch (error) {
    console.error('Failed to list users.', error);
  }

  usersBusy.value = false;
}

async function onUsersChanged() {
  await refreshUsers();
}

onMounted(async () => {
  await refreshUsers();
});

</script>

<template>
  <div class="settings-container">
    <div class="settings-scroll">
      <div class="settings-content content">
        <h1 class="settings-page-header">Settings</h1>

        <UsersSettings :profile="profile" :users="users" :busy="usersBusy" @users-changed="onUsersChanged" />
        <GroupFoldersSettings :users="users" @groupfolders-changed="emit('groupfolders-changed')" />
        <OfficeIntegrationSettings />
      </div>
    </div>
  </div>
</template>

<style scoped>

.settings-container {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 100%;
  flex-grow: 1;
  min-height: 0;
}

.settings-scroll {
  overflow: auto;
  flex-grow: 1;
}

.settings-content.content {
  max-width: 900px;
  width: 100%;
  margin: 0 auto;
  padding: 0 15px 30px;
  box-sizing: border-box;
}

.settings-page-header {
  margin-top: 18px;
  margin-bottom: 18px;
  font-size: 20px;
  font-weight: var(--pankow-font-weight-bold);
}

</style>
