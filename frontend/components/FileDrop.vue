<script setup>

import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useNotify, Button, ProgressBar } from '@cloudron/pankow';

const { notify } = useNotify();

const API_ORIGIN = '';

const filedropId = ref('');
const folderName = ref('');
const busy = ref(true);
const expired = ref(false);
const notFound = ref(false);
const error = ref('');

const isDragging = ref(false);
const uploading = ref(false);
const uploadProgress = ref(0);
const uploadFileName = ref('');

const successFile = ref(null);

let beforeUnloadHandler = null;

function extractFilledropId() {
  const path = window.location.pathname;
  const match = path.match(/\/filedrop\/([^/]+)/);
  return match ? match[1] : '';
}

async function loadFiledropInfo() {
  filedropId.value = extractFilledropId();
  if (!filedropId.value) {
    notFound.value = true;
    busy.value = false;
    return;
  }

  try {
    const response = await fetch(`${API_ORIGIN}/api/v1/filedrops/${filedropId.value}`, { credentials: 'include' });
    if (response.status === 404) {
      notFound.value = true;
      busy.value = false;
      return;
    }
    if (!response.ok) {
      error.value = 'Failed to load file drop information.';
      busy.value = false;
      return;
    }
    const data = await response.json();
    folderName.value = data.folderName;
    busy.value = false;
  } catch (e) {
    error.value = 'Failed to connect. Please try again later.';
    busy.value = false;
  }
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'kB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
}

function addBeforeUnload() {
  if (beforeUnloadHandler) return;
  beforeUnloadHandler = (e) => {
    e.preventDefault();
    e.returnValue = '';
  };
  window.addEventListener('beforeunload', beforeUnloadHandler);
}

function removeBeforeUnload() {
  if (!beforeUnloadHandler) return;
  window.removeEventListener('beforeunload', beforeUnloadHandler);
  beforeUnloadHandler = null;
}

async function uploadFiles(files) {
  for (const file of files) {
    await uploadFile(file);
  }
}

async function uploadFile(file) {
  uploading.value = true;
  uploadFileName.value = file.name;
  uploadProgress.value = 0;
  successFile.value = null;

  addBeforeUnload();

  try {
    const result = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.withCredentials = true;

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.response));
          } catch (e) {
            resolve({ fileName: file.name, size: file.size });
          }
        } else if (xhr.status === 404) {
          expired.value = true;
          reject(new Error('File drop is no longer available.'));
        } else if (xhr.status === 409) {
          reject(new Error(`A file named "${file.name}" already exists.`));
        } else {
          let message = 'Upload failed.';
          try { message = JSON.parse(xhr.response)?.message || message; } catch (e) {}
          reject(new Error(message));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload.'));
      });

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && event.total > 0) {
          uploadProgress.value = Math.round((event.loaded / event.total) * 100);
        }
      });

      xhr.open('POST', `${API_ORIGIN}/api/v1/filedrops/${filedropId.value}?name=${encodeURIComponent(file.name)}`);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.send(file);
    });

    successFile.value = { name: result.fileName, size: file.size };
    notify({ text: `"${result.fileName}" uploaded successfully`, type: 'success' });
  } catch (e) {
    notify({ text: e.message, type: 'danger' });
  }

  uploading.value = false;
  uploadFileName.value = '';
  uploadProgress.value = 0;

  removeBeforeUnload();
}

function resetToUpload() {
  successFile.value = null;
}

function onDragOver(e) {
  e.preventDefault();
  if (!uploading.value && !expired.value && !notFound.value) isDragging.value = true;
}

function onDragLeave(e) {
  e.preventDefault();
  isDragging.value = false;
}

function onDrop(e) {
  e.preventDefault();
  isDragging.value = false;

  if (uploading.value || expired.value || notFound.value) return;

  const dt = e.dataTransfer;
  if (!dt || !dt.files || dt.files.length === 0) return;

  successFile.value = null;
  uploadFiles(dt.files);
}

function onFileInputChange(e) {
  if (!e.target.files || e.target.files.length === 0) return;
  successFile.value = null;
  uploadFiles(e.target.files);
  e.target.value = '';
}

onMounted(loadFiledropInfo);

onBeforeUnmount(() => removeBeforeUnload());

</script>

