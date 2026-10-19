<script setup>

import { API_ORIGIN, getResultFolderPath, getResultLocationLabel } from '../utils.js';
import { prettyFileSize } from '@cloudron/pankow/utils';

const props = defineProps({
  entry: {
    type: Object,
    required: true,
  },
  selected: {
    type: Boolean,
    default: false,
  },
  layout: {
    type: String,
    default: 'list',
  },
});

const emit = defineEmits(['select', 'open']);

function onSelect(event) {
  if (event.button !== 0) return;
  emit('select', props.entry);
}

function onOpenName(event) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  emit('open', props.entry);
}

function iconError(event) {
  const entry = props.entry;
  event.target.src = `${API_ORIGIN}/mime-types/application-x-generic.svg`;

  setTimeout(() => {
    if (typeof entry._previewRetries === 'undefined') entry._previewRetries = 0;
    if (entry._previewRetries > 10) return;
    ++entry._previewRetries;

    event.target.src = entry.previewUrl;
  }, 1000);
}

</script>

<template>
  <div class="row" :class="[layout, { selected }]" @mouseup="onSelect">
    <img class="icon" :src="entry.previewUrl || entry.icon" @error="iconError"/>
    <div class="body">
      <a class="name" :href="entry.href" @mouseup.stop @click.stop="onOpenName">{{ entry.fileName }}</a>
      <div v-if="layout === 'list'" class="path-row">
        <span class="location">{{ getResultLocationLabel(entry) }}</span>
        <span class="folder-path">{{ getResultFolderPath(entry) }}</span>
      </div>
    </div>
    <span v-if="layout === 'list' && typeof entry.size === 'number'" class="size">{{ prettyFileSize(entry.size) }}</span>
    <slot />
  </div>
</template>

<style scoped>

.row {
  --background-color-hover: #ededed;
  --background-color-selected: #dbedfb;
  --border-color-focus: #b3cfe5;
  display: flex;
  border: 2px solid transparent;
  border-radius: 3px;
}

@media (prefers-color-scheme: dark) {
  .row {
    --background-color-hover: rgba(255, 255, 255, 0.1);
    --background-color-selected: rgba(255, 255, 255, 0.2);
    --border-color-focus: rgba(255, 255, 255, 0.3);
  }
}

.row:hover {
  background-color: var(--background-color-hover);
}

.row.selected,
.row.selected:hover {
  background-color: var(--background-color-selected);
  border-color: var(--border-color-focus);
}

.row.list {
  flex-direction: row;
  align-items: center;
  width: 100%;
  padding: 6px 10px;
}

.row.grid {
  position: relative;
  flex-direction: column;
  align-items: center;
  width: 120px;
  padding: 10px;
  transition: width 200ms ease-in-out;
}

.icon {
  object-fit: cover;
  flex-shrink: 0;
}

.row.list .icon {
  width: 35px;
  height: 35px;
}

.row.grid .icon {
  width: 48px;
  height: 48px;
}

.body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.row.list .body {
  flex-grow: 1;
  margin: 0 10px;
}

.row.grid .body {
  width: 100%;
  align-items: center;
}

.name {
  align-self: flex-start;
  max-width: 100%;
  width: fit-content;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: inherit;
  text-decoration: none;
  cursor: pointer;
}

.name:hover {
  text-decoration: underline;
}

.row.grid .name {
  align-self: center;
  margin: 10px;
  text-align: center;
}

.row.grid:hover:not(.selected) .name {
  overflow: visible;
  width: auto;
  margin: 5px;
  padding: 5px;
  border-radius: var(--pankow-border-radius);
  background-color: var(--background-color-hover);
}

.path-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  min-width: 0;
  width: 100%;
}

.location,
.folder-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.location {
  flex-shrink: 0;
  max-width: 45%;
  color: var(--pankow-color-text-secondary);
}

.folder-path {
  min-width: 0;
}

.size {
  flex-shrink: 0;
  margin-right: 8px;
  color: var(--pankow-color-text-secondary);
  font-size: 13px;
}

.row.grid :deep(.open-folder) {
  visibility: hidden;
}

.row.grid:hover :deep(.open-folder) {
  visibility: visible;
}

</style>
