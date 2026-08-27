<template>
  <div class="markdown-viewer">
    <div class="viewer-header">
      <div class="viewer-title">{{ entry.fileName }}</div>
      <div class="viewer-actions">
        <Button v-if="openWithHandler" icon="fa-solid fa-pencil" outline @click="openWithHandler">Edit</Button>
        <Button icon="fa-solid fa-xmark" @click="onClose">{{ utils.translation('main.dialog.close') }}</Button>
      </div>
    </div>

    <div class="editor-area">
      <div class="outline-wrapper">
        <div v-if="headings.length > 0" class="document-outline" @mouseenter="onOutlineEnter" @mouseleave="onOutlineLeave">
          <div class="outline-schematic" @click="onOutlineToggle">
            <div
              v-for="h in headings"
              :key="h.id"
              class="schematic-line"
              :class="{ 'schematic-line-active': h.id === activeId }"
              :style="{ width: getLineWidth(h.level) + 'px' }"
              @click.stop="scrollToHeading(h.id)"
            />
          </div>

          <Transition name="outline-slide">
            <aside v-if="showFull" class="outline-full">
              <nav class="outline-nav">
                <button
                  v-for="h in headings"
                  :key="h.id"
                  class="outline-item"
                  :class="{ 'outline-item-active': h.id === activeId }"
                  :style="{ paddingLeft: (8 + (h.level - 1) * 12) + 'px' }"
                  @click="scrollToHeading(h.id)"
                >
                  <span class="outline-item-text">{{ h.text || '(empty heading)' }}</span>
                </button>
              </nav>
            </aside>
          </Transition>
        </div>
      </div>

      <div ref="scrollAreaRef" class="editor-scroll-area" @scroll="throttledUpdateActiveHeading">
        <div class="editor-layout">
          <div class="editor-container">
            <div ref="contentRef" class="markdown-body" v-html="html"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>

import { ref, useTemplateRef, nextTick, onBeforeUnmount } from 'vue';
import { Button, utils } from '@cloudron/pankow';
import { Marked } from 'marked';
import DOMPurify from 'dompurify';
import { common, createLowlight } from 'lowlight';
import slugify from '../slugify.js';

const lowlight = createLowlight(common);

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hastToHtml(node) {
  if (!node) return '';
  if (node.type === 'text') return escapeHtml(node.value);
  if (node.type === 'element') {
    const tag = node.tagName;
    const props = node.properties || {};
    const attrs = Object.keys(props).map((key) => {
      const value = props[key];
      if (value === null || value === false || value === undefined) return '';
      const name = key === 'className' ? 'class' : key;
      if (value === true) return ` ${name}`;
      if (Array.isArray(value)) return ` ${name}="${escapeHtml(value.join(' '))}"`;
      return ` ${name}="${escapeHtml(value)}"`;
    }).join('');
    const children = (node.children || []).map(hastToHtml).join('');
    return `<${tag}${attrs}>${children}</${tag}>`;
  }
  if (node.type === 'root') return (node.children || []).map(hastToHtml).join('');
  return '';
}

function highlightCode(code, lang) {
  try {
    if (lang) return hastToHtml(lowlight.highlight(lang, code));
  } catch (e) {
    // unknown language, fall through to auto-detection
  }
  try {
    return hastToHtml(lowlight.highlightAuto(code));
  } catch (e) {
    return escapeHtml(code);
  }
}

const marked = new Marked();
marked.use({
  renderer: {
    code(token) {
      const lang = (token.lang || '').split(/\s+/)[0];
      const langClass = lang ? ` language-${lang}` : '';
      return `<pre><code class="hljs${langClass}">${highlightCode(token.text, lang)}</code></pre>`;
    },
  },
});

const emit = defineEmits(['close']);

const props = defineProps({
  openWithHandler: {
    type: Function,
    default: null,
  },
});

const entry = ref({});
const html = ref('');

const contentRef = useTemplateRef('contentRef');
const scrollAreaRef = useTemplateRef('scrollAreaRef');

const headings = ref([]);
const activeId = ref(null);
const showFull = ref(false);

const canHover = window.matchMedia('(hover: hover)').matches;

function onOutlineEnter() {
  if (canHover) showFull.value = true;
}

function onOutlineLeave() {
  if (canHover) showFull.value = false;
}

function onOutlineToggle() {
  showFull.value = !showFull.value;
}

let rafId = null;

function getLineWidth(level) {
  return 30 - (level - 1) * 5;
}

function slug(text) {
  return slugify(text) || 'section';
}

function buildOutline() {
  const container = contentRef.value;
  if (!container) {
    headings.value = [];
    return;
  }

  const items = [];
  const seen = {};
  container.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((el) => {
    const base = slug(el.textContent.trim());
    let id = base;
    let n = 1;
    while (seen[id]) {
      id = `${base}-${++n}`;
    }
    seen[id] = true;
    el.id = id;
    items.push({
      id,
      level: parseInt(el.tagName.charAt(1), 10),
      text: el.textContent.trim(),
      el,
    });
  });
  headings.value = items;
  activeId.value = null;
}

