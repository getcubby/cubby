<template>
  <div class="settings-container">
    <InputDialog ref="settingsInputDialog" />

    <Dialog
      title="Add Group Folder"
      ref="addGroupFolderDialog"
      reject-label="Cancel"
      confirm-label="Add"
      :confirm-busy="groupFolderAdd.busy"
      :confirm-active="!!groupFolderAdd.name"
      confirm-style="success"
      @confirm="onAddGroupFolderSubmit"
    >
      <p class="has-error" v-show="groupFolderAdd.error">{{ groupFolderAdd.error }}</p>
      <label>Name</label>
      <TextInput v-model="groupFolderAdd.name" style="width: 100%;" @change="groupFolderAdd.slug = slugify(groupFolderAdd.name)"/>
      <label>Slug (cannot be changed later)</label>
      <TextInput v-model="groupFolderAdd.slug" placeholder="Optional slug for prettier URLs" style="width: 100%;" />
      <label v-show="false">Disk Storage Path</label>
      <TextInput v-show="false" v-model="groupFolderAdd.folderPath" placeholder="Absolute path or leave empty for default" style="width: 100%;" />
      <label>Members</label>
      <Button v-for="member in groupFolderAdd.members" :key="member.username" outline small danger icon="fa-solid fa-xmark" @click="groupFolderRemoveMember(groupFolderAdd.members, member)">{{ member.username }}</Button>
      <Button v-show="groupFolderAdd.members.length < groupFolderAdd.availableUsersMenuModel.length" outline small :menu="groupFolderAdd.availableUsersMenuModel">Add member</Button>
    </Dialog>

    <Dialog
      :title="`Edit Group Folder ${groupFolderEdit.id}`"
      ref="editGroupFolderDialog"
      reject-label="Cancel"
      confirm-label="Save"
      :confirm-busy="groupFolderEdit.busy"
      :confirm-active="!!groupFolderEdit.name"
      confirm-style="success"
      @confirm="onEditGroupFolderSubmit"
    >
      <p class="has-error" v-show="groupFolderEdit.error">{{ groupFolderEdit.error }}</p>
      <label>Name</label>
      <TextInput v-model="groupFolderEdit.name" style="width: 100%;" />
      <label>Members</label>
      <Button v-for="member in groupFolderEdit.members" :key="member.username" outline small danger icon="fa-solid fa-xmark" @click="groupFolderRemoveMember(groupFolderEdit.members, member)">{{ member.username }}</Button>
      <Button v-show="groupFolderEdit.members.length < groupFolderEdit.availableUsersMenuModel.length" outline small :menu="groupFolderEdit.availableUsersMenuModel">Add member</Button>
    </Dialog>

    <h1>Group Folders <Button icon="fa-solid fa-plus" @click="onAddGroupFolder()">Add</Button></h1>
    <TableView :columns="groupFolderTableColumns" :model="groupFolderTableModel" placeholder="No Group Folders yet">
      <template #folderPath="slotProps">{{ slotProps.folderPath }} </template>
      <template #members="slotProps">{{ slotProps.members.join(', ').slice(-16) }} </template>
      <template #action="slotProps">
        <div style="text-align: right;">
          <Button text="Edit" outline small @click="onEditGroupFolder(slotProps)" />
          <Button text="Remove" danger outline small @click="onRemoveGroupFolder(slotProps)" />
        </div>
      </template>
    </TableView>

    <h1>Office Integration</h1>
    <p>
      Cubby can open office documents acting as a <a href="https://en.wikipedia.org/wiki/Web_Application_Open_Platform_Interface" target="_blank">WOPI host</a>.
      Currently this is tested with Collabora and OnlyOffice installed on Cloudron.
    </p>
    <form @submit="onOfficeSubmit" @submit.prevent>
      <label for="wopiHostnameInput">WOPI hostname:</label>
      <TextInput id="wopiHostnameInput" v-model="office.wopiHost" autofocus placeholder="https://office.domain.com" style="width: 100%; max-width: 300px" />
      <Button id="wopiHostnameSubmitButtom" type="submit" @click="onOfficeSubmit" :loading="office.busy">Save</Button>
      <br/>
      <small class="has-error" v-show="office.error">{{ office.error }}</small>
    </form>
  </div>
</template>

<script>

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ? import.meta.env.VITE_API_ORIGIN : '';

import { DirectoryModelError } from '../models/DirectoryModel.js';
import { createMainModel } from '../models/MainModel.js';
import { createGroupFolderModel } from '../models/GroupFolderModel.js';

import { Button, Dialog, InputDialog, TableView, TextInput } from 'pankow';

import slugify from '../slugify.js';

const mainModel = createMainModel(API_ORIGIN);
const groupFolderModel = createGroupFolderModel(API_ORIGIN);

