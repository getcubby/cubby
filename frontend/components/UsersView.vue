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
      <template #action="slotProps"><Button text="Edit" small outline tool @click="onEdit(slotProps)" :disabled="slotProps.username === profile.username" style="float: right"/></template>
    </TableView>
    <div class="user-count">{{ tableModel.length }} Users</div>
  </div>
</template>

<script>

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ? import.meta.env.VITE_API_ORIGIN : '';

import { createMainModel } from '../models/MainModel.js';

import { Button, Checkbox, Dialog, TableView } from 'pankow';

export default {
    name: 'UsersView',
    components: {
      Button,
      Checkbox,
      Dialog,
      TableView
    },
    props: {
      profile: {
        type: Object,
        default: function () { return {}; }
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
        },
        tableColumns: {
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
        },
        tableModel: []
      };
    },
    async mounted() {
      this.mainModel = createMainModel(API_ORIGIN);
    },
    methods: {
      async open() {
        if (!this.profile.admin) return false;

        this.tableModel = await this.mainModel.getUsers();

        return true;
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

        this.tableModel = await this.mainModel.getUsers();

        this.$refs.editDialog.close();
      }
    }
};

</script>

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
