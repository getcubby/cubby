<template>
  <div class="craft-viewer">
    <canvas :id="`${app}_canvas`" ref="canvas" data-host="page" tabindex="0"></canvas>
    <div v-if="loading" class="status">Loading {{ label }}…</div>
    <div v-if="errorText" class="status error">{{ errorText }}</div>
    <div class="viewer-actions">
      <Button v-if="showSave && !readonly" icon="fa-regular fa-floppy-disk" secondary tool :disabled="!dirty || saving" :loading="saving" v-tooltip.left="utils.translation('filemanager.textEditor.save')" @click="onSaveClick" />
      <Button icon="fa-solid fa-xmark" secondary tool v-tooltip.left="utils.translation('main.dialog.close')" @click="onClose" />
    </div>
  </div>
</template>

<script setup>

import { ref, onMounted, onBeforeUnmount, useTemplateRef } from 'vue';
import { Button, useNotify, utils } from '@cloudron/pankow';
import DirectoryModel from '../models/DirectoryModel.js';

const props = defineProps({
  app: {
    type: String,
    required: true,
  },
  label: {
    type: String,
    required: true,
  },
  noun: {
    type: String,
    required: true,
  },
  // Extensions this build can write back over the open file.
  saveExtensions: {
    type: Array,
    required: true,
  },
  // Extensions it can open but not write. A save of one of these becomes legacySaveAs.
  legacyExtensions: {
    type: Array,
    default() { return []; },
  },
  legacySaveAs: {
    type: String,
    default: '',
  },
  readonly: {
    type: Boolean,
    default: false,
  },
  // GridCraft's File tab is hidden, so cubby supplies Save. WordCraft and DeckCraft keep theirs.
  showSave: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits(['close']);

const { notify } = useNotify();

const canvas = useTemplateRef('canvas');
const loading = ref(false);
const errorText = ref('');
const dirty = ref(false);
const saving = ref(false);
const currentItem = ref(null);

let ready = false;
let pending = null;
let startPromise = null;
let loadedPath = '';

function onClose() {
  emit('close');
}

function craftApi() {
  return window[props.app];
}

async function onSaveClick() {
  const api = craftApi();
  if (saving.value || props.readonly || !dirty.value || !api) return;
  saving.value = true;
  try {
    await api.execute('file.save');
  } catch (error) {
    console.error(`Failed to save ${props.noun}`, error);
    notify({ text: `Failed to save the ${props.noun}`, type: 'danger' });
    saving.value = false;
  }
}

function allowClose() {
  if (!dirty.value) return true;
  if (!window.confirm(`This ${props.noun} has unsaved changes. Close without saving?`)) return false;
  dirty.value = false;
  loadedPath = '';
  return true;
}

function onBeforeUnload(event) {
  if (!dirty.value) return;
  event.preventDefault();
  event.returnValue = '';
}

function applyHostQuery(author) {
  const params = new URLSearchParams(window.location.search);
  params.set('chrome', 'none');
  if (author) params.set('author', String(author).slice(0, 200));
  const next = `${window.location.pathname}?${params}${window.location.hash}`;
  window.history.replaceState(window.history.state, '', next);
}

function clearHostQuery() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('chrome') && !params.has('author')) return;
  params.delete('chrome');
  params.delete('author');
  const search = params.toString();
  const next = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
  window.history.replaceState(window.history.state, '', next);
}

function flushOpen() {
  if (!ready || !pending || !canvas.value) return;
  const next = pending;
  pending = null;
  loadedPath = currentItem.value?.resourcePath || '';
  canvas.value.dispatchEvent(new CustomEvent(`${props.app}:open`, { detail: next }));
  canvas.value.focus();
}

function onReady() {
  ready = true;
  loading.value = false;
  flushOpen();
}

function onDirty(event) {
  dirty.value = !!event.detail?.dirty;
}

function onFailed(event) {
  loading.value = false;
  errorText.value = event.detail?.error || `${props.label} failed to start. A browser with WebGPU or WebGL2 is required.`;
}

function baseName(name) {
  const parts = String(name || '').split(/[/\\]/);
  return parts[parts.length - 1] || '';
}

function endsWithOne(name, extensions) {
  return extensions.some(function (ext) { return name.endsWith(ext); });
}

function saveTarget(item, savedName) {
  let name = baseName(savedName).replace(/ \(imported\)(?=\.[a-z0-9]+$)/i, '');
  if (!name) return null;
  let lower = name.toLowerCase();
  if (props.legacySaveAs && endsWithOne(lower, props.legacyExtensions)) {
    const dot = name.lastIndexOf('.');
    name = (dot > 0 ? name.slice(0, dot) : name) + props.legacySaveAs;
    lower = name.toLowerCase();
  }
  if (!endsWithOne(lower, props.saveExtensions)) return null;
  if (name === item.fileName) return item.resource;
  const path = item.resource?.resourcePath || '';
  const slash = path.lastIndexOf('/');
  if (slash < 0) return null;
  return { resourcePath: path.slice(0, slash + 1) + name, fileName: name };
}

