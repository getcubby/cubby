<template>
  <div class="favorites">
    <TopBar :gap="false" :left-grow="true">
      <template #left>
        <SearchBar @item-activated="onActivateItem"/>
      </template>
    </TopBar>

    <h1>Favorites</h1>

    <div class="favorite-container">
      <a v-for="entry in favorites" :key="entry.id" class="favorite-item" :href="entry.href" @click="onCloseSidebar">
        <img :src="entry.previewUrl || entry.icon" ref="iconImage" @error="iconError($event)"/>
        <div>
          {{ entry.fileName }}<br/>
          <span class="favorite-item-sub">{{ entry.filePath.slice(0, -(entry.fileName.length)) }}</span>
        </div>
        <div style="flex-grow: 1;"></div>
        <Icon icon="fa-solid fa-star" class="star-icon" @click.stop.prevent="onUnFavorite(entry)" />
      </a>
    </div>
  </div>
</template>

<script>

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ? import.meta.env.VITE_API_ORIGIN : '';

import moment from 'moment';

import { createFavoriteModel } from '../models/FavoriteModel.js';
import SearchBar from './SearchBar.vue';

import { Button, Icon, TopBar } from 'pankow';

const favoriteModel = createFavoriteModel(API_ORIGIN);

export default {
  name: 'FavoriteView',
  components: {
    Button,
    Icon,
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
    await this.refresh();
  },
  methods: {
    async refresh() {
      try {
        this.favorites = await favoriteModel.list();
      } catch (e) {
        console.error('Failed to list favorites.', e);
      }
    },
    onActivateItem(entry) {
      this.$emit('item-activated', entry);
    },
    async onUnFavorite(entry) {
      await favoriteModel.remove(entry.favorite.id);
      await this.refresh();
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

.favorite-container {
  overflow: auto;
  padding: 20px;
}

.favorite-item {
  --background-color-hover: #ededed;
  --background-color-selected: #dbedfb;
  --border-color-focus: #b3cfe5;

  display: flex;
  align-items: center;
  padding: 6px 10px;
  margin-bottom: 5px;
  overflow: hidden;
  width: 100%;
  border-radius: 3px;
  transition: all 100ms;
  border: 2px solid transparent;
}

@media (prefers-color-scheme: dark) {
  .favorite-item {
    --background-color-hover: rgba(255, 255, 255, 0.1);
    --background-color-selected: rgba(255, 255, 255, 0.2);
    --border-color-focus: rgba(255, 255, 255, 0.3);
  }
}

.favorite-item > img {
  margin-right: 10px;
  width: 35px;
  height: 35px;
  object-fit: cover;
}

.favorite-item:hover {
  background-color: var(--background-color-hover);
}

.favorite-item-sub {
  opacity: 0.7;
  font-size: 10px;
}

.star-icon {
  color: #ffcb00;
  padding: 10px;
}

.star-icon:hover {
  transform: scale(1.5);
  transform-origin: center center;
}

</style>
