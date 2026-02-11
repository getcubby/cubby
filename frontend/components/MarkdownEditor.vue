<template>
  <MainLayout :gap="false" class="main-layout">
    <template #dialogs>
      <InputDialog ref="inputDialog" />
    </template>
    <template #header>
      <div class="tool-bar">
        <div class="tool-bar-left" style="align-content: center;">
          <b>{{ entry.fileName }}</b>
        </div>

        <div class="tool-bar-center pankow-no-mobile" v-if="editor">
          <ButtonGroup>
            <Button icon="fa-solid fa-bold" secondary :outline="!editor.isActive('bold') ? true : null" :disabled="!editor.can().toggleBold()" tool @click="editor.chain().focus().toggleBold().run()" />
            <Button icon="fa-solid fa-italic" secondary :outline="!editor.isActive('italic') ? true : null" :disabled="!editor.can().toggleItalic()" tool @click="editor.chain().focus().toggleItalic().run()" />
            <Button icon="fa-solid fa-strikethrough" secondary :outline="!editor.isActive('strike') ? true : null" :disabled="!editor.can().toggleStrike()" tool @click="editor.chain().focus().toggleStrike().run()" />
            <Button icon="fa-solid fa-code" secondary :outline="!editor.isActive('code') ? true : null" :disabled="!editor.can().toggleCode()" tool @click="editor.chain().focus().toggleCode().run()" />
            <Button icon="fa-solid fa-file-code" secondary :outline="!editor.isActive('codeBlock') ? true : null" tool @click="editor.chain().focus().toggleCodeBlock().run()" />
          </ButtonGroup>

          <Button secondary outline :menu="blockTypes" style="margin-right: 40px; min-width: 124px">{{ activeBlockTypeLabel }}</Button>

          <ButtonGroup>
            <Button icon="fa-solid fa-list-ul" secondary outline tool @click="editor.chain().focus().toggleBulletList().run()" />
            <Button icon="fa-solid fa-list-ol" secondary outline tool @click="editor.chain().focus().toggleOrderedList().run()" />
          </ButtonGroup>

          <ButtonGroup>
            <Button icon="fa-solid fa-outdent" secondary outline tool :disabled="!editor.can().liftListItem('listItem')" @click="editor.chain().focus().liftListItem('listItem').run()" />
            <Button icon="fa-solid fa-indent" secondary outline tool :disabled="!editor.can().sinkListItem('listItem')" @click="editor.chain().focus().sinkListItem('listItem').run()" />
          </ButtonGroup>

          <Button icon="fa-solid fa-image" secondary outline tool @click="onAddImage()" style="margin-left: 40px; margin-right: 40px;" />

          <Button icon="fa-solid fa-minus" secondary outline tool @click="editor.chain().focus().setHorizontalRule().run()" style="margin-left: 40px; margin-right: 40px;" />

          <ButtonGroup>
            <Button icon="fa-solid fa-rotate-left" secondary outline tool @click="editor.chain().focus().undo().run()" />
            <Button icon="fa-solid fa-rotate-right" secondary outline tool @click="editor.chain().focus().redo().run()" style="margin-right: 40px;" />
          </ButtonGroup>
        </div>
        <div class="tool-bar-right">
          <span class="save-indicator">
            <Icon v-if="busySave" icon="fa-solid fa-spinner fa-spin" />
            <Icon v-else-if="isChanged" icon="fa-solid fa-circle" class="unsaved" />
            <Icon v-else icon="fa-solid fa-check" class="saved" />
          </span>
          <Button tool icon="fa-solid fa-xmark" @click="onClose"/>
        </div>
      </div>
    </template>
    <template #body>
      <div class="editor-container">
        <aside class="outline-panel" v-if="editor && outline.length > 0">
          <nav class="outline-nav">
            <a v-for="(heading, index) in outline"
               :key="index"
               :class="['outline-item', `outline-level-${heading.level}`]"
               @click.prevent="scrollToHeading(heading.pos)">
              {{ heading.text || '(empty heading)' }}
            </a>
          </nav>
        </aside>
        <div class="editor-wrapper" @contextmenu.prevent="onContextMenu($event)">
          <EditorContent v-if="editor" :editor="editor" class="editor" />
        </div>
      </div>
      <Menu ref="contextMenu" :model="contextMenuModel" />
    </template>
  </MainLayout>
