<script setup>

import { ref, nextTick, useTemplateRef } from 'vue';
import { GenericViewer, ImageViewer, PdfViewer, TextViewer, ThreeDViewer } from '@cloudron/pankow/viewers';
import DirectoryModel from '../models/DirectoryModel.js';
import MainModel from '../models/MainModel.js';
import { replace, replaceQuiet } from '../router.js';
import MarkdownViewer from './MarkdownViewer.vue';
import OfficeViewer from './OfficeViewer.vue';

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
const returnViewer = ref('');
const animateViewer = ref(true);
const currentItem = ref(null);
const currentResource = ref(null);
const currentSiblingEntries = ref([]);
let openGeneration = 0;

const imageViewer = useTemplateRef('imageViewer');
const pdfViewer = useTemplateRef('pdfViewer');
const markdownViewer = useTemplateRef('markdownViewer');
const officeViewer = useTemplateRef('officeViewer');
const textViewer = useTemplateRef('textViewer');
const threeDViewer = useTemplateRef('threeDViewer');
const genericViewer = useTemplateRef('genericViewer');

function close() {
  openGeneration += 1;
  returnViewer.value = '';
  animateViewer.value = true;
  viewer.value = '';
}

function onViewerClose() {
  if (returnViewer.value && viewer.value !== returnViewer.value) {
    const previous = returnViewer.value;
    returnViewer.value = '';
    presentViewer(previous);
    return;
  }

  close();
  emit('close');
}

function onImageViewerNavigate(entry) {
  replaceQuiet(`/files${entry.resourcePath}`);
}

async function openOffice(item, generation) {
  if (generation !== undefined && generation !== openGeneration) return;
  viewer.value = 'office';
  await nextTick();
  if (generation !== undefined && generation !== openGeneration) return;
  officeViewer.value.open(item);
}

async function openMarkdown(item, resource, generation) {
  const raw = await DirectoryModel.getRawContent(resource);
  const textContent = typeof raw === 'string' ? raw : await raw.text();
  if (generation !== undefined && generation !== openGeneration) return;
  markdownViewer.value.open(item, textContent);
  viewer.value = 'markdown';
}

async function openText(item, resource, generation) {
  const raw = await DirectoryModel.getRawContent(resource);
  const textContent = typeof raw === 'string' ? raw : await raw.text();
  if (generation !== undefined && generation !== openGeneration) return;
  textViewer.value.open(item, textContent);
  viewer.value = 'text';
}

async function presentViewer(viewerId) {
  const item = currentItem.value;
  const resource = currentResource.value;
  if (!item || !resource) return;

  const generation = ++openGeneration;
  animateViewer.value = false;

  if (viewerId === 'text' && textViewer.value.canHandle(item)) {
    await openText(item, resource, generation);
  } else if (viewerId === 'markdown' && markdownViewer.value.canHandle(item)) {
    await openMarkdown(item, resource, generation);
  } else if (viewerId === 'office' && MainModel.canHandleWithOffice(item)) {
    await openOffice(item, generation);
  } else {
    returnViewer.value = '';
    animateViewer.value = true;
    await openFile(item, resource, currentSiblingEntries.value, viewerId);
    return;
  }

  if (generation !== openGeneration) return;

  await nextTick();
  animateViewer.value = true;
}

async function openFile(item, resource, siblingEntries, preferredViewer) {
  close();

  currentItem.value = item;
  currentResource.value = resource;
  currentSiblingEntries.value = siblingEntries || [];

  if (preferredViewer === 'office' && MainModel.canHandleWithOffice(item)) {
    await openOffice(item);
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
    await openOffice(item);
  } else if (item.isBinary) {
    if (props.downloadHandler) await props.downloadHandler([item]);
    else window.location.href = item.downloadFileUrl;
    replace(`/files${resource.parentResourcePath}`);
  } else if (textViewer.value.canHandle(item)) {
    await openText(item, resource);
  } else {
    viewer.value = 'generic';
    genericViewer.value.open(item);
  }
}

async function openWith(viewerId) {
  if (!currentItem.value || !currentResource.value) return;
  if (!viewer.value || viewer.value === viewerId) return;

  returnViewer.value = viewer.value;
  await presentViewer(viewerId);
}

defineExpose({ openFile, close, openWith });

</script>

<template>
  <Transition name="viewer-slide" :css="animateViewer">
    <div class="viewer-container" v-show="viewer === 'image'">
      <ImageViewer ref="imageViewer" @close="onViewerClose" :navigation-handler="onImageViewerNavigate" :download-handler="downloadHandler" />
    </div>
  </Transition>
  <Transition name="viewer-slide" :css="animateViewer">
    <div class="viewer-container" v-show="viewer === 'text'">
      <TextViewer ref="textViewer" @close="onViewerClose" :save-handler="saveHandler" :readonly="readonly" />
    </div>
  </Transition>
  <Transition name="viewer-slide" :css="animateViewer">
    <div class="viewer-container" v-show="viewer === 'pdf'">
      <PdfViewer ref="pdfViewer" @close="onViewerClose" />
    </div>
  </Transition>
  <Transition name="viewer-slide" :css="animateViewer">
    <div class="viewer-container" v-show="viewer === 'markdown'">
      <MarkdownViewer ref="markdownViewer" @close="onViewerClose" :open-with-handler="() => openWith('text')" />
    </div>
  </Transition>
  <Transition name="viewer-slide" :css="animateViewer">
    <div class="viewer-container" v-if="viewer === 'office'">
      <OfficeViewer ref="officeViewer" @close="onViewerClose" />
    </div>
  </Transition>
  <Transition name="viewer-slide" :css="animateViewer">
    <div class="viewer-container" v-show="viewer === 'threed'">
      <ThreeDViewer ref="threeDViewer" @close="onViewerClose" />
    </div>
  </Transition>
  <Transition name="viewer-slide" :css="animateViewer">
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
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.viewer-slide-enter-from,
.viewer-slide-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

</style>
