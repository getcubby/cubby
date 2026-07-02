<script setup>

import { ref, computed, onMounted, useTemplateRef } from 'vue';
import { Button, Dialog, FormGroup, InputDialog, MultiSelect, TableView, TableViewActionBar, TextInput } from '@cloudron/pankow';
import Section from '../Section.vue';
import GroupFolderModel from '../../models/GroupFolderModel.js';
import slugify from '../../slugify.js';

const props = defineProps({
  users: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(['groupfolders-changed']);

const groupFolderTableColumns = {
  name: {
    label: 'Name',
    sort: true,
  },
  id: {
    label: 'Slug',
    sort: true,
  },
  members: {
    label: 'Members',
    sort: false,
  },
  action: {
    label: '',
    width: '100px',
    sort: false,
  },
};

const addGroupFolderDialog = useTemplateRef('addGroupFolderDialog');
const editGroupFolderDialog = useTemplateRef('editGroupFolderDialog');
const settingsInputDialog = useTemplateRef('settingsInputDialog');

const groupFolderTableModel = ref([]);
const groupFoldersBusy = ref(true);
const groupFolderAdd = ref({
  error: '',
  busy: false,
  name: '',
  slug: '',
  folderPath: '',
  members: [],
});
const groupFolderEdit = ref({
  error: '',
  busy: false,
  name: '',
  members: [],
});

const userOptions = computed(() => props.users.map((u) => ({
  ...u,
  label: u.username || u.email,
})));

async function refreshGroupFolders() {
  groupFoldersBusy.value = true;

  try {
    groupFolderTableModel.value = await GroupFolderModel.list();
  } catch (error) {
    console.error('Failed to list groupFolder.', error);
  }

  groupFoldersBusy.value = false;
  emit('groupfolders-changed');
}

async function onAddGroupFolder() {
  groupFolderAdd.value.busy = false;
  groupFolderAdd.value.error = '';
  groupFolderAdd.value.name = '';
  groupFolderAdd.value.slug = '';
  groupFolderAdd.value.members = [];
  groupFolderAdd.value.folderPath = '';
  addGroupFolderDialog.value.open();
}

async function onAddGroupFolderSubmit() {
  groupFolderAdd.value.busy = true;

  try {
    await GroupFolderModel.add({
      name: groupFolderAdd.value.name,
      slug: groupFolderAdd.value.slug,
      path: groupFolderAdd.value.folderPath,
      members: groupFolderAdd.value.members,
    });
  } catch (e) {
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
  groupFolderEdit.value.members = [...groupFolder.members];
  editGroupFolderDialog.value.open();
}

async function onEditGroupFolderSubmit() {
  groupFolderEdit.value.busy = true;

  try {
    await GroupFolderModel.update(groupFolderEdit.value.id, {
      name: groupFolderEdit.value.name,
      members: groupFolderEdit.value.members,
    });
  } catch (e) {
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
    message: `Remove group folder "${groupFolder.name}"?`,
    confirmStyle: 'danger',
    confirmLabel: 'Remove',
    rejectLabel: 'Cancel',
    rejectStyle: 'secondary',
  });

  if (!yes) return;

  try {
    await GroupFolderModel.remove(groupFolder.id);
  } catch (e) {
    return console.error('Failed to delete groupFolder.', e);
  }

  await refreshGroupFolders();
}

defineExpose({ refreshGroupFolders });

onMounted(refreshGroupFolders);

</script>

<template>
  <Section title="Group folders">
    <template #header-buttons>
      <Button icon="fa-solid fa-plus" @click="onAddGroupFolder()">Add</Button>
    </template>

    <InputDialog ref="settingsInputDialog" />

    <Dialog
      title="Add group folder"
      ref="addGroupFolderDialog"
      reject-label="Cancel"
      reject-style="secondary"
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
      <label v-show="false">Disk storage path</label>
      <TextInput v-show="false" v-model="groupFolderAdd.folderPath" placeholder="Absolute path or leave empty for default" style="width: 100%;" />
      <FormGroup>
        <label>Members</label>
        <MultiSelect v-model="groupFolderAdd.members" :options="userOptions" option-key="username" :search-threshold="20" style="width: 100%;" />
      </FormGroup>
    </Dialog>

    <Dialog
      :title="`Edit group folder ${groupFolderEdit.id}`"
      ref="editGroupFolderDialog"
      reject-label="Cancel"
      reject-style="secondary"
      confirm-label="Save"
      :confirm-busy="groupFolderEdit.busy"
      :confirm-active="!!groupFolderEdit.name"
      confirm-style="success"
      @confirm="onEditGroupFolderSubmit"
    >
      <p class="has-error" v-show="groupFolderEdit.error">{{ groupFolderEdit.error }}</p>
      <label>Name</label>
      <TextInput v-model="groupFolderEdit.name" style="width: 100%;" />
      <FormGroup>
        <label>Members</label>
        <MultiSelect v-model="groupFolderEdit.members" :options="userOptions" option-key="username" :search-threshold="20" style="width: 100%;" />
      </FormGroup>
    </Dialog>

    <TableView :columns="groupFolderTableColumns" :model="groupFolderTableModel" :busy="groupFoldersBusy" placeholder="No group folders">
      <template #members="{ item: slotProps }">{{ slotProps.members.join(', ') }}</template>
      <template #action="{ item: slotProps }">
        <TableViewActionBar
          :actions="[{
            label: 'Edit',
            icon: 'fa-solid fa-pen',
            action: () => onEditGroupFolder(slotProps),
            quickAction: true,
          }, {
            label: 'Remove',
            icon: 'fa-solid fa-trash',
            action: () => onRemoveGroupFolder(slotProps),
            quickAction: true,
          }]"
        />
      </template>
    </TableView>
  </Section>
</template>
