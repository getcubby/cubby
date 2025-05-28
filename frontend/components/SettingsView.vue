<script setup>

import { ref, useTemplateRef, onMounted, inject } from 'vue';
import { Button, ButtonGroup, Dialog, InputDialog, TableView, TextInput, InputGroup } from 'pankow';
import MainModel from '../models/MainModel.js';
import GroupFolderModel from '../models/GroupFolderModel.js';
import slugify from '../slugify.js';

const props = defineProps({
  profile: {
    type: Object,
    default: function () { return {}; }
  },
});

const emit = defineEmits(['groupfolders-changed']);

const refreshConfig = inject('refreshConfig');

const groupFolderTableColumns = {
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
    width: '20px',
    sort: false
  }
};

const addGroupFolderDialog = useTemplateRef('addGroupFolderDialog');
const editGroupFolderDialog = useTemplateRef('editGroupFolderDialog');
const settingsInputDialog = useTemplateRef('settingsInputDialog');

const users = ref([]);
const office = ref({
  error: '',
  busy: false,
  wopiHost: '',
});
const isOfficeWorking = ref(false);
const groupFolderTableModel = ref([]);
const groupFolderAdd = ref({
  error: '',
  busy: false,
  availableUsersMenuModel: [],
  name: '',
  slug: '',
  folderPath: '',
  members: [],
});
const groupFolderEdit = ref({
  error: '',
  busy: false,
  availableUsersMenuModel: [],
  name: '',
  members: [],
});

async function refreshGroupFolders() {
  try {
    groupFolderTableModel.value = await GroupFolderModel.list();
  } catch (error) {
    console.error('Failed to list groupFolder.', error);
  }

  emit('groupfolders-changed');
}

// helper for member add/edit
function groupFolderRemoveMember(members, member) {
  const index = members.findIndex((m) => m.username === member.username);
  members.splice(index, 1);
}

async function onAddGroupFolder() {
  groupFolderAdd.value.busy = false;
  groupFolderAdd.value.error = '';
  groupFolderAdd.value.name = '';
  groupFolderAdd.value.slug = '';
  groupFolderAdd.value.members = [];
  groupFolderAdd.value.folderPath = '';
  groupFolderAdd.value.availableUsersMenuModel = []
  for (const user of users.value) {
    const item = {
      label: user.username,
      visible: () => { return !groupFolderAdd.value.members.find((m) => m.username === user.username) },
      action: () => { groupFolderAdd.value.members.push(user) }
    };
    groupFolderAdd.value.availableUsersMenuModel.push(item);
  }

  addGroupFolderDialog.value.open();
}

async function onAddGroupFolderSubmit() {
  groupFolderAdd.value.busy = true;

  try {
    await GroupFolderModel.add({
      name: groupFolderAdd.value.name,
      slug: groupFolderAdd.value.slug,
      path: groupFolderAdd.value.folderPath,
      members: groupFolderAdd.value.members.map((m) => m.username)
    });
  } catch (e) {
    console.log(e)
    groupFolderAdd.value.error = e.message;
    groupFolderAdd.value.busy = false;
    return;
  }

  await refreshGroupFolders();

  groupFolderAdd.value.busy = false;
  addGroupFolderDialog.value.close();
}

function onEditGroupFolder(groupFolder) {
  groupFolderEdit.value.busy = false;
  groupFolderEdit.value.error = '';
  groupFolderEdit.value.id = groupFolder.id;
  groupFolderEdit.value.name = groupFolder.name;
  groupFolderEdit.value.members = groupFolder.members.map((m) => users.value.find((u) => u.username === m) );
  groupFolderEdit.value.availableUsersMenuModel = []
  for (const user of users.value) {
    const item = {
      label: user.username,
      visible: () => { return !groupFolderEdit.value.members.find((m) => m.username === user.username) },
      action: () => { groupFolderEdit.value.members.push(user) }
    };
    groupFolderEdit.value.availableUsersMenuModel.push(item);
  }

  editGroupFolderDialog.value.open();
}

async function onEditGroupFolderSubmit() {
  groupFolderEdit.value.busy = true;

  try {
    await GroupFolderModel.update(groupFolderEdit.value.id, {
      name: groupFolderEdit.value.name,
      members: groupFolderEdit.value.members.map((m) => m.username)
    });
  } catch (e) {
    console.log(e)
    groupFolderEdit.value.error = e.message;
    groupFolderEdit.value.busy = false;
    return;
  }

  await refreshGroupFolders();

  groupFolderEdit.value.busy = false;
  editGroupFolderDialog.value.close();
}

