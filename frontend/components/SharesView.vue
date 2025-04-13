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

<script>

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ? import.meta.env.VITE_API_ORIGIN : '';

import { createShareModel } from '../models/ShareModel.js';

import { Button, Icon, InputDialog, TableView } from 'pankow';
import { prettyDate, prettyLongDate } from 'pankow/utils';
import moment from 'moment';

export default {
    name: 'SharesView',
    components: {
      Button,
      Icon,
      InputDialog,
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
        },
        tableModel: []
      };
    },
    async mounted() {
      this.shareModel = createShareModel(API_ORIGIN);
    },
    methods: {
      prettyDate,
      prettyLongDate,
      async refresh() {
        this.tableModel = await this.shareModel.list();

        // set properties for sorting the table
        this.tableModel.forEach((s) => {
          s.target = s.file.filePath.toLowerCase();
          s.receiver = s.receiverUsername || 'zzzzzzzzz'; // poor mans sorting fallback for empty string
        });
      },
      async open() {
        await this.refresh();
        return true;
      },
      async onDelete(share) {
        const yes = await this.$refs.sharesInputDialog.confirm({
          message: `Really delete share ${share.file.fileName}?`,
          confirmStyle: 'danger',
          confirmLabel: 'Yes',
          rejectLabel: 'No'
        });

        if (!yes) return;

        try {
          await this.shareModel.remove(share.id);
        } catch (e) {
          return console.error('Failed to delete share.', e);
        }

        await this.refresh();
      }
    }
};

</script>

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
