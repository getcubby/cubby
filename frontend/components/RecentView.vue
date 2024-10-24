<template>
  <div class="recent">
    <h1>Recent</h1>

    <div class="container">
      <div class="listing">
        <div v-for="entry in entry.entries" :key="entry.id">
          {{ entry.fileName }}
        </div>
      </div>

      <PreviewPanel :parent-entry="entry" :selected-entries="selectedEntries"/>
    </div>
  </div>
</template>

<script>

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ? import.meta.env.VITE_API_ORIGIN : '';

import { createMainModel } from '../models/MainModel.js';

import PreviewPanel from './PreviewPanel.vue';

import { Button } from 'pankow';

const mainModel = createMainModel(API_ORIGIN);

export default {
    name: 'RecentView',
    components: {
      Button,
      PreviewPanel
    },
    props: {
    },
    data() {
      return {
        entry: {},
        selectedEntries: []
      };
    },
    async mounted() {
    },
    methods: {
      async open() {
        this.entry = await mainModel.recent();
        return true;
      }
    }
};

</script>

<style scoped>

.recent {
  padding: 20px;
}

.listing {
  flex-grow: 1;
}

.container {
  display: flex;
  width: 100%;
  height: 100%;
}

</style>
