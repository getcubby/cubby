<template>
  <MainLayout :gap="false" class="main-layout">
    <template #dialogs>
      <InputDialog ref="inputDialog" />
      <div ref="selectionOverlay" class="selection-overlay">
        <Button icon="fa-solid fa-pen" tool @click="onEditImage()"/>
      </div>
    </template>
    <template #header>
      <div class="tool-bar">
        <div class="tool-bar-left pankow-no-mobile">
          <Button :loading="busySave" icon="fa-solid fa-floppy-disk" success tool @click="onSave" :disabled="busySave || !isChanged" style="margin-right: 40px;"/>
          <Button icon="fa-solid fa-bold" secondary :outline="!tools.strong.active ? true : null" :disabled="!tools.strong.available" tool @click="onToolbutton(tools.strong)" />
          <Button icon="fa-solid fa-italic" secondary :outline="!tools.em.active ? true : null" :disabled="!tools.em.available" tool @click="onToolbutton(tools.em)" />
          <Button icon="fa-solid fa-code" secondary :outline="!tools.code.active ? true : null" :disabled="!tools.code.available" tool @click="onToolbutton(tools.code)" />

          <Dropdown v-model="paragraphType" :options="paragraphTypes" option-label="display" option-key="slug" style="margin-right: 40px;" />

          <Button icon="fa-solid fa-list-ul" secondary outline tool @click="onToolbutton(tools.ul)" />
          <Button icon="fa-solid fa-list-ol" secondary outline tool @click="onToolbutton(tools.ol)" />

          <Button icon="fa-solid fa-outdent" secondary outline tool :disabled="!tools.lift.available" @click="onToolbutton(tools.lift)" />
          <Button icon="fa-solid fa-indent" secondary outline tool :disabled="!tools.sink.available" @click="onToolbutton(tools.sink)" />

          <Button icon="fa-solid fa-image" secondary outline tool @click="onToolbutton(tools.image)" style="margin-left: 40px; margin-right: 40px;" />

          <Button icon="fa-solid fa-minus" secondary outline tool @click="onToolbutton(tools.hr)" style="margin-left: 40px; margin-right: 40px;" />

          <Button icon="fa-solid fa-rotate-left" secondary outline tool @click="onToolbutton(tools.undo)" />
          <Button icon="fa-solid fa-rotate-right" secondary outline tool @click="onToolbutton(tools.redo)" style="margin-right: 40px;" />
        </div>
        <div class="tool-bar-right">
          <Button icon="fa-solid fa-download" :href="entry.downloadFileUrl" tool target="_blank" />
          <Button icon="fa-solid fa-xmark" @click="onClose">{{ tr('main.dialog.close') }}</Button>
        </div>
      </div>
    </template>
    <template #body>
      <div class="editor-wrapper" @click="focusView()">
        <div class="editor" ref="editorNode"></div>
      </div>
    </template>
  </MainLayout>
</template>

<script>

import { toRaw } from 'vue';
import { MainLayout, Button, Dropdown, InputDialog, utils } from 'pankow';

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { ySyncPlugin, yCursorPlugin, yUndoPlugin, undo, redo, initProseMirrorDoc, prosemirrorToYXmlFragment } from 'y-prosemirror';

