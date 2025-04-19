<template>
  <MainLayout :gap="false" class="main-layout">
    <template #dialogs>
      <InputDialog ref="inputDialog" />
      <div ref="selectionOverlay" class="selection-overlay">
        <div class="overlay-button" v-show="overlay.showImageControls" @click="onEditImage()"><Icon icon="fa-solid fa-pen"/></div>
        <div class="overlay-button" v-show="overlay.showLinkControls" @click="onEditSelection()"><Icon icon="fa-solid fa-link"/></div>
      </div>
    </template>
    <template #header>
      <div class="tool-bar">
        <div class="tool-bar-left" style="align-content: center;">
          <b>{{ entry.fileName }}</b>
        </div>

        <div class="tool-bar-center pankow-no-mobile">
          <ButtonGroup>
            <Button icon="fa-solid fa-bold" secondary :outline="!tools.strong.active ? true : null" :disabled="!tools.strong.available" tool @click="onToolbutton(tools.strong)" />
            <Button icon="fa-solid fa-italic" secondary :outline="!tools.em.active ? true : null" :disabled="!tools.em.available" tool @click="onToolbutton(tools.em)" />
            <Button icon="fa-solid fa-code" secondary :outline="!tools.code.active ? true : null" :disabled="!tools.code.available" tool @click="onToolbutton(tools.code)" />
          </ButtonGroup>

          <Button secondary outline :menu="blockTypes" style="margin-right: 40px; min-width: 124px">{{ activeBlockTypeLabel }}</Button>

          <ButtonGroup>
            <Button icon="fa-solid fa-list-ul" secondary outline tool @click="onToolbutton(tools.ul)" />
            <Button icon="fa-solid fa-list-ol" secondary outline tool @click="onToolbutton(tools.ol)" />
          </ButtonGroup>

          <ButtonGroup>
            <Button icon="fa-solid fa-outdent" secondary outline tool :disabled="!tools.lift.available" @click="onToolbutton(tools.lift)" />
            <Button icon="fa-solid fa-indent" secondary outline tool :disabled="!tools.sink.available" @click="onToolbutton(tools.sink)" />
          </ButtonGroup>

          <Button icon="fa-solid fa-image" secondary outline tool @click="onToolbutton(tools.image)" style="margin-left: 40px; margin-right: 40px;" />

          <Button icon="fa-solid fa-minus" secondary outline tool @click="onToolbutton(tools.hr)" style="margin-left: 40px; margin-right: 40px;" />

          <ButtonGroup>
            <Button icon="fa-solid fa-rotate-left" secondary outline tool @click="onToolbutton(tools.undo)" />
            <Button icon="fa-solid fa-rotate-right" secondary outline tool @click="onToolbutton(tools.redo)" style="margin-right: 40px;" />
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
        <div class="editor" ref="editorNode"></div>
      </div>
    </template>
  </MainLayout>
</template>

<script>

import { toRaw } from 'vue';
import { MainLayout, Button, ButtonGroup, Icon, InputDialog, utils } from 'pankow';

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
  const { from, $from, to, empty } = state.selection;

  if (empty) return !!markType.isInSet(state.storedMarks || $from.marks());
  return state.doc.rangeHasMark(from, to, markType);
}

function blockTypeActive(state, nodeType, nodeTypeAttrs) {
  const { $from, node } = state.selection;

  // node would be for example an image node
  if (node) return node.hasMarkup(nodeType, nodeTypeAttrs);
  return $from.parent.hasMarkup(nodeType, nodeTypeAttrs);
}

