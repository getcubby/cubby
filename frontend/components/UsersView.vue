<template>
  <div>
    <TopBar :gap="false">
      <template #left>
        <span style="font-size: 24px;">Users</span>
      </template>

      <template #right>
        <Button icon="fa-solid fa-plus">Add User</Button>

        <div style="margin-left: 50px;">
          <Button v-show="profile" icon="fa-regular fa-user" secondary :menu="mainMenu">{{ profile.displayName }}</Button>
          <Button v-show="!profile" icon="fa-solid fa-arrow-right-to-bracket" secondary @click="onLogin">Login</Button>
        </div>
      </template>
    </TopBar>

    <div class="users-view">
      <div v-for="user in users">
        {{ user.username }} <span v-show="user.admin">(admin)</span>
      </div>
    </div>
  </div>
</template>

<script>

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ? import.meta.env.VITE_API_ORIGIN : '';

import { createMainModel } from '../models/MainModel.js';

import { Button, TopBar } from 'pankow';

export default {
    name: 'UsersView',
    components: {
      Button,
      TopBar
    },
    emits: [ 'login' ],
    props: {
      profile: {
        type: Object
      },
      mainMenu: {
        type: Array
      }
    },
    data() {
      return {
        apiOrigin: API_ORIGIN,
        mainModel: null,
        users: []
      };
    },
    methods: {
      onLogin() {
        this.$emit('login');
      }
    },
    async mounted() {
      this.mainModel = createMainModel(API_ORIGIN);

      this.users = await this.mainModel.getUsers();
    }
};

</script>

<style scoped>

.users-view {
  padding: 20px;
}

</style>