function scrollToHeading(id) {
  const heading = headings.value.find((h) => h.id === id);
  if (heading && heading.el) {
    heading.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function updateActiveHeading() {
  const sc = scrollAreaRef.value;
  if (!sc || headings.value.length === 0) {
    activeId.value = null;
    return;
  }

  const threshold = sc.getBoundingClientRect().top + 60;
  let current = null;
  for (const h of headings.value) {
    if (h.el.getBoundingClientRect().top <= threshold) {
      current = h.id;
    } else {
      break;
    }
  }
  activeId.value = current;
}

function throttledUpdateActiveHeading() {
  if (rafId !== null) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    updateActiveHeading();
  });
}

function canHandle(e) {
  if (e.isBinary) return false;
  return e.fileName.endsWith('md');
}

async function open(e, content) {
  if (!e || e.isDirectory || !canHandle(e)) return;

  entry.value = e;

  try {
    html.value = DOMPurify.sanitize(marked.parse(content));
  } catch (err) {
    console.error('Failed to render markdown', err);
    html.value = `<pre>${escapeHtml(String(content))}</pre>`;
  }

  showFull.value = false;
  activeId.value = null;

  await nextTick();
  buildOutline();
  updateActiveHeading();
}

function onClose() {
  emit('close');
}

onBeforeUnmount(() => {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
});

defineExpose({ canHandle, open });

</script>

<style scoped>

.markdown-viewer {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--pankow-color-background);
}

.viewer-header {
  display: flex;
  align-items: center;
  padding: 5px 10px;
  background-color: var(--pankow-color-background);
  border-bottom: 1px solid var(--pankow-color-border);
  flex-shrink: 0;
}