// plugin to track formatting and tools currently applied to cursor or selection
function menuPlugin(app, tools) {
  return new Plugin({
    view(editorView) {
      return {
        update() {
          const state = editorView.state;

          // FIXME this should only be triggered for actual changes
          app.isChanged = true;

          if (blockTypeActive(state, cubbySchema.nodes.paragraph, {})) {
            app.activeBlockTypeLabel = app.blockTypes[0].label;
          } else if (blockTypeActive(state, cubbySchema.nodes.heading, { level: 1 })) {
            app.activeBlockTypeLabel = app.blockTypes[1].label;
          } else if (blockTypeActive(state, cubbySchema.nodes.heading, { level: 2 })) {
            app.activeBlockTypeLabel = app.blockTypes[2].label;
          } else if (blockTypeActive(state, cubbySchema.nodes.heading, { level: 3 })) {
            app.activeBlockTypeLabel = app.blockTypes[3].label;
          } else if (blockTypeActive(state, cubbySchema.nodes.heading, { level: 4 })) {
            app.activeBlockTypeLabel = app.blockTypes[4].label;
          } else if (blockTypeActive(state, cubbySchema.nodes.code_block, { params: '' })) {
            app.activeBlockTypeLabel = app.blockTypes[5].label;
          } else {
            const { $from, node } = state.selection;
            console.log('FIXME: unkonwn block type', node, $from.parent);
            app.activeBlockTypeLabel = 'Paragraph';
          }

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
  return new Plugin({
    view(editorView) {
      function updatePosOnScroll() {
        const state = editorView.state;
        const { from, to } = state.selection;

        // These are in screen coordinates
        const start = editorView.coordsAtPos(from);
        const end = editorView.coordsAtPos(to);

        app.overlay.showImageControls = (state.selection.node && state.selection.node.type.name === 'image');

        const tmpNode = editorView.domAtPos(state.selection.$anchor.pos);
        const nodeAtCursor = tmpNode ? tmpNode.node : null;

        if (state.selection.empty && !nodeAtCursor) {
          element.style.display = 'none';
          return;
        }

        let hasLink = false;

        app.overlay.showLinkControls = false;

        // text node
        if (nodeAtCursor.nodeName === '#text') {
          // console.log('text node', nodeAtCursor.parentElement)
          if (nodeAtCursor.parentElement.nodeName === 'A') {
            console.log('got a link')
            hasLink = true;
            app.overlay.showLinkControls = true;
          }
        } else if (nodeAtCursor) {
          // console.log('some other node ', nodeAtCursor)
        }

        element.style.display = 'block';

        // The box in which the tooltip is positioned, to use as base
        let box = element.offsetParent.getBoundingClientRect();

        element.style.left = (end.left - 40) + 'px';
        element.style.bottom = (box.bottom - start.top + 4) + 'px';
      }

      document.addEventListener('scroll', updatePosOnScroll, true);

      return {
        update(view, lastState) {
          const state = view.state;

          // Don't do anything if the document/selection didn't change
          if (lastState && lastState.doc.eq(state.doc) && lastState.selection.eq(state.selection)) return;

          updatePosOnScroll();
        },
        destroy() {
          document.removeEventListener('scroll', updatePosOnScroll, true);
        }
      }
    }
  });
}

export default {
  name: 'MarkdownViewer',
  components: {
    Button,
    ButtonGroup,
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
      isStrong: false,
      activeBlockTypeLabel: '',
      blockTypes: [{
        slug: 'p',
        label: 'Paragraph',
        action: () => {
          view.focus();
          setBlockType(cubbySchema.nodes.paragraph, {})(view.state, view.dispatch, view);
        }
      }, {
        slug: 'h1',
        label: 'Header 1',
        action: () => {
          view.focus();
          setBlockType(cubbySchema.nodes.heading, { level: 1 })(view.state, view.dispatch, view);
        }
      }, {
        slug: 'h2',
        label: 'Header 2',
        action: () => {
          view.focus();
          setBlockType(cubbySchema.nodes.heading, { level: 2 })(view.state, view.dispatch, view);
        }
      }, {
        slug: 'h3',
        label: 'Header 3',
        action: () => {
          view.focus();
          setBlockType(cubbySchema.nodes.heading, { level: 3 })(view.state, view.dispatch, view);
        }
      }, {
        slug: 'h4',
        label: 'Header 4',
        action: () => {
          view.focus();
          setBlockType(cubbySchema.nodes.heading, { level: 4 })(view.state, view.dispatch, view);
        }
      }, {
        slug: 'code',
        label: 'Code Block',
        action: () => {
          view.focus();
          setBlockType(cubbySchema.nodes.code_block, { params: '' })(view.state, view.dispatch, view);
        }
      }],
      overlay: {
        showImageControls: false,
        showLinkControls: false
      },
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
  mounted() {
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
            })]
            .concat(exampleSetup({ schema: cubbySchema, menuBar: false }))
            .concat(menuPlugin(this, this.tools))
            .concat(selectionOverlayPlugin(this, this.$refs.selectionOverlay))
          })
      });
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

.selection-overlay {
  position: absolute;
  display: none;
  z-index: 20;
  background-color: var(--pankow-color-secondary);
  border-radius: var(--pankow-border-radius);
}

.overlay-button {
  min-width: 30px;
  display: inline-block;
  cursor: pointer;
  text-align: center;
  color: var(--pankow-color-background-hover);
  border-radius: var(--pankow-border-radius);
  padding: 5px;
  margin: 2px;
}

.overlay-button:hover {
  color: var(--pankow-color-secondary);
  background-color: var(--pankow-color-background-hover);
}

</style>