<template>
  <div class="filedrop-page">
    <div class="filedrop-container">
      <div v-if="busy" class="filedrop-busy">
        <ProgressBar mode="indeterminate" :show-label="false" :slim="true" />
        <p>Loading...</p>
      </div>

      <div v-else-if="notFound" class="filedrop-error">
        <div class="filedrop-error-icon">
          <i class="fa-solid fa-circle-exclamation"></i>
        </div>
        <h2>File Drop not found</h2>
        <p>This file drop link is invalid or has been removed.</p>
      </div>

      <div v-else-if="expired" class="filedrop-error">
        <div class="filedrop-error-icon">
          <i class="fa-solid fa-clock"></i>
        </div>
        <h2>File Drop expired</h2>
        <p>This file drop link is no longer available.</p>
      </div>

      <div v-else-if="error" class="filedrop-error">
        <div class="filedrop-error-icon">
          <i class="fa-solid fa-triangle-exclamation"></i>
        </div>
        <h2>Something went wrong</h2>
        <p>{{ error }}</p>
      </div>

      <template v-else>
        <div class="filedrop-header">
          <h1>File Drop</h1>
          <p class="filedrop-folder">Uploading to <strong>{{ folderName }}</strong></p>
        </div>

        <div v-if="successFile" class="filedrop-success">
          <div class="filedrop-success-icon">
            <i class="fa-solid fa-circle-check"></i>
          </div>
          <h2>Upload complete</h2>
          <div class="filedrop-success-details">
            <div class="filedrop-success-name">{{ successFile.name }}</div>
            <div class="filedrop-success-size">{{ formatSize(successFile.size) }}</div>
          </div>
          <Button icon="fa-solid fa-cloud-arrow-up" @click="resetToUpload">Upload another file</Button>
        </div>

        <div
          v-else
          class="filedrop-dropzone"
          :class="{ 'filedrop-dropzone-active': isDragging, 'filedrop-dropzone-uploading': uploading }"
          @dragover="onDragOver"
          @dragleave="onDragLeave"
          @drop="onDrop"
        >
          <template v-if="uploading">
            <div class="filedrop-progress">
              <div class="filedrop-progress-name">{{ uploadFileName }}</div>
              <ProgressBar mode="determinate" :value="uploadProgress" :slim="false" />
              <div class="filedrop-progress-size">{{ uploadProgress }}%</div>
            </div>
          </template>
          <template v-else>
            <div class="filedrop-dropzone-icon">
              <i class="fa-solid fa-cloud-arrow-up"></i>
            </div>
            <p class="filedrop-dropzone-text">Drag & drop files here</p>
            <p class="filedrop-dropzone-or">or</p>
            <label class="filedrop-browse-button">
              <Button tag="span" icon="fa-solid fa-folder-open">Browse files</Button>
              <input type="file" multiple @change="onFileInputChange" class="filedrop-file-input" />
            </label>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>

.filedrop-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 20px;
  background: var(--pankow-color-background, #f5f5f5);
}

.filedrop-container {
  width: 100%;
  max-width: 520px;
}

.filedrop-header {
  text-align: center;
  margin-bottom: 24px;
}

.filedrop-header h1 {
  font-size: 24px;
  font-weight: var(--pankow-font-weight-bold, 600);
  margin: 0 0 8px 0;
  color: var(--pankow-color-text, #333);
}

.filedrop-folder {
  color: var(--pankow-color-text-secondary, #666);
  font-size: 14px;
  margin: 0;
}

.filedrop-dropzone {
  border: 2px dashed var(--pankow-color-border, #ccc);
  border-radius: 12px;
  padding: 48px 24px;
  text-align: center;
  transition: border-color 0.2s, background-color 0.2s;
  background: var(--pankow-color-background-hover, #fafafa);
}

.filedrop-dropzone-active {
  border-color: var(--pankow-color-primary, #4a90d9);
  background: color-mix(in srgb, var(--pankow-color-primary, #4a90d9) 8%, var(--pankow-color-background, #fff));
}

.filedrop-dropzone-uploading {
  border-style: solid;
}

.filedrop-dropzone-icon {
  font-size: 48px;
  color: var(--pankow-color-text-secondary, #999);
  margin-bottom: 16px;
}

.filedrop-dropzone-text {
  font-size: 16px;
  color: var(--pankow-color-text, #333);
  margin: 0 0 8px 0;
}

.filedrop-dropzone-or {
  font-size: 13px;
  color: var(--pankow-color-text-secondary, #999);
  margin: 0 0 16px 0;
}

.filedrop-browse-button {
  display: inline-block;
  cursor: pointer;
}

.filedrop-file-input {
  display: none;
}

.filedrop-progress {
  width: 100%;
}

.filedrop-progress-name {
  font-size: 14px;
  font-weight: var(--pankow-font-weight-bold, 600);
  color: var(--pankow-color-text, #333);
  margin-bottom: 12px;
  word-break: break-all;
}

.filedrop-progress-size {
  font-size: 12px;
  color: var(--pankow-color-text-secondary, #666);
  margin-top: 6px;
}

.filedrop-error, .filedrop-busy {
  text-align: center;
  padding: 32px 0;
}

.filedrop-error-icon {
  font-size: 48px;
  color: var(--pankow-color-text-secondary, #999);
  margin-bottom: 16px;
}

.filedrop-error h2 {
  font-size: 20px;
  margin: 0 0 8px 0;
  color: var(--pankow-color-text, #333);
}

.filedrop-error p {
  color: var(--pankow-color-text-secondary, #666);
  margin: 0;
}

.filedrop-busy p {
  color: var(--pankow-color-text-secondary, #666);
  margin: 16px 0 0 0;
}

.filedrop-success {
  text-align: center;
  padding: 40px 24px;
  border: 2px solid var(--pankow-color-success, #4caf50);
  border-radius: 12px;
  background: var(--pankow-color-background, #fff);
}

.filedrop-success-icon {
  font-size: 48px;
  color: var(--pankow-color-success, #4caf50);
  margin-bottom: 16px;
}

.filedrop-success h2 {
  font-size: 20px;
  font-weight: var(--pankow-font-weight-bold, 600);
  margin: 0 0 16px 0;
  color: var(--pankow-color-text, #333);
}

.filedrop-success-details {
  margin-bottom: 20px;
}

.filedrop-success-name {
  font-size: 16px;
  font-weight: var(--pankow-font-weight-bold, 600);
  color: var(--pankow-color-text, #333);
  word-break: break-all;
  margin-bottom: 4px;
}

.filedrop-success-size {
  font-size: 14px;
  color: var(--pankow-color-text-secondary, #666);
}

</style>