async function onSave(event) {
  const name = event.detail?.name || '';
  const bytes = event.detail?.bytes;
  const item = currentItem.value;
  try {
    if (!item || !bytes) return;

    const target = saveTarget(item, name);
    if (!target) return;

    if (props.readonly) {
      notify({ text: `This ${props.noun} is read-only`, type: 'danger' });
      return;
    }

    await DirectoryModel.saveFile(target, bytes);
    if (target.fileName && target.fileName !== item.fileName) {
      notify({ text: `Saved as ${target.fileName}`, type: 'success' });
    }
  } catch (error) {
    console.error(`Failed to save ${props.noun}`, error);
    const conflict = error?.reason === DirectoryModel.DirectoryModelError.CONFLICT;
    notify({ text: conflict ? `The ${props.noun} changed. Reload it and try again.` : `Failed to save the ${props.noun}`, type: 'danger' });
  } finally {
    saving.value = false;
  }
}

async function loadModule() {
  const response = await fetch(`/${props.app}/index.html`);
  if (!response.ok) throw new Error(`${props.label} is not installed`);
  const html = await response.text();
  const jsMatch = html.match(/from ['"](\.\/[^'"]+\.js)['"]/);
  const wasmMatch = html.match(/module_or_path:\s*['"](\.\/[^'"]+_bg\.wasm)['"]/);
  if (!jsMatch || !wasmMatch) throw new Error(`${props.label} build is missing its web assembly module`);

  const base = new URL(`/${props.app}/`, window.location.origin);
  const jsUrl = new URL(jsMatch[1], base).href;
  const wasmUrl = new URL(wasmMatch[1], base).href;
  const mod = await import(/* @vite-ignore */ jsUrl);
  await mod.default({ module_or_path: wasmUrl });
}

function ensureStarted(author) {
  if (!startPromise) {
    applyHostQuery(author);
    startPromise = loadModule().finally(clearHostQuery).catch(function (error) {
      startPromise = null;
      throw error;
    });
  }
  return startPromise;
}

async function open(item, author) {
  if (!item) return false;
  if (ready && loadedPath && loadedPath === item.resourcePath) {
    errorText.value = '';
    canvas.value?.focus();
    window.dispatchEvent(new Event('resize'));
    return true;
  }
  if (dirty.value && currentItem.value && currentItem.value.resourcePath !== item.resourcePath && !allowClose()) return false;

  errorText.value = '';
  loading.value = !ready;
  currentItem.value = item;

  let bytes;
  try {
    const response = await fetch(item.fullFileUrl, { credentials: 'include' });
    if (!response.ok) throw new Error(`Failed to load ${props.noun} (${response.status})`);
    bytes = await response.arrayBuffer();
  } catch (error) {
    loading.value = false;
    errorText.value = error.message || `Failed to load ${props.noun}`;
    return false;
  }

  pending = { name: item.fileName, bytes };
  if (canvas.value && canvas.value.clientWidth === 0) {
    await new Promise(function (resolve) { requestAnimationFrame(function () { requestAnimationFrame(resolve); }); });
  }
  try {
    await ensureStarted(author || '');
  } catch (error) {
    loading.value = false;
    errorText.value = error.message || `${props.label} failed to start`;
    console.error(error);
    return false;
  }

  flushOpen();
  window.dispatchEvent(new Event('resize'));
  return true;
}

onMounted(function () {
  const element = canvas.value;
  if (!element) return;
  element.addEventListener(`${props.app}:ready`, onReady);
  element.addEventListener(`${props.app}:save`, onSave);
  element.addEventListener(`${props.app}:dirty`, onDirty);
  element.addEventListener(`${props.app}:failed`, onFailed);
  window.addEventListener('beforeunload', onBeforeUnload);
});

onBeforeUnmount(function () {
  window.removeEventListener('beforeunload', onBeforeUnload);
});

defineExpose({ open, allowClose });

</script>

<style scoped>

.craft-viewer {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #f3f3f3;
}

canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  outline: none;
}

.status {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #555;
  font: 14px system-ui, sans-serif;
  pointer-events: none;
}

.status.error {
  color: #8a1f1f;
}

.viewer-actions {
  position: absolute;
  top: 2px;
  right: 2px;
  z-index: 1;
  display: flex;
  gap: 4px;
}

</style>