.viewer-title {
  flex-grow: 1;
  font-weight: var(--pankow-font-weight-bold);
  padding: 0 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.viewer-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

.editor-area {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.editor-scroll-area {
  height: 100%;
  overflow-y: auto;
}

.editor-layout {
  width: 100%;
  max-width: 1024px;
  margin: 0 auto;
  height: 100%;
}

.editor-container {
  position: relative;
  height: 100%;
}

.outline-wrapper {
  position: absolute;
  right: 0;
  top: 0;
  height: 100%;
  z-index: 1;
}

.document-outline {
  position: absolute;
  right: 0;
  top: 0;
  height: 100%;
  display: flex;
  flex-direction: row-reverse;
  z-index: 2;
}

.outline-schematic {
  width: 38px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  padding: 24px 4px 24px 0;
  cursor: pointer;
  height: 100%;
  overflow-y: auto;
  scrollbar-width: none;
}

.outline-schematic::-webkit-scrollbar {
  display: none;
}

.schematic-line {
  height: 2px;
  border-radius: 2px;
  background: var(--pankow-color-text-secondary);
  opacity: 0.3;
  flex-shrink: 0;
  transition: opacity 0.15s, background 0.15s;
}

.schematic-line-active {
  opacity: 0.8;
  background: var(--pankow-color-primary);
}

.outline-full {
  width: 200px;
  flex-shrink: 0;
  overflow-y: auto;
  padding: 8px;
  margin: 12px 0;
  background: var(--pankow-color-background);
  border: 1px solid var(--pankow-color-border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  align-self: flex-start;
  max-height: calc(100% - 24px);
}

.outline-nav {
  display: flex;
  flex-direction: column;
}

.outline-item {
  display: block;
  width: 100%;
  padding: 4px 16px;
  border: none;
  background: none;
  cursor: pointer;
  text-align: left;
  font-size: 13px;
  line-height: 1.5;
  color: var(--pankow-color-text-secondary);
  font-family: inherit;
  border-radius: 6px;
  transition: color 0.1s, background 0.1s;
}

.outline-item:hover {
  color: var(--pankow-color-text);
  background: var(--pankow-color-background-hover);
}

.outline-item-active {
  color: var(--pankow-color-primary);
  font-weight: var(--pankow-font-weight-bold);
}

.outline-item-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.outline-slide-enter-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.outline-slide-leave-active {
  transition: opacity 0.1s ease, transform 0.1s ease;
}

.outline-slide-enter-from {
  opacity: 0;
  transform: translateX(10px);
}

.outline-slide-leave-to {
  opacity: 0;
  transform: translateX(10px);
}

</style>

<style scoped>

.markdown-body {
  padding: 4px 16px;
  line-height: 1.5;
  font-size: 16px;
  word-wrap: break-word;
  white-space: break-spaces;
  -webkit-font-variant-ligatures: none;
  font-variant-ligatures: none;
  font-feature-settings: "liga" 0;
  min-height: 100%;
}

.markdown-body :deep(pre) {
  white-space: pre-wrap;
  background-color: #1e1e1e;
  color: #d4d4d4;
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  padding: 1em;
  border-radius: var(--pankow-border-radius);
  overflow-x: auto;
}

.markdown-body :deep(pre code) {
  background: none;
  padding: 0;
  font-size: 0.9em;
  color: inherit;
}

.markdown-body :deep(.hljs-comment),
.markdown-body :deep(.hljs-quote) { color: #6a9955; font-style: italic; }
.markdown-body :deep(.hljs-keyword),
.markdown-body :deep(.hljs-selector-tag),
.markdown-body :deep(.hljs-addition) { color: #569cd6; }
.markdown-body :deep(.hljs-number),
.markdown-body :deep(.hljs-string),
.markdown-body :deep(.hljs-meta .hljs-meta-string),
.markdown-body :deep(.hljs-literal),
.markdown-body :deep(.hljs-doctag),
.markdown-body :deep(.hljs-regexp) { color: #ce9178; }
.markdown-body :deep(.hljs-title),
.markdown-body :deep(.hljs-section),
.markdown-body :deep(.hljs-name),
.markdown-body :deep(.hljs-selector-id),
.markdown-body :deep(.hljs-selector-class) { color: #dcdcaa; }
.markdown-body :deep(.hljs-attribute),
.markdown-body :deep(.hljs-attr),
.markdown-body :deep(.hljs-variable),
.markdown-body :deep(.hljs-template-variable),
.markdown-body :deep(.hljs-class .hljs-title),
.markdown-body :deep(.hljs-type) { color: #4ec9b0; }
.markdown-body :deep(.hljs-symbol),
.markdown-body :deep(.hljs-bullet),
.markdown-body :deep(.hljs-subst),
.markdown-body :deep(.hljs-meta),
.markdown-body :deep(.hljs-meta .hljs-keyword),
.markdown-body :deep(.hljs-selector-attr),
.markdown-body :deep(.hljs-selector-pseudo),
.markdown-body :deep(.hljs-link) { color: #d4d4d4; }
.markdown-body :deep(.hljs-built_in),
.markdown-body :deep(.hljs-deletion) { color: #ce9178; }
.markdown-body :deep(.hljs-function) { color: #dcdcaa; }
.markdown-body :deep(.hljs-params) { color: #9cdcfe; }
.markdown-body :deep(.hljs-property) { color: #9cdcfe; }
.markdown-body :deep(.hljs-punctuation) { color: #d4d4d4; }
.markdown-body :deep(.hljs-operator) { color: #d4d4d4; }
.markdown-body :deep(.hljs-tag) { color: #569cd6; }
.markdown-body :deep(.hljs-tag .hljs-attr) { color: #9cdcfe; }
.markdown-body :deep(.hljs-tag .hljs-string) { color: #ce9178; }

.markdown-body :deep(li) { position: relative; }
.markdown-body :deep(img) { max-width: 100%; display: block; }

.markdown-body :deep(a) {
  color: var(--pankow-color-primary);
}
.markdown-body :deep(a:hover) {
  color: var(--pankow-color-primary-hover);
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 30px;
}

.markdown-body :deep(blockquote) {
  padding-left: 1em;
  border-left: 3px solid var(--pankow-color-border);
  margin-left: 0;
  margin-right: 0;
}

.markdown-body :deep(p) { margin-bottom: 1em; }

.markdown-body :deep(li p),
.markdown-body :deep(li p:first-child) {
  margin-top: 0;
  margin-bottom: 0;
}

.markdown-body :deep(table) {
  border-collapse: collapse;
  width: 100%;
}

.markdown-body :deep(td),
.markdown-body :deep(th) {
  border: 1px solid var(--pankow-color-border);
  padding: 6px 8px;
  vertical-align: top;
  box-sizing: border-box;
}

.markdown-body :deep(th) {
  font-weight: 600;
  background: var(--pankow-color-background-hover, rgba(0, 0, 0, 0.04));
  text-align: left;
}

.markdown-body :deep(h1) { font-size: 2em; }
.markdown-body :deep(h2) { font-size: 1.5em; }
.markdown-body :deep(h3) { font-size: 1.17em; }
.markdown-body :deep(h4) { font-size: 1em; }
.markdown-body :deep(h5) { font-size: 0.83em; }
.markdown-body :deep(h6) { font-size: 0.67em; }

.markdown-body :deep(hr) {
  border: none;
  height: 2px;
  margin: 1.5em 0;
  background-color: var(--pankow-text-color);
  opacity: 0.3;
}

.markdown-body :deep(p:first-child),
.markdown-body :deep(h1:first-child),
.markdown-body :deep(h2:first-child),
.markdown-body :deep(h3:first-child),
.markdown-body :deep(h4:first-child),
.markdown-body :deep(h5:first-child),
.markdown-body :deep(h6:first-child) {
  margin-top: 16px;
}

</style>