</template>

<script>

import { markRaw } from 'vue';
import { MainLayout, Button, ButtonGroup, Icon, InputDialog, Menu, utils } from '@cloudron/pankow';

import { Editor, EditorContent, Extension } from '@tiptap/vue-3';
import { Plugin } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import Collaboration from '@tiptap/extension-collaboration';
import { Markdown } from '@tiptap/markdown';
import { yCursorPlugin, prosemirrorToYXmlFragment } from '@tiptap/y-tiptap';

// Custom Image extension with Kramdown-style markdown support for image dimensions
// Supports syntax: ![alt](url){width=X height=Y}
// Also adds drag-to-resize functionality on image edges
const ImageWithResize = Image.extend({
  // Custom tokenizer to parse {width=X height=Y} after image markdown
  markdownTokenizer: {
    name: 'image',
    level: 'inline',
    start: '![',
    tokenize(src, tokens, helpers) {
      const match = src.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)(?:\{([^}]+)\})?/);
      if (!match) return null;

      const [raw, alt, href, title, attrsStr] = match;
      let width = null;
      let height = null;
      if (attrsStr) {
        const widthMatch = attrsStr.match(/width=(\d+)/);
        const heightMatch = attrsStr.match(/height=(\d+)/);
        if (widthMatch) width = parseInt(widthMatch[1], 10);
        if (heightMatch) height = parseInt(heightMatch[1], 10);
      }

      return {
        type: 'image',
        raw,
        href,
        text: alt,
        title: title || null,
        width,
        height,
      };
    },
  },

  parseMarkdown: (token, helpers) => {
    return helpers.createNode('image', {
      src: token.href,
      title: token.title,
      alt: token.text,
      width: token.width || null,
      height: token.height || null,
    });
  },

  renderMarkdown: (node, helpers, ctx) => {
    const attrs = node.attrs || {};
    const src = attrs.src ?? '';
    const alt = attrs.alt ?? '';
    const title = attrs.title ?? '';
    const width = attrs.width;
    const height = attrs.height;

    let md = title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`;

    const dimensions = [];
    if (width) dimensions.push(`width=${width}`);
    if (height) dimensions.push(`height=${height}`);
    if (dimensions.length > 0) {
      md += `{${dimensions.join(' ')}}`;
    }

    return md;
  },

  addOptions() {
    return {
      ...this.parent?.(),
      allowBase64: true,
    };
  },

  // Custom node view for drag-to-resize functionality from any edge or corner
  addNodeView() {
    return ({ node, getPos, editor }) => {
      // Create wrapper container
      const container = document.createElement('div');
      container.classList.add('image-resizer');

      // Create the image element
      const img = document.createElement('img');
      img.src = node.attrs.src;
      if (node.attrs.alt) img.alt = node.attrs.alt;
      if (node.attrs.title) img.title = node.attrs.title;
      if (node.attrs.width) img.style.width = `${node.attrs.width}px`;
      if (node.attrs.height) img.style.height = `${node.attrs.height}px`;
      img.draggable = false;

      container.appendChild(img);

      // Create resize handles for all edges and corners
      const handles = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
      const handleElements = {};
      
      handles.forEach(direction => {
        const handle = document.createElement('div');
        handle.classList.add('image-resize-handle', `handle-${direction}`);
        handle.dataset.direction = direction;
        container.appendChild(handle);
        handleElements[direction] = handle;
      });

      let isResizing = false;
      let currentDirection = null;
      let startX = 0;
      let startY = 0;
      let startWidth = 0;
      let startHeight = 0;
      let aspectRatio = 1;

      const onMouseDown = (e) => {
        if (!e.target.dataset.direction) return;
        
        e.preventDefault();
        e.stopPropagation();
        isResizing = true;
        currentDirection = e.target.dataset.direction;
        startX = e.clientX;
        startY = e.clientY;
        startWidth = img.offsetWidth;
        startHeight = img.offsetHeight;
        aspectRatio = startWidth / startHeight;
        container.classList.add('resizing');
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      };

      const onMouseMove = (e) => {
        if (!isResizing) return;
        
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        
        let newWidth = startWidth;
        let newHeight = startHeight;
        
        // Calculate new dimensions based on which handle is being dragged
        const dir = currentDirection;
        
        // Horizontal resizing
        if (dir.includes('e')) {
          newWidth = Math.max(50, startWidth + deltaX);
        } else if (dir.includes('w')) {
          newWidth = Math.max(50, startWidth - deltaX);
        }
        
        // Vertical resizing
        if (dir.includes('s')) {
          newHeight = Math.max(50, startHeight + deltaY);
        } else if (dir.includes('n')) {
          newHeight = Math.max(50, startHeight - deltaY);
        }
        
        // For corner handles, maintain aspect ratio
        if (dir.length === 2) {
          // Use the dimension that changed more to determine the other
          const widthRatio = newWidth / startWidth;
          const heightRatio = newHeight / startHeight;
          
          if (Math.abs(widthRatio - 1) > Math.abs(heightRatio - 1)) {
            newHeight = Math.round(newWidth / aspectRatio);
          } else {
            newWidth = Math.round(newHeight * aspectRatio);
          }
        }
        
        // For edge handles (single direction), adjust to maintain aspect ratio
        if (dir === 'e' || dir === 'w') {
          newHeight = Math.round(newWidth / aspectRatio);
        } else if (dir === 'n' || dir === 's') {
          newWidth = Math.round(newHeight * aspectRatio);
        }

        img.style.width = `${newWidth}px`;
        img.style.height = `${newHeight}px`;
      };

      const onMouseUp = () => {
        if (!isResizing) return;
        isResizing = false;
        currentDirection = null;
        container.classList.remove('resizing');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        // Commit the new size to the document
        const pos = getPos();
        if (pos !== undefined) {
          const newWidth = img.offsetWidth;
          const newHeight = img.offsetHeight;
          editor.chain().setNodeSelection(pos).updateAttributes('image', {
            width: newWidth,
            height: newHeight,
          }).run();
        }
      };

      container.addEventListener('mousedown', onMouseDown);

      return {
        dom: container,
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'image') return false;
          
          img.src = updatedNode.attrs.src;
          if (updatedNode.attrs.alt) img.alt = updatedNode.attrs.alt;
          if (updatedNode.attrs.title) img.title = updatedNode.attrs.title;
          if (updatedNode.attrs.width) img.style.width = `${updatedNode.attrs.width}px`;
          if (updatedNode.attrs.height) img.style.height = `${updatedNode.attrs.height}px`;
          
          return true;
        },
        destroy: () => {
          container.removeEventListener('mousedown', onMouseDown);
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
        },
      };
    };
  },
});

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

// Custom extension wrapping @tiptap/y-tiptap's cursor plugin,
// since @tiptap/extension-collaboration-cursor still uses the old y-prosemirror plugin keys
const CollaborationCursor = Extension.create({
  name: 'collaborationCursor',
  addOptions() {
    return { provider: null, user: { name: 'Anonymous', color: '#cccccc' } };
  },
  addProseMirrorPlugins() {
    const { provider, user } = this.options;
    if (!provider) return [];
    provider.awareness.setLocalStateField('user', user);
    return [yCursorPlugin(provider.awareness)];
  },
});

// Custom extension to handle pasting images from clipboard as base64
const ImagePaste = Extension.create({
  name: 'imagePaste',
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        props: {
          handlePaste(view, event) {
            const items = event.clipboardData?.items;
            if (!items) return false;

            for (const item of items) {
              if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (!file) continue;

                const reader = new FileReader();
                reader.onload = (e) => {
                  const dataUrl = e.target.result;
                  editor.chain().focus().setImage({ src: dataUrl }).run();
                };
                reader.readAsDataURL(file);
                return true; // Prevent default paste
              }
            }
            return false; // Let other paste handlers run
          }
        }
      })
    ];
  }
});

import MainModel from '../models/MainModel.js';

// cannot be reactive
let provider;

const SAVE_DEBOUNCE_MS = 2000;

const WEBSOCKET_URI = import.meta.env.VITE_API_ORIGIN ? import.meta.env.VITE_API_ORIGIN.replace('http://', 'ws://') : `wss://${window.location.hostname}`;

export default {
  name: 'MarkdownEditor',
  components: {
    Button,
    ButtonGroup,
    EditorContent,
    Icon,
    InputDialog,
    MainLayout,
    Menu
  },
  props: {
    saveHandler: {
      type: Function,
      default() { console.warn('Missing saveHandler for MarkdownEditor'); }
    },
    profile: {
      type: Object,
      default() { return {}; }
    },
    tr: {
      type: Function,
      default(id) { console.warn('Missing tr for MarkdownEditor'); return utils.translation(id); }
    }
  },
  emits: [ 'close' ],
  data() {
    return {
      busySave: false,
      isChanged: false,
      saveDebounceTimeout: null,
      entry: {},
      editor: null,
      activeBlockTypeLabel: 'Paragraph',
      blockTypes: [{
        slug: 'p',
        label: 'Paragraph',
        action: () => this.editor?.chain().focus().setParagraph().run()
      }, {
        slug: 'h1',
        label: 'Header 1',
        action: () => this.editor?.chain().focus().toggleHeading({ level: 1 }).run()
      }, {
        slug: 'h2',
        label: 'Header 2',
        action: () => this.editor?.chain().focus().toggleHeading({ level: 2 }).run()
      }, {
        slug: 'h3',
        label: 'Header 3',
        action: () => this.editor?.chain().focus().toggleHeading({ level: 3 }).run()
      }, {
        slug: 'h4',
        label: 'Header 4',
        action: () => this.editor?.chain().focus().toggleHeading({ level: 4 }).run()
      }, {
        slug: 'code',
        label: 'Code Block',
        action: () => this.editor?.chain().focus().toggleCodeBlock().run()
      }],
      outline: [], // Array of { level: number, text: string, pos: number }
      contextMenuModel: [{
        label: 'Bold',
        icon: 'fa-solid fa-bold',
        action: () => this.editor?.chain().focus().toggleBold().run(),
        disabled: () => !this.editor?.can().toggleBold()
      }, {
        label: 'Italic',
        icon: 'fa-solid fa-italic',
        action: () => this.editor?.chain().focus().toggleItalic().run(),
        disabled: () => !this.editor?.can().toggleItalic()
      }, {
        label: 'Code',
        icon: 'fa-solid fa-code',
        action: () => this.editor?.chain().focus().toggleCode().run(),
        disabled: () => !this.editor?.can().toggleCode()
      }, {
        label: 'Strikethrough',
        icon: 'fa-solid fa-strikethrough',
        action: () => this.editor?.chain().focus().toggleStrike().run(),
        disabled: () => !this.editor?.can().toggleStrike()
      }, {
        separator: true
      }, {
        label: 'Bullet List',
        icon: 'fa-solid fa-list-ul',
        action: () => this.editor?.chain().focus().toggleBulletList().run()
      }, {
        label: 'Ordered List',
        icon: 'fa-solid fa-list-ol',
        action: () => this.editor?.chain().focus().toggleOrderedList().run()
      }, {
        separator: true
      }, {
        label: 'Horizontal Rule',
        icon: 'fa-solid fa-minus',
        action: () => this.editor?.chain().focus().setHorizontalRule().run()
      }, {
        label: 'Add Image',
        icon: 'fa-solid fa-image',
        action: () => this.onAddImage()
      }, {
        separator: true
      }, {
        label: 'Undo',
        icon: 'fa-solid fa-rotate-left',
        action: () => this.editor?.chain().focus().undo().run()
      }, {
        label: 'Redo',
        icon: 'fa-solid fa-rotate-right',
        action: () => this.editor?.chain().focus().redo().run()
      }]
    };
  },
  methods: {
    onContextMenu(event) {
      if (!this.editor) return;
      this.$refs.contextMenu.open(event);
    },
    updateOutline() {
      if (!this.editor) {
        this.outline = [];
        return;
      }

      const headings = [];
      this.editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading') {
          headings.push({
            level: node.attrs.level,
            text: node.textContent,
            pos: pos
          });
        }
      });
      this.outline = headings;
    },
    scrollToHeading(pos) {
      if (!this.editor) return;

      // Get the DOM node for the heading element
      const node = this.editor.view.nodeDOM(pos);

      if (node && node.nodeType === Node.ELEMENT_NODE) {
        // Scroll first, then set cursor position after a brief delay
        // to prevent the focus scroll from overriding our scroll
        node.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Set cursor position after scroll completes
        setTimeout(() => {
          this.editor.chain().setTextSelection(pos + 1).run();
        }, 300);
      }
    },
    updateActiveBlockTypeLabel() {
      if (!this.editor) return;

      if (this.editor.isActive('heading', { level: 1 })) {
        this.activeBlockTypeLabel = 'Header 1';
      } else if (this.editor.isActive('heading', { level: 2 })) {
        this.activeBlockTypeLabel = 'Header 2';
      } else if (this.editor.isActive('heading', { level: 3 })) {
        this.activeBlockTypeLabel = 'Header 3';
      } else if (this.editor.isActive('heading', { level: 4 })) {
        this.activeBlockTypeLabel = 'Header 4';
      } else if (this.editor.isActive('codeBlock')) {
        this.activeBlockTypeLabel = 'Code Block';
      } else {
        this.activeBlockTypeLabel = 'Paragraph';
      }
    },
    async onAddImage() {
      if (!this.editor) return;

      let src = '';

      // if an image node is selected, pre-fill with its current src for editing
      const { state } = this.editor;
      if (state.selection.node?.type.name === 'image') {
        src = state.selection.node.attrs.src;
      }

      const imageUrl = await this.$refs.inputDialog.prompt({
        message: 'Image URL',
        modal: false,
        value: src,
        confirmStyle: 'success',
        confirmLabel: 'Add',
        rejectLabel: 'Close'
      });
      if (!imageUrl) return;

      this.editor.chain().focus().setImage({ src: imageUrl, alt: 'Image alt text', title: 'Image title' }).run();
    },
    canHandle(entry) {
      return entry.fileName.endsWith('md');
    },
    async onSave() {
      if (!this.editor) return;

      this.busySave = true;

      await this.saveHandler(this.entry, this.editor.getMarkdown());

      this.isChanged = false;
      this.busySave = false;
    },
    createEditor(ydoc, fragmentName) {
      this.editor = markRaw(new Editor({
        extensions: [
          StarterKit.configure({ undoRedo: false, codeBlock: false }),
          ImageWithResize,
          CodeBlockLowlight.configure({
            lowlight: createLowlight(common),
          }),
          Markdown,
          Collaboration.configure({
            document: ydoc,
            field: fragmentName,
          }),
          CollaborationCursor.configure({
            provider,
            user: { name: this.profile.displayName, color: '#27ce65' },
          }),
          ImagePaste,
        ],
        onTransaction: () => {
          this.updateActiveBlockTypeLabel();
          this.updateOutline();
          this.$forceUpdate();
        },
        onUpdate: () => {
          this.isChanged = true;
          if (this.saveDebounceTimeout) clearTimeout(this.saveDebounceTimeout);
          this.saveDebounceTimeout = setTimeout(() => this.onSave(), SAVE_DEBOUNCE_MS);
        },
      }));
      this.updateOutline();
    },
    async open(entry, content) {
      if (!entry || entry.isDirectory || !this.canHandle(entry)) return;

      this.entry = entry;
      this.isChanged = false;

      // starts the ydoc if not exists
      const collabHandle = await MainModel.getCollabHandle(entry);

      const ydoc = new Y.Doc();

      provider = new WebsocketProvider(WEBSOCKET_URI, collabHandle.id, ydoc);
      provider.awareness.setLocalStateField('user', { color: '#27ce65', name: this.profile.displayName });

      // see if we have to init the fragment with the markdown content
      if (collabHandle.isNew) {
        const fragment = ydoc.getXmlFragment(collabHandle.fragmentName);

        // Use a temporary headless editor to parse markdown with the tiptap schema,
        // ensuring node names (camelCase) match what the real editor expects
        const tmpEditor = new Editor({
          extensions: [
            StarterKit.configure({ codeBlock: false }),
            ImageWithResize,
            CodeBlockLowlight.configure({ lowlight: createLowlight(common) }),
            Markdown
          ],
          content: content,
          contentType: 'markdown',
        });
        prosemirrorToYXmlFragment(tmpEditor.state.doc, fragment);
        tmpEditor.destroy();

        // Create editor immediately for new documents (no sync needed)
        this.createEditor(ydoc, collabHandle.fragmentName);
      } else {
        // Wait for sync before creating editor for existing documents
        // This prevents duplication caused by merging empty local state with synced content
        provider.once('synced', () => {
          this.createEditor(ydoc, collabHandle.fragmentName);
        });
      }
    },
    async onClose() {
      if (this.isChanged) {
        const yes = await this.$refs.inputDialog.confirm({
          message: this.tr('filemanager.textEditorCloseDialog.title'),
          confirmStyle: 'danger',
          confirmLabel: 'Discard changes and close',
          rejectLabel: 'Cancel'
        });

        if (!yes) return;
      }

      // clear pending auto-save
      if (this.saveDebounceTimeout) clearTimeout(this.saveDebounceTimeout);

      // stop syncing
      if (provider) provider.destroy();
      if (this.editor) {
        this.editor.destroy();
        this.editor = null;
      }

      this.$emit('close');
    }
  }
};

