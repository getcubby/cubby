<script setup>

import { ref, useTemplateRef, nextTick } from 'vue';
import { Dialog, TextInput } from '@cloudron/pankow';
import { parseResourcePath, sanitize } from '../utils.js';
import DirectoryModel from '../models/DirectoryModel.js';

const emit = defineEmits(['rename']);

const dialog = useTemplateRef('dialog');

const item = ref(null);
const newName = ref('');
const busy = ref(false);
const error = ref('');
const nameInput = useTemplateRef('nameInput');

async function open(renameItem) {
  error.value = '';
  busy.value = false;
  item.value = renameItem;
  newName.value = renameItem.name;

  dialog.value.open();

  await nextTick();

  const input = nameInput.value?.$el;
  if (input) {
    input.focus();
    const lastDotIndex = renameItem.name.lastIndexOf('.');
    input.selectionStart = 0;
    input.selectionEnd = lastDotIndex > 0 ? lastDotIndex : renameItem.name.length;
  }
}

function onReject() {
  error.value = '';
  busy.value = false;
}

async function onConfirm() {
  const trimmed = newName.value.trim();
  if (!trimmed) return;

  busy.value = true;
  error.value = '';

  const fromResource = item.value.resource;
  const toResource = parseResourcePath(sanitize(fromResource.resourcePath.replace(/\/[^/]+$/, '/' + trimmed)));

  if (fromResource.resourcePath === toResource.resourcePath) {
    busy.value = false;
    dialog.value.close();
    return;
  }

  try {
    await DirectoryModel.rename(fromResource, toResource);
    busy.value = false;
    dialog.value.close();
    emit('rename', trimmed);
  } catch (e) {
    busy.value = false;
    if (e.reason === DirectoryModel.DirectoryModelError.CONFLICT) {
      error.value = 'A file or folder with that name already exists';
    } else if (e.reason === DirectoryModel.DirectoryModelError.NO_AUTH) {
      error.value = 'Not authorized';
    } else {
      error.value = 'Failed to rename';
    }
  }
}

defineExpose({ open });

</script>

<template>
  <Dialog
    ref="dialog"
    title="Rename"
    reject-label="Cancel"
    reject-style="secondary"
    confirm-label="Rename"
    confirm-style="success"
    :confirm-busy="busy"
    :confirm-active="!!newName.trim()"
    @confirm="onConfirm"
    @reject="onReject"
  >
    <form @submit.prevent="onConfirm">
      <TextInput
        ref="nameInput"
        v-model="newName"
        placeholder="New name"
        style="width: 100%"
      />
      <p class="has-error" v-show="error">{{ error }}</p>
    </form>
  </Dialog>
</template>
