<script setup>

import { ref, computed, watch, useTemplateRef, onMounted } from 'vue';
import ShareModel from '../models/ShareModel.js';
import ProfileMenuButton from './ProfileMenuButton.vue';
import EmptyState from './EmptyState.vue';
import { Button, Icon, InputDialog, ProgressBar, TableView, TextInput, TopBar } from '@cloudron/pankow';
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
  initialSearch: {
    type: String,
    default: '',
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

const searchQuery = ref('');
const tableModel = ref([]);
const busy = ref(true);

watch(() => props.initialSearch, (value) => {
  searchQuery.value = value || '';
}, { immediate: true });

const filteredTableModel = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return tableModel.value;
  return tableModel.value.filter((s) => {
    const path = (s.file.filePath || '').toLowerCase();
    const pathDisplay = path.slice(1);
    const receiver = (s.receiverUsername || '').toLowerCase();
    return path.includes(q) || pathDisplay.includes(q) || receiver.includes(q);
  });
});

const tablePlaceholder = computed(() => {
  if (tableModel.value.length === 0) return '';
  if (searchQuery.value.trim() && filteredTableModel.value.length === 0) return 'No matching shares';
  return '';
});

async function refresh() {
  busy.value = true;

  tableModel.value = await ShareModel.list();

  tableModel.value.forEach((s) => {
    s.target = s.file.filePath.toLowerCase();
    s.receiver = s.receiverUsername || 'zzzzzzzzz';
  });

  busy.value = false;
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

    <div class="shares-body" :class="{ 'shares-body-empty': !busy && tableModel.length === 0 }">
      <ProgressBar v-if="busy" mode="indeterminate" :show-label="false" :slim="true" :show-track="false"/>
      <template v-else>
        <EmptyState
          v-if="tableModel.length === 0"
          icon="fa-solid fa-share-from-square"
          title="Nothing shared by you"
          description="Files and folders you share will show up here"
        />
        <template v-else>
          <TextInput v-model="searchQuery" placeholder="Search shares..." class="shares-search"/>

          <TableView :columns="tableColumns" :model="filteredTableModel" :placeholder="tablePlaceholder" default-sort-by="target">
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
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>

.shares {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 100%;
}

.shares-body {
  padding: 12px 20px 0;
  overflow: auto;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}

.shares-body-empty {
  justify-content: center;
  padding-top: 0;
}

.shares-search {
  max-width: 320px;
  margin-bottom: 12px;
}

</style>
