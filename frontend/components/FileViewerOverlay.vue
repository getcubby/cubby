<script setup>

import { ref, useTemplateRef, inject } from 'vue';
import { GenericViewer, ImageViewer, PdfViewer, TextViewer, ThreeDViewer } from '@cloudron/pankow/viewers';
import DirectoryModel from '../models/DirectoryModel.js';
import MainModel from '../models/MainModel.js';
import MarkdownEditor from './MarkdownEditor.vue';

defineProps({
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

const profile = inject('profile');

const viewer = ref('');

const imageViewer = useTemplateRef('imageViewer');
const pdfViewer = useTemplateRef('pdfViewer');
const markdownEditor = useTemplateRef('markdownEditor');
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

async function openFile(item, resource, siblingEntries) {
  close();

  if (imageViewer.value.canHandle(item)) {
    const otherSupportedEntries = siblingEntries.filter((e) => imageViewer.value.canHandle(e));
    imageViewer.value.open(item, otherSupportedEntries);
    viewer.value = 'image';
  } else if (pdfViewer.value.canHandle(item)) {
    pdfViewer.value.open(item);
    viewer.value = 'pdf';
  } else if (threeDViewer.value.canHandle(item)) {
    threeDViewer.value.open(item, await DirectoryModel.getRawContent(resource));
    viewer.value = 'threed';
  } else if (MainModel.canHandleWithOffice(item)) {
    window.open('/office.html#' + item.resourcePath, '_blank');
    window.location.hash = `files${resource.resourcePath}`.slice(0, -item.name.length);
  } else if (markdownEditor.value.canHandle(item)) {
    const raw = await DirectoryModel.getRawContent(resource);
    const textContent = typeof raw === 'string' ? raw : await raw.text();
    markdownEditor.value.open(item, textContent);
    viewer.value = 'markdown';
  } else if (textViewer.value.canHandle(item)) {
    const raw = await DirectoryModel.getRawContent(resource);
    const textContent = typeof raw === 'string' ? raw : await raw.text();
    textViewer.value.open(item, textContent);
    viewer.value = 'text';
  } else {
    viewer.value = 'generic';
    genericViewer.value.open(item);
  }
}

defineExpose({ openFile, close });

</script>

<template>
  <Transition name="pankow-fade">
    <div class="viewer-container" v-show="viewer === 'image'">
      <ImageViewer ref="imageViewer" @close="onViewerClose" :navigation-handler="onImageViewerNavigate" :download-handler="downloadHandler" />
    </div>
  </Transition>
  <Transition name="pankow-fade">
    <div class="viewer-container" v-show="viewer === 'text'">
      <TextViewer ref="textViewer" @close="onViewerClose" :save-handler="saveHandler" :readonly="readonly" />
    </div>
  </Transition>
  <Transition name="pankow-fade">
    <div class="viewer-container" v-show="viewer === 'pdf'">
      <PdfViewer ref="pdfViewer" @close="onViewerClose" />
    </div>
  </Transition>
  <Transition name="pankow-fade">
    <div class="viewer-container" v-show="viewer === 'markdown'">
      <MarkdownEditor ref="markdownEditor" @close="onViewerClose" :profile="profile" :save-handler="saveHandler" />
    </div>
  </Transition>
  <Transition name="pankow-fade">
    <div class="viewer-container" v-show="viewer === 'threed'">
      <ThreeDViewer ref="threeDViewer" @close="onViewerClose" />
    </div>
  </Transition>
  <Transition name="pankow-fade">
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

</style>
