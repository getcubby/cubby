<template>
  <div class="search-bar-container" @keydown.esc="onDismiss" tabindex="1">
    <Transition name="pankow-fade">
      <div class="pankow-dialog-backdrop" @click="onDismiss" v-show="open"></div>
    </Transition>
    <div class="search-bar" ref="searchBar" :class="{'open': open,'results-open': resultsOpen}">
      <i class="fa-solid fa-magnifying-glass" v-show="!searchBusy" style="cursor: pointer;" @click="onSearch"></i>
      <Spinner v-show="searchBusy" />
      <TextInput v-model="searchQuery" ref="searchInput" placeholder="Search ..." @focus="onFocus" @click="onFocus" @keydown.enter="onSearch" :disabled="searchBusy" class="search-input"/>
    </div>
    <Transition name="pankow-roll-down">
      <div v-show="resultsOpen" ref="searchResults" class="search-result-panel">
        <div v-show="searchResults.length === 0" class="no-search-results">
          Nothing found
        </div>
        <div v-for="result in searchResults" :key="result.filepath" class="search-result-entry" @click="onOpenEntryFromSearch(result.entry)">
          <img :src="result.entry.previewUrl"/>
          <div style="margin-left: 10px;">
            <b>{{ result.fileName }}</b><br/>
            <small>{{ result.abstract }}</small>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script>

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ? import.meta.env.VITE_API_ORIGIN : '';

import { createMainModel } from '../models/MainModel.js';

import { Dialog, Spinner, TextInput } from 'pankow';

export default {
  name: 'SearchBar',
  components: {
    Dialog,
    Spinner,
    TextInput
  },
  emits: [
    'item-activated'
  ],
  data() {
    return {
      mainModel: null,
      searchBusy: false,
      dismissed: false,
      searchQuery: '',
      searchResults: [],
      resultsOpen: false,
      open: false
    };
  },
  async mounted() {
    this.mainModel = createMainModel(API_ORIGIN);
  },
  methods: {
    async onSearch() {
      if (!this.searchQuery) return;

      this.searchBusy = true;
      const results = await this.mainModel.search(this.searchQuery);
      this.searchBusy = false;

      if (this.dismissed) return;

      this.searchResults = results;
      this.resultsOpen = true;
    },
    onDismiss() {
      this.open = false;
      this.resultsOpen = false;

      this.searchQuery = '';
      this.searchBusy = false;
      this.dismissed = true;

      setTimeout(() => {
        this.searchResults = [];
      }, 1000);
    },
    onFocus() {
      this.open = true;
      this.dismissed = false;
      this.$refs.searchResults.style.width = this.$refs.searchBar.offsetWidth + 'px';
    },
    onOpenEntryFromSearch(entry) {
      this.$emit('item-activated', entry);
      this.onDismiss();
    }
  }
};

</script>

<style scoped>

.search-bar-container {
  padding-left: 10px;
  padding-right: 10px;
  display: flex;
  flex-grow: 1;
}

.search-bar {
  padding-left: 10px;
  border-radius: var(--pankow-border-radius);
  display: flex;
  align-items: center;
  flex-grow: 1;
  position: relative;
}

.open {
  z-index: 2001;
  background: var(--pankow-dialog-background-color);
}

.search-bar.results-open {
  border-bottom-right-radius: 0;
  border-bottom-left-radius: 0;
}

.search-input {
  border: none;
  background: transparent;
  flex-grow: 1;
}

.search-result-entry {
  display: flex;
  align-items: start;
  cursor: pointer;
  padding: 10px 5px;
}

.search-result-entry:hover {
  background-color: var(--pankow-color-background-hover);
}

.search-result-entry > img {
  height: 75px;
  width: 75px;
  object-fit: cover;
}

.search-result-panel {
  border-bottom-left-radius: var(--pankow-border-radius);
  border-bottom-right-radius: var(--pankow-border-radius);
  position: absolute;
  background: var(--pankow-dialog-background-color);
  top: 45px;
  z-index: 2000;
  box-shadow: var(--pankow-menu-shadow);
  overflow: scroll;
  max-height: calc(100% - 60px);
}

.no-search-results {
  text-align: center;
  padding-bottom: 20px;
}

</style>