export default {
    name: 'SettingsView',
    components: {
      Button,
      Dialog,
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
          id: {
            label: 'Slug',
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
        office: {
          error: '',
          busy: false,
          wopiHost: ''
        },
        groupFolderTableModel: [],
        groupFolderAdd: {
          error: '',
          busy: false,
          availableUsersMenuModel: [],
          name: '',
          slug: '',
          folderPath: '',
          members: []
        },
        groupFolderEdit: {
          error: '',
          busy: false,
          availableUsersMenuModel: [],
          name: '',
          members: []
        }
      };
    },
    async mounted() {
    },
    methods: {
      slugify,
      async open() {
        if (!this.profile.admin) return false;

        this.users = await mainModel.getUsers();

        await this.refreshGroupFolders();

        this.office.error = '';
        this.office.confirmBusy = false;

        try {
          this.office.wopiHost = await mainModel.getWopiHost();
        } catch (error) {
          this.office.wopiHost = ''
          this.office.error = error.message;
          console.log('Failed to get wopi host:', error);
        }

        return true;
      },
      async refreshGroupFolders() {
        try {
          this.groupFolderTableModel = await groupFolderModel.list();
        } catch (error) {
          console.error('Failed to list groupFolder.', error);
        }
      },
      // helper for member add/edit
      groupFolderRemoveMember(members, member) {
        const index = members.findIndex((m) => m.username === member.username);
        members.splice(index, 1);
      },
      async onAddGroupFolder() {
        this.groupFolderAdd.busy = false;
        this.groupFolderAdd.error = '';
        this.groupFolderAdd.name = '';
        this.groupFolderAdd.slug = '';
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
      async onAddGroupFolderSubmit() {
        this.groupFolderAdd.busy = true;

        try {
          await groupFolderModel.add({
            name: this.groupFolderAdd.name,
            slug: this.groupFolderAdd.slug,
            path: this.groupFolderAdd.folderPath,
            members: this.groupFolderAdd.members.map((m) => m.username)
          });
        } catch (e) {
          console.log(e)
          this.groupFolderAdd.error = e.message;
          this.groupFolderAdd.busy = false;
          return;
        }

        await this.refreshGroupFolders();

        this.groupFolderAdd.busy = false;
        this.$refs.addGroupFolderDialog.close();
      },
      onEditGroupFolder(groupFolder) {
        this.groupFolderEdit.busy = false;
        this.groupFolderEdit.error = '';
        this.groupFolderEdit.id = groupFolder.id;
        this.groupFolderEdit.name = groupFolder.name;
        this.groupFolderEdit.members = groupFolder.members.map((m) => this.users.find((u) => u.username === m) );
        this.groupFolderEdit.availableUsersMenuModel = []
        for (const user of this.users) {
          const item = {
            label: user.username,
            visible: () => { return !this.groupFolderEdit.members.find((m) => m.username === user.username) },
            action: () => { this.groupFolderEdit.members.push(user) }
          };
          this.groupFolderEdit.availableUsersMenuModel.push(item);
        }

        this.$refs.editGroupFolderDialog.open();
      },
      async onEditGroupFolderSubmit() {
        this.groupFolderEdit.busy = true;

        try {
          await groupFolderModel.update(this.groupFolderEdit.id, {
            name: this.groupFolderEdit.name,
            members: this.groupFolderEdit.members.map((m) => m.username)
          });
        } catch (e) {
          console.log(e)
          this.groupFolderEdit.error = e.message;
          this.groupFolderEdit.busy = false;
          return;
        }

        await this.refreshGroupFolders();

        this.groupFolderEdit.busy = false;
        this.$refs.editGroupFolderDialog.close();
      },
      async onRemoveGroupFolder(groupFolder) {
        const yes = await this.$refs.settingsInputDialog.confirm({
          message: `Really remove group folder ${groupFolder.name}?`,
          confirmStyle: 'danger',
          confirmLabel: 'Yes',
          rejectLabel: 'No'
        });

        if (!yes) return;

        try {
          await groupFolderModel.remove(groupFolder.id);
        } catch (e) {
          return console.error('Failed to delete groupFolder.', e);
        }

        await this.refreshGroupFolders();
      },
      async onOfficeSubmit() {
        this.office.busy = true;

        try {
          await mainModel.setWopiHost(this.office.wopiHost);
        } catch (error) {
          this.office.error = error.message;
          this.office.busy = false;
          return;
        }

        this.office.error = '';

        try {
          this.office.wopiHost = await mainModel.getWopiHost();
        } catch (error) {
          this.office.wopiHost = ''
          this.office.error = error.message;
        }

        this.office.busy = false;
      }
    }
};

</script>

<style scoped>

.settings-container {
  padding: 20px;
}

h1 {
  font-size: 20px;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-top: 30px;
}

</style>
