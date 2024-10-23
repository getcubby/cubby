<template>
  <div class="shares">
    <h1>Shared by You</h1>

    <TableView :columns="tableColumns" :model="tableModel">
      <template #icon="slotProps"><img :src="slotProps.file.previewUrl" width="32" height="32" style="object-fit: cover;" /></template>
      <template #target="slotProps">
        {{ slotProps.file.fileName }}
        <br/>
        <small>{{ slotProps.file.filePath }}</small>
      </template>
      <template #receiver="slotProps">
        <Icon icon="fa-solid fa-link" v-show="!slotProps.receiverUsername"/>
        <Icon icon="fa-regular fa-user" v-show="slotProps.receiverUsername"/>
        {{ slotProps.receiverUsername }}
      </template>
      <template #action="slotProps"></template>
    </TableView>
    <div class="share-count">{{ tableModel.length }} Shares</div>
  </div>
</template>

<script>

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ? import.meta.env.VITE_API_ORIGIN : '';

import { createShareModel } from '../models/ShareModel.js';

import { Button, Icon, TableView } from 'pankow';

export default {
    name: 'SharesView',
    components: {
      Button,
      Icon,
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
      async open() {
        this.tableModel = await this.shareModel.list();

        // set properties for sorting the table
        this.tableModel.forEach((s) => {
          s.target = s.file.filePath.toLowerCase();
          s.receiver = s.receiverUsername || 'zzzzzzzzz'; // poor mans sorting fallback for empty string
        });

        return true;
      }
    }
};

</script>

<style scoped>

.shares {
  padding: 20px;
}

.share-count {
  margin-top: 10px;
}

</style>