</script>

<style scoped>

.tool-bar {
  padding: 5px 10px;
  background-color: var(--pankow-color-background);
  display: flex;
}

.tool-bar-center {
  display: flex;
  gap: 6px;
}

.tool-bar-left {
  flex-grow: 1;
}

.tool-bar-right {
  flex-grow: 1;
  text-align: right;
  display: flex;
  gap: 6px;
  justify-content: end;
}

.main-layout {
  background-color: var(--pankow-color-background);
}

@media (prefers-color-scheme: dark) {
  .main-layout {
    background-color: black;
  }
}

.editor-wrapper {
  min-height: 100%;
  width: 100%;
  display: flex;
  justify-content: center;
  padding-top: 20px;
}

.editor {
  background-color: white;
  width: 100%;
  max-width: 1024px;
  box-shadow: var(--pankow-box-shadow);
  color: var(--pankow-text-color);
}

@media (prefers-color-scheme: dark) {
  .editor {
    background-color: var(--pankow-color-background);
  }
}

.save-indicator {
  display: flex;
  align-items: center;
  padding: 0 8px;
}

.save-indicator .unsaved {
  color: var(--pankow-color-warning);
  font-size: 0.5em;
}

.save-indicator .saved {
  color: var(--pankow-color-success);
}

.editor-container {
  display: flex;
  min-height: 100%;
  width: 100%;
}