async function onRemoveGroupFolder(groupFolder) {
  const yes = await settingsInputDialog.value.confirm({
    message: `Really remove group folder ${groupFolder.name}?`,
    confirmStyle: 'danger',
    confirmLabel: 'Yes',
    rejectLabel: 'No'
  });

  if (!yes) return;

  try {
    await GroupFolderModel.remove(groupFolder.id);
  } catch (e) {
    return console.error('Failed to delete groupFolder.', e);
  }

  await refreshGroupFolders();
}

async function onOfficeSubmit() {
  office.value.busy = true;

  try {
    await MainModel.setWopiHost(office.value.wopiHost);
  } catch (error) {
    office.value.error = error.message;
    office.value.busy = false;
    isOfficeWorking.value = false;
    return;
  }

  office.value.error = '';

  try {
    office.value.wopiHost = await MainModel.getWopiHost();
  } catch (error) {
    office.value.wopiHost = ''
    office.value.error = error.message;
  }

  await refreshConfig();

  isOfficeWorking.value = MainModel.isOfficeWorking();

  office.value.busy = false;
}

onMounted(async () => {
  users.value = await MainModel.getUsers();

  await refreshGroupFolders();

  office.value.error = '';
  office.value.confirmBusy = false;

  try {
    office.value.wopiHost = await MainModel.getWopiHost();
    isOfficeWorking.value = MainModel.isOfficeWorking();
  } catch (error) {
    office.value.wopiHost = ''
    office.value.error = error.message;
    console.log('Failed to get wopi host:', error);
  }
});

</script>

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
      <div style="display: flex; gap: 6px">
        <Button v-for="member in groupFolderAdd.members" :key="member.username" outline small danger icon="fa-solid fa-xmark" @click="groupFolderRemoveMember(groupFolderAdd.members, member)">{{ member.username }}</Button>
        <Button v-show="groupFolderAdd.members.length < groupFolderAdd.availableUsersMenuModel.length" outline small :menu="groupFolderAdd.availableUsersMenuModel">Add member</Button>
      </div>
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
      <div style="display: flex; gap: 6px">
        <Button v-for="member in groupFolderEdit.members" :key="member.username" outline small danger icon="fa-solid fa-xmark" @click="groupFolderRemoveMember(groupFolderEdit.members, member)">{{ member.username }}</Button>
        <Button v-show="groupFolderEdit.members.length < groupFolderEdit.availableUsersMenuModel.length" outline small :menu="groupFolderEdit.availableUsersMenuModel">Add member</Button>
      </div>
    </Dialog>

    <h1>Settings</h1>

    <h2>Group Folders <Button icon="fa-solid fa-plus" @click="onAddGroupFolder()">Add</Button></h2>
    <TableView :columns="groupFolderTableColumns" :model="groupFolderTableModel" placeholder="No Group Folders yet">
      <template #folderPath="slotProps">{{ slotProps.folderPath }} </template>
      <template #members="slotProps">{{ slotProps.members.join(', ') }} </template>
      <template #action="slotProps">
        <ButtonGroup>
          <Button outline small tool @click="onEditGroupFolder(slotProps)">Edit</Button>
          <Button danger outline small tool @click="onRemoveGroupFolder(slotProps)">Remove</Button>
        </ButtonGroup>
      </template>
    </TableView>

    <h2>Office Integration</h2>
    <p>
      Cubby can open office documents acting as a <a href="https://en.wikipedia.org/wiki/Web_Application_Open_Platform_Interface" target="_blank">WOPI host</a>.
      Currently this is tested with Collabora and OnlyOffice installed on Cloudron.
    </p>
    <form @submit="onOfficeSubmit" @submit.prevent>
      <label for="wopiHostnameInput">WOPI hostname:</label>
      <InputGroup>
        <TextInput id="wopiHostnameInput" v-model="office.wopiHost" autofocus placeholder="https://office.domain.com" style="width: 100%; max-width: 300px" />
        <Button id="wopiHostnameSubmitButtom" type="submit" @click="onOfficeSubmit" :loading="office.busy" tool>Save</Button>
      </InputGroup>
      <br/>
      <small class="has-error" v-show="office.error">{{ office.error }}</small>
    </form>
    <div v-if="isOfficeWorking"><i class="fa-solid fa-check"></i> Working and set up.</div>
  </div>
</template>

<style scoped>

.settings-container {
  padding: 0 20px;
}

h1 {
  font-size: 20px;
  font-weight: normal;
}

h2 {
  font-size: 18px;
  font-weight: normal;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-top: 30px;
}

</style>
