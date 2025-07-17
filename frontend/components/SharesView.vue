<script setup>

import { ref, useTemplateRef, onMounted } from 'vue';
import ShareModel from '../models/ShareModel.js';
import { Button, Icon, InputDialog, TableView } from '@cloudron/pankow';
import { prettyDate, prettyLongDate } from '@cloudron/pankow/utils';
import moment from 'moment';

const props = defineProps({
  profile: {
    type: Object,
    default: function () { return {}; }
  }
});

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
    label: 'Created At',
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
    message: `Really delete share ${share.file.fileName}?`,
    confirmStyle: 'danger',
    confirmLabel: 'Yes',
    rejectLabel: 'No'
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

    <h1>Shared by You</h1>

    <TableView :columns="tableColumns" :model="tableModel" default-sort-by="target">
      <template #icon="slotProps"><img :src="slotProps.file.previewUrl" width="32" height="32" style="object-fit: cover;" /></template>
      <template #target="slotProps">
        {{ slotProps.file.filePath.slice(1) }}
      </template>
      <template #receiver="slotProps">
        <Icon icon="fa-solid fa-link" v-show="!slotProps.receiverUsername"/>
        <Icon icon="fa-regular fa-user" v-show="slotProps.receiverUsername"/>
        {{ slotProps.receiverUsername }}
      </template>
      <template #createdAt="slotProps"><span v-tooltip.top="prettyLongDate(slotProps.createdAt)">{{ prettyDate(slotProps.createdAt) }}</span></template>
      <template #action="slotProps">
        <Button danger small outline tool @click="onDelete(slotProps)" style="float: right">Delete</Button>
      </template>
    </TableView>
    <div class="share-count">{{ tableModel.length }} Shares</div>
  </div>
</template>

<style scoped>

h1 {
  font-size: 20px;
  font-weight: normal;
}

.shares {
  padding: 0 20px;
}

.share-count {
  margin-top: 10px;
}

</style>