.outline-panel {
  width: 200px;
  min-width: 200px;
  padding: 20px 10px;
  border-right: 1px solid var(--pankow-color-border);
  overflow-y: auto;
  position: sticky;
  top: 0;
  max-height: 100vh;
}

.outline-nav {
  display: flex;
  flex-direction: column;
}

.outline-item {
  padding: 4px 8px;
  cursor: pointer;
  color: var(--pankow-text-color);
  text-decoration: none;
  font-size: 0.9em;
  border-radius: var(--pankow-border-radius);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.outline-item:hover {
  background-color: var(--pankow-color-background-hover);
}

/* Indentation based on heading level */
.outline-level-1 { padding-left: 8px; font-weight: 600; }
.outline-level-2 { padding-left: 16px; }
.outline-level-3 { padding-left: 24px; }
.outline-level-4 { padding-left: 32px; }
.outline-level-5 { padding-left: 40px; }
.outline-level-6 { padding-left: 48px; }

@media (max-width: 768px) {
  .outline-panel {
    display: none;
  }
}

</style>

<style>
.ProseMirror {
  position: relative;
}

.ProseMirror {
  word-wrap: break-word;
  white-space: pre-wrap;
  white-space: break-spaces;
  -webkit-font-variant-ligatures: none;
  font-variant-ligatures: none;
  font-feature-settings: "liga" 0; /* the above doesn't seem to work in Edge */
}

.ProseMirror pre {
  white-space: pre-wrap;
  background-color: #1e1e1e;
  color: #d4d4d4;
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  padding: 1em;
  border-radius: var(--pankow-border-radius);
  overflow-x: auto;
}

.ProseMirror pre code {
  background: none;
  padding: 0;
  font-size: 0.9em;
  color: inherit;
}

/* Syntax highlighting - based on VS Code Dark+ theme */
.ProseMirror .hljs-comment,
.ProseMirror .hljs-quote {
  color: #6a9955;
  font-style: italic;
}

.ProseMirror .hljs-keyword,
.ProseMirror .hljs-selector-tag,
.ProseMirror .hljs-addition {
  color: #569cd6;
}

.ProseMirror .hljs-number,
.ProseMirror .hljs-string,
.ProseMirror .hljs-meta .hljs-meta-string,
.ProseMirror .hljs-literal,
.ProseMirror .hljs-doctag,
.ProseMirror .hljs-regexp {
  color: #ce9178;
}

.ProseMirror .hljs-title,
.ProseMirror .hljs-section,
.ProseMirror .hljs-name,
.ProseMirror .hljs-selector-id,
.ProseMirror .hljs-selector-class {
  color: #dcdcaa;
}

.ProseMirror .hljs-attribute,
.ProseMirror .hljs-attr,
.ProseMirror .hljs-variable,
.ProseMirror .hljs-template-variable,
.ProseMirror .hljs-class .hljs-title,
.ProseMirror .hljs-type {
  color: #4ec9b0;
}

.ProseMirror .hljs-symbol,
.ProseMirror .hljs-bullet,
.ProseMirror .hljs-subst,
.ProseMirror .hljs-meta,
.ProseMirror .hljs-meta .hljs-keyword,
.ProseMirror .hljs-selector-attr,
.ProseMirror .hljs-selector-pseudo,
.ProseMirror .hljs-link {
  color: #d4d4d4;
}

.ProseMirror .hljs-built_in,
.ProseMirror .hljs-deletion {
  color: #ce9178;
}

.ProseMirror .hljs-function {
  color: #dcdcaa;
}

.ProseMirror .hljs-params {
  color: #9cdcfe;
}

.ProseMirror .hljs-property {
  color: #9cdcfe;
}

.ProseMirror .hljs-punctuation {
  color: #d4d4d4;
}

.ProseMirror .hljs-operator {
  color: #d4d4d4;
}

.ProseMirror .hljs-tag {
  color: #569cd6;
}

.ProseMirror .hljs-tag .hljs-attr {
  color: #9cdcfe;
}

.ProseMirror .hljs-tag .hljs-string {
  color: #ce9178;
}

.ProseMirror li {
  position: relative;
}

.ProseMirror img {
  max-width: 100%;
}

/* Resizable image styles */
.ProseMirror .image-resizer {
  display: inline-block;
  position: relative;
  line-height: 0;
}

.ProseMirror .image-resizer img {
  display: block;
  max-width: 100%;
}

.ProseMirror .image-resizer .image-resize-handle {
  position: absolute;
  opacity: 0;
  transition: opacity 0.15s ease;
  z-index: 10;
}

.ProseMirror .image-resizer:hover .image-resize-handle,
.ProseMirror .image-resizer.resizing .image-resize-handle {
  opacity: 1;
}

/* Corner handles */
.ProseMirror .image-resizer .handle-nw,
.ProseMirror .image-resizer .handle-ne,
.ProseMirror .image-resizer .handle-se,
.ProseMirror .image-resizer .handle-sw {
  width: 12px;
  height: 12px;
  background-color: var(--pankow-color-primary);
  border: 2px solid white;
  border-radius: 3px;
}

.ProseMirror .image-resizer .handle-nw {
  top: -6px;
  left: -6px;
  cursor: nwse-resize;
}

.ProseMirror .image-resizer .handle-ne {
  top: -6px;
  right: -6px;
  cursor: nesw-resize;
}

.ProseMirror .image-resizer .handle-se {
  bottom: -6px;
  right: -6px;
  cursor: nwse-resize;
}

.ProseMirror .image-resizer .handle-sw {
  bottom: -6px;
  left: -6px;
  cursor: nesw-resize;
}

/* Edge handles */
.ProseMirror .image-resizer .handle-n,
.ProseMirror .image-resizer .handle-s {
  left: 50%;
  transform: translateX(-50%);
  width: 30px;
  height: 6px;
  background-color: var(--pankow-color-primary);
  border-radius: 3px;
  cursor: ns-resize;
}

.ProseMirror .image-resizer .handle-n {
  top: -3px;
}

.ProseMirror .image-resizer .handle-s {
  bottom: -3px;
}

.ProseMirror .image-resizer .handle-e,
.ProseMirror .image-resizer .handle-w {
  top: 50%;
  transform: translateY(-50%);
  width: 6px;
  height: 30px;
  background-color: var(--pankow-color-primary);
  border-radius: 3px;
  cursor: ew-resize;
}

.ProseMirror .image-resizer .handle-e {
  right: -3px;
}

.ProseMirror .image-resizer .handle-w {
  left: -3px;
}

.ProseMirror .image-resizer.resizing {
  outline: 2px solid var(--pankow-color-primary);
  outline-offset: 2px;
}

.ProseMirror .image-resizer.resizing img {
  pointer-events: none;
}

.ProseMirror *::selection {
  color: white;
  background-color: var(--pankow-color-primary);
}

.ProseMirror-hideselection *::selection { background: transparent; }
.ProseMirror-hideselection *::-moz-selection { background: transparent; }
.ProseMirror-hideselection { caret-color: transparent; }

/* See https://github.com/ProseMirror/prosemirror/issues/1421#issuecomment-1759320191 */
.ProseMirror [draggable][contenteditable=false] { user-select: text }

.ProseMirror-selectednode {
  border-radius: var(--pankow-border-radius);
  box-shadow: 0 0 0 2px var(--pankow-color-primary);
}

/* Make sure li selections wrap around markers */

li.ProseMirror-selectednode {
  outline: none;
}

li.ProseMirror-selectednode:after {
  content: "";
  position: absolute;
  left: -32px;
  right: -2px; top: -2px; bottom: -2px;
  border: 2px solid #8cf;
  pointer-events: none;
}

/* Protect against generic img rules */

img.ProseMirror-separator {
  display: inline !important;
  border: none !important;
  margin: 0 !important;
}

.ProseMirror-gapcursor {
  display: none;
  pointer-events: none;
  position: absolute;
}

.ProseMirror-gapcursor:after {
  content: "";
  display: block;
  position: absolute;
  top: -2px;
  width: 20px;
  border-top: 1px solid black;
  animation: ProseMirror-cursor-blink 1.1s steps(2, start) infinite;
}

@keyframes ProseMirror-cursor-blink {
  to {
    visibility: hidden;
  }
}

.ProseMirror-focused .ProseMirror-gapcursor {
  display: block;
}

.ProseMirror a {
  color: var(--pankow-color-primary);
}

.ProseMirror a:hover {
  color: var(--pankow-color-primary-hover);
}

.ProseMirror ul, .ProseMirror ol {
  padding-left: 30px;
}

.ProseMirror blockquote {
  padding-left: 1em;
  border-left: 3px solid #eee;
  margin-left: 0; margin-right: 0;
}

#editor, .editor {
  background: white;
  color: black;
  background-clip: padding-box;
  padding: 5px 0;
}

