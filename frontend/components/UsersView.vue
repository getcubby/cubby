<template>
  <div>
    <Dialog :title="`Edit User ${edit.user.username}`" ref="editDialog" rejectLabel="Cancel" confirmLabel="Save" confirmStyle="success" @confirm="onEditSubmit">
      <Checkbox v-model="edit.admin" required :disabled="edit.user.username === profile.username" label="Admin"/>
    </Dialog>

    <TopBar :gap="false">
      <template #left>
        <span style="font-size: 24px;">Users</span>
      </template>

      <template #right>
        <!-- <Button icon="fa-solid fa-plus">Add User</Button> -->

        <div style="margin-left: 50px;">
          <Button v-show="profile" icon="fa-regular fa-user" secondary :menu="mainMenu">{{ profile.displayName }}</Button>
          <Button v-show="!profile" icon="fa-solid fa-arrow-right-to-bracket" secondary @click="onLogin">Login</Button>
        </div>
      </template>
    </TopBar>

    <div class="users-view">
      <div class="users-table">
        <div class="users-table-header">
          <div>Username</div>
          <div>Email</div>
          <div style="justify-content: center;">Admin</div>
          <div></div>
        </div>

        <div v-for="user in users" class="users-table-row">
          <div class="users-table-cell">{{ user.username }}</div>
          <div class="users-table-cell"><a :href="`mailto: ${user.email}`">{{ user.email }}</a></div>
          <div class="users-table-cell" style="justify-content: center;"><i class="fa-solid fa-check" v-show="user.admin"></i></div>
          <div class="users-table-cell" style="justify-content: right;"><Button text="Edit" small @click="onEdit(user)"/></div>
        </div>
      </div>
      <div>{{ users.length }} Users</div>
    </div>
  </div>
</template>

<script>

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ? import.meta.env.VITE_API_ORIGIN : '';

import { createMainModel } from '../models/MainModel.js';

import { Button, Checkbox, Dialog, TopBar } from 'pankow';

export default {
    name: 'UsersView',
    components: {
      Button,
      Checkbox,
      Dialog,
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
        users: [],
        edit: {
          admin: false,
          user: {}
        }
      };
    },
    methods: {
      onLogin() {
        this.$emit('login');
      },
      onEdit(user) {
        this.edit.admin = user.admin;
        this.edit.user = user;
        this.$refs.editDialog.open();
      },
      async onEditSubmit() {
        try {
          await this.mainModel.setAdmin(this.edit.user.username, this.edit.admin);
        } catch (e) {
          return console.error(e);
        }

        this.users = await this.mainModel.getUsers();
        this.$refs.editDialog.close();
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
  max-width: 1024px;
  padding: 20px;
}

.users-table {
  display: grid;
  grid-template-columns: auto auto 100px 100px;
  margin-bottom: 20px;
}

.users-table-header {
  display: contents;
}

.users-table-header > div {
  font-weight: bold;
  padding: 10px;
  display: flex;
}

.users-table-row {
  display: contents;
}

.users-table-row > div {
  padding: 10px;
  align-self: stretch;
  display: flex;
  align-items: center;
}

.users-table-row:hover > div {
  background: whitesmoke;
}

</style>
