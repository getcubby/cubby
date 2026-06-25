<script setup>

import { ref, computed } from 'vue';
import { getPreviewUrl } from '../utils.js';
import { prettyLongDate, prettyFileSize } from '@cloudron/pankow/utils';

const props = defineProps({
  parentEntry: {
    type: Object,
    default: function () { return {}; }
  },
  selectedEntries: {
    type: Array,
    default: function () { return []; }
  },
});

const visible = ref(localStorage.previewPanelVisible === 'true');
const entry = computed(() =>{
  return props.selectedEntries.length ? props.selectedEntries[0] : props.parentEntry;
});
const displayName = computed(() => entry.value.name || entry.value.fileName || '');
const displayPath = computed(() => entry.value.filePath || entry.value.resource?.path || '');
const combinedSize = computed(() => {
  return props.selectedEntries.length ? props.selectedEntries.reduce(function (acc, val) { return acc + val.size; }, 0) : props.parentEntry.size;
});

function onToggle() {
  visible.value = !visible.value;
  localStorage.previewPanelVisible = visible.value;
}

</script>

<template>
  <div class="preview-container" :class="{ 'visible': visible }">
    <div class="toggle-button" @click="onToggle" :title="visible ? 'Hide preview' : 'Show preview'"><i :class="'fa-solid ' + (visible ? 'fa-chevron-right' : 'fa-chevron-left')"></i></div>

    <div class="header" style="padding-bottom: 10px;">Details</div>

    <div v-if="selectedEntries.length || Object.keys(parentEntry).length !== 0">
      <div class="preview-icon-container">
        <div class="preview-icon" v-for="selectedEntry in selectedEntries.slice(0, 15)" :key="selectedEntry.id" :style="{ backgroundImage: selectedEntry && getPreviewUrl(selectedEntry) ? 'url(' + getPreviewUrl(selectedEntry) + ')' : 'none' }"></div>
        <div class="preview-icon" v-show="!selectedEntries.length" :style="{ backgroundImage: parentEntry && getPreviewUrl(parentEntry) ? 'url(' + getPreviewUrl(parentEntry) + ')' : 'none' }"></div>
      </div>
      <div class="detail" v-show="selectedEntries.length <= 1 && displayName">
        <p>Name</p>
        <span class="detail-value">{{ displayName }}</span>
      </div>
      <div class="detail" v-show="selectedEntries.length <= 1 && displayPath">
        <p>Path</p>
        <span class="detail-value detail-path">{{ displayPath }}</span>
      </div>
      <div class="detail" v-show="selectedEntries.length <= 1">
        <p>Owner</p>
        <span class="detail-value">{{ entry.owner }}</span>
      </div>
      <div class="detail" v-show="selectedEntries.length <= 1">
        <p>Updated</p>
        <span class="detail-value">{{ prettyLongDate(entry.mtime) }}</span>
      </div>
      <div class="detail" v-show="selectedEntries.length > 1">
        <p>{{ selectedEntries.length }} files selected</p>
      </div>
      <div class="detail">
        <p>Size</p>
        <span class="detail-value">{{ prettyFileSize(combinedSize) }}</span>
      </div>
      <div class="detail" v-show="selectedEntries.length <= 1 && entry.sharedWith && entry.sharedWith.length">
        <p>Shared with</p>
        <div class="detail-shared-width" v-for="share in entry.sharedWith" :key="share.id">{{ share.receiverUsername || 'link' }}</div>
      </div>
    </div>
  </div>
</template>

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
    padding-right: 10px;
}

.detail-value {
    display: block;
    word-break: break-word;
}

.detail-path {
    font-family: var(--font-family-monospace, monospace);
    font-size: 13px;
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
