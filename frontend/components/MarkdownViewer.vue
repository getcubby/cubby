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
            <Button icon="fa-solid fa-code" secondary :outline="!editor.isActive('code') ? true : null" :disabled="!editor.can().toggleCode()" tool @click="editor.chain().focus().toggleCode().run()" />
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
          <Button :loading="busySave" icon="fa-solid fa-floppy-disk" success tool @click="onSave" :disabled="busySave || !isChanged"/>
          <Button tool icon="fa-solid fa-xmark" @click="onClose"/>
        </div>
      </div>
    </template>
    <template #body>
      <div class="editor-wrapper">
        <EditorContent v-if="editor" :editor="editor" class="editor" />
      </div>
    </template>
  </MainLayout>
</template>

<script>

import { markRaw } from 'vue';
import { MainLayout, Button, ButtonGroup, Icon, InputDialog, utils } from '@cloudron/pankow';

import { Editor, EditorContent, Extension } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Collaboration from '@tiptap/extension-collaboration';
import { Markdown } from '@tiptap/markdown';
import { yCursorPlugin, prosemirrorToYXmlFragment } from '@tiptap/y-tiptap';

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

import './MarkdownViewer.css';

import MainModel from '../models/MainModel.js';

// cannot be reactive
let provider;

const WEBSOCKET_URI = import.meta.env.VITE_API_ORIGIN ? import.meta.env.VITE_API_ORIGIN.replace('http://', 'ws://') : `wss://${window.location.hostname}`;

export default {
  name: 'MarkdownViewer',
  components: {
    Button,
    ButtonGroup,
    EditorContent,
    Icon,
    InputDialog,
    MainLayout
  },
  props: {
    saveHandler: {
      type: Function,
      default() { console.warn('Missing saveHandler for MarkdownViewer'); }
    },
    profile: {
      type: Object,
      default() { return {}; }
    },
    tr: {
      type: Function,
      default(id) { console.warn('Missing tr for MarkdownViewer'); return utils.translation(id); }
    }
  },
  emits: [ 'close' ],
  data() {
    return {
      busySave: false,
      isChanged: false,
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
      }]
    };
  },
  methods: {
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
          StarterKit.configure({ history: false }),
          Image,
          Markdown,
          Collaboration.configure({
            document: ydoc,
            field: fragmentName,
          }),
          CollaborationCursor.configure({
            provider,
            user: { name: this.profile.displayName, color: '#27ce65' },
          }),
        ],
        onTransaction: () => {
          this.updateActiveBlockTypeLabel();
          this.$forceUpdate();
        },
        onUpdate: () => {
          this.isChanged = true;
        },
      }));
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
          extensions: [StarterKit, Image, Markdown],
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

</style>
