<template>
  <div class="preview-container" :class="{ 'visible': visible }">
    <div class="toggle-button" @click="onToggle" :title="visible ? 'Hide Preview' : 'Show Preview'"><i :class="'fa-solid ' + (visible ? 'fa-chevron-right' : 'fa-chevron-left')"></i></div>

    <div class="header" style="padding-bottom: 10px;">Details</div>
    <div class="preview-icon-container">
      <div class="preview-icon" v-for="selectedEntry in selectedEntries.slice(0, 15)" :key="selectedEntry.id" :style="{ backgroundImage: selectedEntry && getPreviewUrl(selectedEntry) ? 'url(' + getPreviewUrl(selectedEntry) + ')' : 'none' }"></div>
      <div class="preview-icon" v-show="!selectedEntries.length" :style="{ backgroundImage: parentEntry && getPreviewUrl(parentEntry) ? 'url(' + getPreviewUrl(parentEntry) + ')' : 'none' }"></div>
    </div>
    <div class="detail" v-show="selectedEntries.length <= 1">
      <p>Owner</p>
      <span>{{ entry.owner }}</span>
    </div>
    <div class="detail" v-show="selectedEntries.length <= 1">
      <p>Updated</p>
      <span>{{ prettyLongDate(entry.mtime) }}</span>
    </div>
    <div class="detail" v-show="selectedEntries.length > 1">
      <p>{{ selectedEntries.length }} files selected</p>
    </div>
    <div class="detail">
      <p>Size</p>
      <span>{{ prettyFileSize(combinedSize) }}</span>
    </div>
    <div class="detail" v-show="selectedEntries.length <= 1 && entry.sharedWith && entry.sharedWith.length">
      <p>Shared With</p>
      <div class="detail-shared-width" v-for="share in entry.sharedWith" :key="share.id">{{ share.receiverUsername || 'link' }}</div>
    </div>
  </div>
</template>

<script>

import { getPreviewUrl } from '../utils.js';
import { prettyLongDate, prettyFileSize } from 'pankow/utils';

export default {
  name: 'PreviewPanel',
  props: {
    parentEntry: {
      type: Object,
      default: function () { return {}; }
    },
    selectedEntries: {
      type: Array,
      default: function () { return []; }
    }
  },
  emits: [ 'close' ],
  data() {
    return {
      visible: localStorage.previewPanelVisible === 'true'
    };
  },
  computed: {
    entry() {
      return this.selectedEntries.length ? this.selectedEntries[0] : this.parentEntry;
    },
    combinedSize() {
      return this.selectedEntries.length ? this.selectedEntries.reduce(function (acc, val) { return acc + val.size; }, 0) : this.parentEntry.size;
    }
  },
  mounted() {
  },
  methods: {
    prettyLongDate,
    prettyFileSize,
    getPreviewUrl,
    onToggle() {
      this.visible = !this.visible;
      localStorage.previewPanelVisible = this.visible;
    }
  }
};

</script>

<style scoped>

.preview-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    width: 0;
    transition: width ease-in 300ms;
}

.preview-container.visible {
    width: min(33%, 350px);
}

.preview-icon-container {
    display: flex;
    width: 100%;
    height: 250px;
    flex-direction: row;
    flex-wrap: wrap-reverse;
}

.preview-icon {
    background-repeat: no-repeat;
    background-position: center;
    background-size: contain;
    flex-grow: 1;
    min-width: 64px;
    min-height: 64px;
}

.header {
    padding: 10px;
    text-align: left;
    border-bottom: solid 2px var(--pankow-color-primary);
}

.detail > p {
    color: #888;
    margin-top: 5px;
    margin-bottom: 5px;
}

.detail {
    margin-bottom: 5px;
    padding-left: 10px;
}

.detail-shared-width {
  margin: 2px 0;
}

@media only screen and (max-width: 767px)  {
    .preview-container {
        display: none;
    }
}

.toggle-button {
  position: absolute;
  right: 0;
  padding: 10px 15px;
  cursor: pointer;
}

@media only screen and (max-width: 767px) {
  .toggle-button {
    display: none;
  }
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
