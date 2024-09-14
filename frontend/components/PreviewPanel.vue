<template>
  <div class="preview-container" :class="{ 'visible': visible }">
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
    <div class="detail" v-show="selectedEntries.length <= 1">
      <p>Type</p>
      <span >{{ entry.mimeType }}</span>
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
        },
        visible: Boolean
    },
    emits: [ 'close' ],
    data() {
        return {};
    },
    computed: {
        entry() {
            return this.selectedEntries.length ? this.selectedEntries[0] : this.parentEntry;
        },
        combinedSize() {
            return this.selectedEntries.length ? this.selectedEntries.reduce(function (acc, val) { return acc + val.size; }, 0) : this.parentEntry.size;
        }
    },
    methods: {
        prettyLongDate,
        prettyFileSize,
        getPreviewUrl,
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
    width: 350px;
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

@media only screen and (max-width: 767px)  {
    .preview-container {
        display: none;
    }
}

</style>