import { EditorState, Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
// import { undo, redo, history } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { baseKeymap, toggleMark, setBlockType, wrapIn } from "prosemirror-commands";
import { schema, defaultMarkdownParser, defaultMarkdownSerializer} from "prosemirror-markdown";
import { wrapInList, liftListItem, sinkListItem } from "prosemirror-schema-list"
import { exampleSetup } from "prosemirror-example-setup"
import { Schema } from "prosemirror-model";

import "prosemirror-gapcursor/style/gapcursor.css";
import './MarkdownViewer.css';

const cubbySchema = schema;
// Start with schema below to add custom nodes and marks
// const cubbySchema = new Schema({
//   nodes: schema.spec.nodes, // Include existing nodes
//   marks: schema.spec.marks, // Retain existing marks
// });

// cannot be reactive
let view, provider;

const WEBSOCKET_URI = import.meta.env.VITE_API_ORIGIN ? import.meta.env.VITE_API_ORIGIN.replace('http://', 'ws://') : `wss://${window.location.hostname}`;

// https://github.com/ProseMirror/prosemirror-example-setup/blob/8c11be6850604081dceda8f36e08d2426875e19a/src/menu.ts#L58
function markActive(state, markType) {
  let { from, $from, to, empty } = state.selection
  if (empty) return !!markType.isInSet(state.storedMarks || $from.marks())
  else return state.doc.rangeHasMark(from, to, markType)
}

function canInsert(state, nodeType) {
  let $from = state.selection.$from
  for (let d = $from.depth; d >= 0; d--) {
    let index = $from.index(d)
    if ($from.node(d).canReplaceWith(index, index, nodeType)) return true
  }
  return false
}

// plugin to track editor changes into vuejs
function menuPlugin(app, tools) {
  return new Plugin({
    view(editorView) {
      return {
        update() {
          app.isChanged = true;

          for (const tool in tools) {
            tools[tool].available = tools[tool].cmd(editorView.state, null, editorView);
            if (tools[tool].mark) tools[tool].active = markActive(editorView.state, toRaw(tools[tool].mark));
          }
        }
      };
    }
  })
}

// https://prosemirror.net/examples/tooltip/
// plugin for controls overlay when selection
// currently only shows if image is selected as example use-case
function selectionOverlayPlugin(app, element) {
  function updatePosOnScroll(view) {
    const { from, to } = view.state.selection;

    // These are in screen coordinates
    const start = view.coordsAtPos(from);
    const end = view.coordsAtPos(to);

    element.style.display = 'block';

    // The box in which the tooltip is positioned, to use as base
    let box = element.offsetParent.getBoundingClientRect();

    element.style.left = (end.left - 40) + 'px';
    element.style.bottom = (box.bottom - start.top) + 'px';
  }

  return new Plugin({
    view (editorView) {
      return {
        update(view, lastState) {
          const state = view.state;

          // Don't do anything if the document/selection didn't change
          if (lastState && lastState.doc.eq(state.doc) && lastState.selection.eq(state.selection)) return;

          // only do something if an image is selected
          if (state.selection.empty || !state.selection.node || state.selection.node.type.name !== 'image') {
            element.style.display = 'none';
            document.removeEventListener('scroll', updatePosOnScroll.bind(this, view), true);
            return;
          }

          document.addEventListener('scroll', updatePosOnScroll.bind(this, view), true);
          updatePosOnScroll(view);
        }
      }
    }
  });
}

export default {
  name: 'MarkdownViewer',
  components: {
    Button,
    Dropdown,
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
      isStrong: false,
      paragraphType: null,
      paragraphTypes: [{
        slug: 'p',
        display: 'Normal'
      }, {
        slug: 'h1',
        display: 'Header 1'
      }, {
        slug: 'h2',
        display: 'Header 2'
      }, {
        slug: 'h3',
        display: 'Header 3'
      }, {
        slug: 'h4',
        display: 'Header 4'
      }, {
        slug: 'h5',
        display: 'Header 5'
      }, {
        slug: 'h6',
        display: 'Header 6'
      }, {
        slug: 'code',
        display: 'Code Block'
      }],
      tools: {
        strong: {
          active: false,
          available: false,
          mark: cubbySchema.marks.strong,
          cmd: toggleMark(cubbySchema.marks.strong)
        },
        em: {
          active: false,
          available: false,
          mark: cubbySchema.marks.em,
          cmd: toggleMark(cubbySchema.marks.em)
        },
        code: {
          active: false,
          available: false,
          mark: cubbySchema.marks.code,
          cmd: toggleMark(cubbySchema.marks.code)
        },
        ul: {
          active: false,
          available: false,
          mark: null,
          cmd: wrapInList(cubbySchema.nodes.bullet_list, {})
        },
        ol: {
          active: false,
          available: false,
          mark: null,
          cmd: wrapInList(cubbySchema.nodes.ordered_list, { order: 1 })
        },
        lift: {
          active: false,
          available: false,
          mark: null,
          cmd: liftListItem(cubbySchema.nodes.list_item)
        },
        sink: {
          active: false,
          available: false,
          mark: null,
          cmd: sinkListItem(cubbySchema.nodes.list_item)
        },
        hr: {
          active: false,
          available: false,
          mark: null,
          cmd: (state, dispatch, view) => {
            if (dispatch) dispatch(state.tr.replaceSelectionWith(cubbySchema.nodes.horizontal_rule.create()));
          }
        },
        image: {
          active: false,
          available: false,
          mark: null,
          cmd: async (state, dispatch, view) => {
            if (dispatch) this.addOrEditImage(state);
          }
        },
        undo: {
          active: false,
          available: false,
          mark: null,
          cmd: (state, dispatch, view) => {
            if (dispatch) undo(state);
          }
        },
        redo: {
          active: false,
          available: false,
          mark: null,
          cmd: (state, dispatch, view) => {
            if (dispatch) redo(state);
          }
        }
      }
    };
  },
  watch: {
    paragraphType() {
      if (!view) return;

      let cmd = null;
      if (this.paragraphType === 'p') {
        cmd = setBlockType(cubbySchema.nodes.paragraph, {});
      } else if (this.paragraphType === 'h1') {
        cmd = setBlockType(cubbySchema.nodes.heading, { level: 1 });
      } else if (this.paragraphType === 'h2') {
        cmd = setBlockType(cubbySchema.nodes.heading, { level: 2 });
      } else if (this.paragraphType === 'h3') {
        cmd = setBlockType(cubbySchema.nodes.heading, { level: 3 });
      } else if (this.paragraphType === 'h4') {
        cmd = setBlockType(cubbySchema.nodes.heading, { level: 4 });
      } else if (this.paragraphType === 'h5') {
        cmd = setBlockType(cubbySchema.nodes.heading, { level: 5 });
      } else if (this.paragraphType === 'h6') {
        cmd = setBlockType(cubbySchema.nodes.heading, { level: 6 });
      } else if (this.paragraphType === 'code') {
        cmd = setBlockType(cubbySchema.nodes.code_block, {});
      }

      view.focus();

      if (!cmd) return;

      cmd(view.state, view.dispatch, view);
    }
  },
  mounted() {
    this.paragraphType = this.paragraphTypes[0].slug;
  },
  methods: {
    onEditImage() {
      this.addOrEditImage(view.state);
    },
    async addOrEditImage(state) {
      let src = '';

      // if we have a image node selected we are editing
      if (!state.selection.empty && state.selection.node && state.selection.node.type.name === 'image') src = state.selection.node.attrs.src;

      const imageUrl = await this.$refs.inputDialog.prompt({
        message: 'Image URL',
        modal: false,
        value: src,
        confirmStyle: 'success',
        confirmLabel: 'Add',
        rejectLabel: 'Close'
      });
      if (!imageUrl) return;

      view.dispatch(state.tr.replaceSelectionWith(cubbySchema.nodes.image.create({ title: 'Image title', alt: 'Image alt text', src: imageUrl})));
    },
    canHandle(entry) {
      return entry.fileName.endsWith('md');
    },
    onToolbutton(tool) {
      view.focus();
      tool.cmd(view.state, view.dispatch, view);
    },
    async onSave() {
      this.busySave = true;

      // console.log(defaultMarkdownSerializer.serialize(view.state.doc));
      await this.saveHandler(this.entry, defaultMarkdownSerializer.serialize(view.state.doc));

      this.isChanged = false;
      this.busySave = false;
    },
    async open(entry, content) {
      if (!entry || entry.isDirectory || !this.canHandle(entry)) return;

      this.entry = entry;

      // starts the ydoc if not exists
      const collabHandle = await this.$root.mainModel.getCollabHandle(entry);

      const ydoc = new Y.Doc();

      provider = new WebsocketProvider(WEBSOCKET_URI, collabHandle.id, ydoc);
      provider.awareness.setLocalStateField('user', { color: '#27ce65', name: this.profile.displayName })

      let fragment = ydoc.getXmlFragment(collabHandle.fragmentName);

      // see if we have to init the fragment with the markdown content
      if (collabHandle.isNew) {
        const markdownDoc = defaultMarkdownParser.parse(content);
        fragment = prosemirrorToYXmlFragment(markdownDoc, fragment);
      }

      const { doc, mapping } = initProseMirrorDoc(fragment, cubbySchema)

      view = new EditorView(this.$refs.editorNode, {
        state: EditorState.create({
          doc,
          cubbySchema,
          plugins: [
            ySyncPlugin(fragment, { mapping }),
            yCursorPlugin(provider.awareness),
            yUndoPlugin(),
            keymap({
              'Mod-z': undo,
              'Mod-y': redo,
              'Mod-Shift-z': redo
            })].concat(exampleSetup({ schema: cubbySchema, menuBar: false })).concat(menuPlugin(this, this.tools)).concat(selectionOverlayPlugin(this, this.$refs.selectionOverlay))
          })
      });

      view.focus();
    },
    focusView() {
      if (view) view.focus();
    },
    onClose() {
      // stop syncing
      if (provider) provider.destroy();
      if (view) view.destroy();

      this.$emit('close');
    }
  }
};

</script>

<style scoped>

.viewer {
  height: 100%;
  width: 100%;
  border: none;
}

.tool-bar {
  padding: 5px 10px;
  background-color: var(--pankow-color-background);
  display: flex;
}

.tool-bar-left {
  flex-grow: 1;
}

.tool-bar-right {
  flex-grow: 1;
  text-align: right;
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

.selection-overlay {
  position: absolute;
  display: none;
  z-index: 20;
}

</style>
