<template>
  <div class="settings-container">
    <InputDialog ref="settingsInputDialog" />

    <Dialog title="Add Group Folder" ref="addGroupFolderDialog" reject-label="Cancel" confirm-label="Add" confirm-style="success" @confirm="onAddGroupFolderSubmit">
      <label>Name</label>
      <TextInput :model="groupFolderAdd.name" style="width: 100%;"/>
      <label>Path</label>
      <TextInput :model="groupFolderAdd.folderPath" placeholder="Absolute path or leave empty for default" style="width: 100%;" />
      <label>Members</label>
      <Button v-for="member in groupFolderAdd.members" :key="member.username" outline small danger icon="fa-solid fa-xmark" @click="groupFolderAddRemoveMember(member)">{{ member.username }}</Button>
      <Button v-show="groupFolderAdd.members.length < groupFolderAdd.availableUsersMenuModel.length" outline small :menu="groupFolderAdd.availableUsersMenuModel">Add member</Button>
    </Dialog>

    <h1>Group Folders <Button outline icon="fa-solid fa-plus" @click="onAddGroupFolder()">Add</Button></h1>
    <TableView style="max-height: 200px;" :columns="groupFolderTableColumns" :model="groupFolderTableModel" placeholder="No Group Folders yet">
      <template #folderPath="slotProps">...{{ slotProps.folderPath.slice(-20) }} </template>
      <template #members="slotProps">{{ slotProps.members.join(', ').slice(-16) }} </template>
      <template #action="slotProps">
        <div style="text-align: right;">
          <Button text="Edit" outline small @click="onEditGroupFolder(slotProps)" />
          <Button text="Remove" danger outline small @click="onRemoveGroupFolder(slotProps)" />
        </div>
      </template>
    </TableView>
    <!-- <h1>Office Integration</h1> -->
  </div>
</template>

<script>

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ? import.meta.env.VITE_API_ORIGIN : '';

import { createMainModel } from '../models/MainModel.js';
import { createGroupFolderModel } from '../models/GroupFolderModel.js';

import { Button, Checkbox, Dialog, Dropdown, InputDialog, TableView, TextInput } from 'pankow';

const mainModel = createMainModel(API_ORIGIN);
const groupFolderModel = createGroupFolderModel(API_ORIGIN);

export default {
    name: 'SettingsView',
    components: {
      Button,
      Checkbox,
      Dialog,
      Dropdown,
      InputDialog,
      TableView,
      TextInput
    },
    props: {
      profile: {
        type: Object,
        default: function () { return {}; }
      }
    },
    data() {
      return {
        users: [],
        groupFolderTableColumns: {
          name: {
            label: 'Name',
            sort: true
          },
          folderPath: {
            label: 'Path',
            sort: true
          },
          members: {
            label: 'Members',
            sort: false
          },
          action: {
            label: '',
            sort: false
          }
        },
        groupFolderTableModel: [],
        groupFolderAdd: {
          availableUsersMenuModel: [],
          name: '',
          folderPath: '',
          members: []
        }
      };
    },
    async mounted() {
      await this.refreshGroupFolder();
      this.users = await mainModel.getUsers();
    },
    methods: {
      async refreshGroupFolder() {
        try {
          this.groupFolderTableModel = await groupFolderModel.list();
        } catch (error) {
          console.error('Failed to list groupFolder.', error);
        }
      },
      async onAddGroupFolder() {
        this.groupFolderAdd.name = '';
        this.groupFolderAdd.members = [];
        this.groupFolderAdd.folderPath = '';
        this.groupFolderAdd.availableUsersMenuModel = []
        for (const user of this.users) {
          const item = {
            label: user.username,
            visible: () => { return !this.groupFolderAdd.members.find((m) => m.username === user.username) },
            action: () => { this.groupFolderAdd.members.push(user) }
          };
          this.groupFolderAdd.availableUsersMenuModel.push(item);
        }

        this.$refs.addGroupFolderDialog.open();
      },
      groupFolderAddRemoveMember(member) {
        const index = this.groupFolderAdd.members.findIndex((m) => m.username === member.username);
        this.groupFolderAdd.members.splice(index, 1);
      },
      async onAddGroupFolderSubmit() {
        this.$refs.addGroupFolderDialog.close();
      },
      onEditGroupFolder(groupFolder) {
        console.log('edit', groupFolder);
      },
      async onRemoveGroupFolder(groupFolder) {
        const yes = await this.$refs.settingsInputDialog.confirm({
          message: `Really remove group folder ${groupFolder.name}?`,
          confirmStyle: 'danger',
          confirmLabel: 'Yes',
          rejectLabel: 'No'
        });

        if (!yes) return;

        console.log('remove', groupFolder);
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
