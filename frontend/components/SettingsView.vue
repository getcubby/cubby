<template>
  <div class="settings-container">
    <Dialog title="Add Group Folder" ref="addGroupFolderDialog" reject-label="Cancel" confirm-label="Add" confirm-style="success" @confirm="onAddGroupFolderSubmit">
      Some form to add a group folder
    </Dialog>

    <h1>Group Folders <Button outline icon="fa-solid fa-plus" @click="onAddGroupFolder()">Add</Button></h1>
    <TableView style="max-height: 200px;" :columns="groupFolderTableColumns" :model="groupFolderTableModel" placeholder="No Group Folders yet">
      <template #username="slotProps">{{ slotProps.username }}</template>
      <template #email="slotProps">{{ slotProps.email }}</template>
      <template #admin="slotProps"><i class="fa-solid fa-check" v-show="slotProps.admin"></i></template>
      <template #action="slotProps"><Button text="Edit" small @click="onEdit(slotProps)" style="float: right"/></template>
    </TableView>
    <!-- <h1>Office Integration</h1> -->
  </div>
</template>

<script>

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ? import.meta.env.VITE_API_ORIGIN : '';

import { createMainModel } from '../models/MainModel.js';
import { createGroupFolderModel } from '../models/GroupFolderModel.js';

import { Button, Checkbox, Dialog, TableView } from 'pankow';

const mainModel = createMainModel(API_ORIGIN);
const groupFolderModel = createGroupFolderModel(API_ORIGIN);

export default {
    name: 'SettingsView',
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
        groupFolderTableColumns: {
          name: {
            label: 'Name',
            sort: true
          },
          path: {
            label: 'Path',
            sort: true
          },
          action: {
            label: '',
            sort: false
          }
        },
        groupFolderTableModel: []
      };
    },
    async mounted() {
      await this.refreshGroupFolder();
    },
    methods: {
      async refreshGroupFolder() {
        try {
          this.groupFolderTableModel = await groupFolderModel.list();
        } catch (error) {
          console.error('Failed to list groupFolder.', error);
        }
      },
      onAddGroupFolder() {
        this.$refs.addGroupFolderDialog.open();
      },
      async onAddGroupFolderSubmit() {
        this.$refs.addGroupFolderDialog.close();
      }
    }
};

</script>

<style scoped>

.settings-container {
  max-width: 1024px;
  padding: 20px;
}

h1 {
  font-size: 16px;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

</style>
