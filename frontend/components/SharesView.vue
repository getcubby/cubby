<script setup>

import { ref, useTemplateRef, onMounted } from 'vue';
import ShareModel from '../models/ShareModel.js';
import ProfileMenuButton from './ProfileMenuButton.vue';
import { Button, Icon, InputDialog, TableView, TopBar } from '@cloudron/pankow';
import { prettyDate, prettyLongDate } from '@cloudron/pankow/utils';
import moment from 'moment';

const props = defineProps({
  profile: {
    type: Object,
    default: function () { return {}; }
  },
  profileMenu: {
    type: Array,
    default: () => [],
  },
});

defineEmits(['login']);

const tableColumns = {
  icon: {
    label: '',
    width: '35px',
    sort: false
  },
  target: {
    label: 'Path',
    sort: true
  },
  receiver: {
    label: 'With',
    sort: true
  },
  createdAt: {
    label: 'Created at',
    sort: (a, b) => moment(a).isBefore(moment(b)) ? 1 : -1,
  },
  action: {
    label: '',
    sort: false
  }
};

const sharesInputDialog = useTemplateRef('sharesInputDialog');

const users = ref([]);
const edit = ref({
  admin: false,
  user: {}
});
const tableModel = ref([]);

async function refresh() {
  tableModel.value = await ShareModel.list();

  // set properties for sorting the table
  tableModel.value.forEach((s) => {
    s.target = s.file.filePath.toLowerCase();
    s.receiver = s.receiverUsername || 'zzzzzzzzz'; // poor mans sorting fallback for empty string
  });
}

async function onDelete(share) {
  const yes = await sharesInputDialog.value.confirm({
    message: `Delete share "${share.file.fileName}"?`,
    confirmStyle: 'danger',
    confirmLabel: 'Delete',
    rejectLabel: 'Cancel',
    rejectStyle: 'secondary'
  });

  if (!yes) return;

  try {
    await ShareModel.remove(share.id);
  } catch (e) {
    return console.error('Failed to delete share.', e);
  }

  await refresh();
}

onMounted(refresh);

</script>

<template>
  <div class="shares">
    <InputDialog ref="sharesInputDialog" />

    <TopBar :left-grow="true">
      <template #right>
        <ProfileMenuButton :profile="profile" :menu="profileMenu" @login="$emit('login')" />
      </template>
    </TopBar>

    <div class="shares-body">
      <h1>Shared by you</h1>

    <TableView :columns="tableColumns" :model="tableModel" default-sort-by="target" placeholder="Nothing shared by you">
      <template #icon="{ item:slotProps }"><img :src="slotProps.file.previewUrl" width="32" height="32" style="object-fit: cover;" /></template>
      <template #target="{ item:slotProps }">
        {{ slotProps.file.filePath.slice(1) }}
      </template>
      <template #receiver="{ item:slotProps }">
        <Icon icon="fa-solid fa-link" v-show="!slotProps.receiverUsername"/>
        <Icon icon="fa-regular fa-user" v-show="slotProps.receiverUsername"/>
        {{ slotProps.receiverUsername }}
      </template>
      <template #createdAt="{ item:slotProps }"><span v-tooltip.top="prettyLongDate(slotProps.createdAt)">{{ prettyDate(slotProps.createdAt) }}</span></template>
      <template #action="{ item:slotProps }">
        <Button danger outline tool @click="onDelete(slotProps)" style="float: right" icon="fa-solid fa-trash"/>
      </template>
    </TableView>
    <div class="share-count">{{ tableModel.length }} shares</div>
    </div>
  </div>
</template>

<style scoped>

h1 {
  font-size: 20px;
  font-weight: normal;
}

.shares {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 100%;
}

.shares-body {
  padding: 0 20px;
  overflow: auto;
  flex-grow: 1;
}

.share-count {
  margin-top: 10px;
}

</style>
