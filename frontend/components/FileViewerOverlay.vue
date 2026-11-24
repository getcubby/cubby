<script setup>

import { ref, nextTick, inject, useTemplateRef } from 'vue';
import { GenericViewer, ImageViewer, PdfViewer, TextViewer, ThreeDViewer } from '@cloudron/pankow/viewers';
import DirectoryModel from '../models/DirectoryModel.js';
import MainModel from '../models/MainModel.js';
import { replace, replaceQuiet } from '../router.js';
import MarkdownViewer from './MarkdownViewer.vue';
import OfficeViewer from './OfficeViewer.vue';
import CraftHostViewer from './CraftHostViewer.vue';

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

const profile = inject('profile', ref({}));

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
const gridcraftViewer = useTemplateRef('gridcraftViewer');
const wordcraftViewer = useTemplateRef('wordcraftViewer');
const deckcraftViewer = useTemplateRef('deckcraftViewer');
const textViewer = useTemplateRef('textViewer');
const threeDViewer = useTemplateRef('threeDViewer');
const genericViewer = useTemplateRef('genericViewer');

function close() {
  openGeneration += 1;
  returnViewer.value = '';
  animateViewer.value = true;
  viewer.value = '';
}

const CRAFT_EDITORS = {
  gridcraft: [ '.xlsx', '.xlsm', '.xlsb', '.xls', '.ods' ],
  wordcraft: [ '.docx', '.docm', '.dotx', '.odt', '.dot', '.doc' ],
  deckcraft: [ '.pptx', '.potx', '.ppsx' ],
};

function hasExtension(name, ext) {
  if (!name.endsWith(ext)) return false;
  const before = name.length - ext.length;
  return before === 0 || !/[a-z0-9]/i.test(name[before]);
}

function craftEditorFor(item) {
  const name = (item?.fileName || '').toLowerCase();
  for (const id of Object.keys(CRAFT_EDITORS)) {
    if (CRAFT_EDITORS[id].some(function (ext) { return hasExtension(name, ext); })) return id;
  }
  return '';
}

function onViewerClose() {
  if (returnViewer.value && viewer.value !== returnViewer.value) {
    const previous = returnViewer.value;
    returnViewer.value = '';
    presentViewer(previous);
    return;
  }

  const craftViewer = viewer.value === 'gridcraft' ? gridcraftViewer.value
    : viewer.value === 'wordcraft' ? wordcraftViewer.value
    : viewer.value === 'deckcraft' ? deckcraftViewer.value
    : null;
  if (craftViewer && !craftViewer.allowClose()) return;

  close();
  emit('close');
}

function onImageViewerNavigate(entry) {
  replaceQuiet(`/files${entry.resourcePath}`);
}

async function openCraft(id, item, generation) {
  if (generation !== undefined && generation !== openGeneration) return;
  viewer.value = id;
  await nextTick();
  if (generation !== undefined && generation !== openGeneration) return;
  const author = profile.value?.displayName || profile.value?.username || '';
  const target = id === 'wordcraft' ? wordcraftViewer : id === 'deckcraft' ? deckcraftViewer : gridcraftViewer;
  await target.value.open(item, author);
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

  const craftEditor = MainModel.craftViewerEnabled() ? craftEditorFor(item) : '';
  if (craftEditor) {
    await openCraft(craftEditor, item);
    return;
  } else if (imageViewer.value.canHandle(item)) {
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
    <div class="viewer-container" v-show="viewer === 'gridcraft'">
      <CraftHostViewer ref="gridcraftViewer" app="gridcraft" label="GridCraft" noun="spreadsheet" :save-extensions="['.xlsx', '.xlsm']" :legacy-extensions="['.xls', '.xlsb', '.ods']" legacy-save-as=".xlsx" :readonly="readonly" @close="onViewerClose" />
    </div>
  </Transition>
  <Transition name="viewer-slide" :css="animateViewer">
    <div class="viewer-container" v-show="viewer === 'wordcraft'">
      <CraftHostViewer ref="wordcraftViewer" app="wordcraft" label="WordCraft" noun="document" :save-extensions="['.docx', '.docm', '.dotx', '.odt']" :legacy-extensions="['.doc', '.dot']" legacy-save-as=".docx" :show-save="false" :readonly="readonly" @close="onViewerClose" />
    </div>
  </Transition>
  <Transition name="viewer-slide" :css="animateViewer">
    <div class="viewer-container" v-show="viewer === 'deckcraft'">
      <CraftHostViewer ref="deckcraftViewer" app="deckcraft" label="DeckCraft" noun="presentation" :save-extensions="['.pptx', '.potx', '.ppsx']" :show-save="false" :readonly="readonly" @close="onViewerClose" />
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
