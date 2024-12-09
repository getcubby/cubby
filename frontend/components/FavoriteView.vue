<template>
  <div class="favorites">
    <TopBar :gap="false" :left-grow="true">
      <template #left>
        <SearchBar @item-activated="onActivateItem"/>
      </template>
    </TopBar>

    <h1>Favorites</h1>

    <div style="overflow: auto; display: flex; flex-direction: column;">
      <a v-for="favorite in favorites" :key="favorite.id" :href="favorite.href" @click="onCloseSidebar">{{ favorite.fileName }}</a>
    </div>
  </div>
</template>

<script>

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ? import.meta.env.VITE_API_ORIGIN : '';

import moment from 'moment';

import { createFavoriteModel } from '../models/FavoriteModel.js';
import SearchBar from './SearchBar.vue';

import { Button, TopBar } from 'pankow';

const favoriteModel = createFavoriteModel(API_ORIGIN);

export default {
  name: 'FavoriteView',
  components: {
    Button,
    SearchBar,
    TopBar
  },
  props: {
  },
  emits: [
    'item-activated'
  ],
  data() {
    return {
      favorites: []
    };
  },
  async mounted() {
    try {
      this.favorites = await favoriteModel.list();
    } catch (e) {
      console.error('Failed to list favorites.', e);
    }
  },
  methods: {
    onActivateItem(entry) {
      this.$emit('item-activated', entry);
    },
    iconError(event, entry) {
      event.target.src = `${API_ORIGIN}/mime-types/none.svg`;

      setTimeout(() => {
        if (typeof entry._previewRetries === 'undefined') entry._previewRetries = 0;
        if (entry._previewRetries > 10) return;
        ++entry._previewRetries

        event.target.src = entry.previewUrl;
      }, 1000);
    }
  }
};

</script>

<style scoped>

.favorites {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

h1 {
  font-size: 20px;
  font-weight: normal;
  padding: 0 20px;
}

</style>