.ProseMirror p:first-child,
.ProseMirror h1:first-child,
.ProseMirror h2:first-child,
.ProseMirror h3:first-child,
.ProseMirror h4:first-child,
.ProseMirror h5:first-child,
.ProseMirror h6:first-child {
  margin-top: 10px;
}

.ProseMirror {
  padding: 4px 14px 4px 14px;
  line-height: 1.2;
  outline: none;
}

.ProseMirror p {
  margin-bottom: 1em
}

.ProseMirror hr {
  padding: 2px 0;
}
.ProseMirror hr::after {
  background-color: var(--pankow-text-color);
}

/* this is a rough fix for the first cursor position when the first paragraph is empty */
.ProseMirror > .ProseMirror-yjs-cursor:first-child {
  margin-top: 16px;
}
.ProseMirror p:first-child, .ProseMirror h1:first-child, .ProseMirror h2:first-child, .ProseMirror h3:first-child, .ProseMirror h4:first-child, .ProseMirror h5:first-child, .ProseMirror h6:first-child {
  margin-top: 16px
}

/* This gives the remote user caret. The colors are automatically overwritten*/
.ProseMirror-yjs-cursor {
  position: relative;
  margin-left: -1px;
  margin-right: -1px;
  border-left: 1px solid black;
  border-right: 1px solid black;
  border-color: orange;
  word-break: normal;
  pointer-events: none;
}

/* This renders the username above the caret */
.ProseMirror-yjs-cursor > div {
  position: absolute;
  top: -1.05em;
  left: -1px;
  background-color: var(--pankow-color-background-hover);
  font-family: var(--font-family);
  font-size: 13px;
  font-style: normal;
  font-weight: normal;
  line-height: normal;
  user-select: none;
  color: white;
  padding: 0 4px;
  white-space: nowrap;
  border-top-left-radius: var(--pankow-border-radius);
}
</style>
