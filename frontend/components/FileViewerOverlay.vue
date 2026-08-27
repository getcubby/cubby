<script setup>

import { ref, useTemplateRef } from 'vue';
import { GenericViewer, ImageViewer, PdfViewer, TextViewer, ThreeDViewer } from '@cloudron/pankow/viewers';
import DirectoryModel from '../models/DirectoryModel.js';
import MainModel from '../models/MainModel.js';
import MarkdownViewer from './MarkdownViewer.vue';

const props = defineProps({
  readonly: {
    type: Boolean,
    default: false,
  },
  downloadHandler: {
    type: Function,
    default: null,
  },
  saveHandler: {
    type: Function,
    default: null,
  },
});

const emit = defineEmits(['close']);

const viewer = ref('');
const currentItem = ref(null);
const currentResource = ref(null);
const currentSiblingEntries = ref([]);

const imageViewer = useTemplateRef('imageViewer');
const pdfViewer = useTemplateRef('pdfViewer');
const markdownViewer = useTemplateRef('markdownViewer');
const textViewer = useTemplateRef('textViewer');
const threeDViewer = useTemplateRef('threeDViewer');
const genericViewer = useTemplateRef('genericViewer');

function close() {
  viewer.value = '';
}

function onViewerClose() {
  close();
  emit('close');
}

function onImageViewerNavigate(entry) {
  history.replaceState(null, '', `#files${entry.resourcePath}`);
}

async function openOffice(item, resource) {
  window.open('/office.html#' + item.resourcePath, '_blank');
  window.location.hash = `files${resource.resourcePath}`.slice(0, -item.name.length);
}

async function openMarkdown(item, resource) {
  const raw = await DirectoryModel.getRawContent(resource);
  const textContent = typeof raw === 'string' ? raw : await raw.text();
  markdownViewer.value.open(item, textContent);
  viewer.value = 'markdown';
}

async function openText(item, resource) {
  const raw = await DirectoryModel.getRawContent(resource);
  const textContent = typeof raw === 'string' ? raw : await raw.text();
  textViewer.value.open(item, textContent);
  viewer.value = 'text';
}

async function openFile(item, resource, siblingEntries, preferredViewer) {
  close();

  currentItem.value = item;
  currentResource.value = resource;
  currentSiblingEntries.value = siblingEntries || [];

  if (preferredViewer === 'office' && MainModel.canHandleWithOffice(item)) {
    await openOffice(item, resource);
    return;
  } else if (preferredViewer === 'text' && textViewer.value.canHandle(item)) {
    await openText(item, resource);
    return;
  }

  if (imageViewer.value.canHandle(item)) {
    const otherSupportedEntries = (siblingEntries || []).filter((e) => imageViewer.value.canHandle(e));
    imageViewer.value.open(item, otherSupportedEntries);
    viewer.value = 'image';
  } else if (pdfViewer.value.canHandle(item)) {
    pdfViewer.value.open(item);
    viewer.value = 'pdf';
  } else if (threeDViewer.value.canHandle(item)) {
    threeDViewer.value.open(item, await DirectoryModel.getRawContent(resource));
    viewer.value = 'threed';
  } else if (markdownViewer.value.canHandle(item)) {
    await openMarkdown(item, resource);
  } else if (MainModel.canHandleWithOffice(item)) {
    await openOffice(item, resource);
  } else if (item.isBinary) {
    if (props.downloadHandler) await props.downloadHandler([item]);
    else window.location.href = item.downloadFileUrl;
    history.replaceState(null, '', `#files${resource.parentResourcePath}`);
  } else if (textViewer.value.canHandle(item)) {
    await openText(item, resource);
  } else {
    viewer.value = 'generic';
    genericViewer.value.open(item);
  }
}

async function openWith(viewerId) {
  if (!currentItem.value || !currentResource.value) return;
  await openFile(currentItem.value, currentResource.value, currentSiblingEntries.value, viewerId);
}

defineExpose({ openFile, close, openWith });

</script>

<template>
  <Transition name="viewer-slide">
    <div class="viewer-container" v-show="viewer === 'image'">
      <ImageViewer ref="imageViewer" @close="onViewerClose" :navigation-handler="onImageViewerNavigate" :download-handler="downloadHandler" />
    </div>
  </Transition>
  <Transition name="viewer-slide">
    <div class="viewer-container" v-show="viewer === 'text'">
      <TextViewer ref="textViewer" @close="onViewerClose" :save-handler="saveHandler" :readonly="readonly" />
    </div>
  </Transition>
  <Transition name="viewer-slide">
    <div class="viewer-container" v-show="viewer === 'pdf'">
      <PdfViewer ref="pdfViewer" @close="onViewerClose" />
    </div>
  </Transition>
  <Transition name="viewer-slide">
    <div class="viewer-container" v-show="viewer === 'markdown'">
      <MarkdownViewer ref="markdownViewer" @close="onViewerClose" :open-with-handler="() => openWith('text')" />
    </div>
  </Transition>
  <Transition name="viewer-slide">
    <div class="viewer-container" v-show="viewer === 'threed'">
      <ThreeDViewer ref="threeDViewer" @close="onViewerClose" />
    </div>
  </Transition>
  <Transition name="viewer-slide">
    <div class="viewer-container" v-show="viewer === 'generic'">
      <GenericViewer ref="genericViewer" @close="onViewerClose" />
    </div>
  </Transition>
</template>

<style scoped>

.viewer-container {
  z-index: 30;
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
}

.viewer-slide-enter-active,
.viewer-slide-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.viewer-slide-enter-from,
.viewer-slide-leave-to {
  opacity: 0;
  transform: translateY(33.33%) scale(0.95);
}

</style>
