<template>
  <MainLayout :gap="false" class="main-layout">
    <template #header>
      <div class="tool-bar">
        <div class="tool-bar-left">
          <Button :loading="busySave" icon="fa-solid fa-floppy-disk" success tool @click="onSave" :disabled="busySave || !isChanged" style="margin-right: 20px;"/>
          <Button icon="fa-solid fa-bold" secondary :outline="!tools.strong.active ? true : null" :disabled="!tools.strong.available" tool @click="onToolbutton(tools.strong)" />
          <Button icon="fa-solid fa-italic" secondary :outline="!tools.em.active ? true : null" :disabled="!tools.em.available" tool @click="onToolbutton(tools.em)" />
          <Button icon="fa-solid fa-code" secondary :outline="!tools.code.active ? true : null" :disabled="!tools.code.available" tool @click="onToolbutton(tools.code)" />

          <Dropdown v-model="paragraphType" :options="paragraphTypes" option-label="display" option-key="slug" style="margin-left: 20px; margin-right: 20px;" />

          <Button icon="fa-solid fa-list-ul" secondary outline tool @click="onToolbutton(tools.ul)" />
          <Button icon="fa-solid fa-list-ol" secondary outline tool @click="onToolbutton(tools.ol)" />

          <Button icon="fa-solid fa-outdent" secondary outline tool v-show="tools.lift.available" @click="onToolbutton(tools.lift)" />
          <Button icon="fa-solid fa-indent" secondary outline tool v-show="tools.sink.available" @click="onToolbutton(tools.sink)" />
        </div>
        <div class="tool-bar-right">
          <Button icon="fa-solid fa-download" :href="entry.downloadFileUrl" tool target="_blank" />
          <Button icon="fa-solid fa-xmark" @click="onClose">{{ tr('main.dialog.close') }}</Button>
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
import { MainLayout, Button, Dropdown, utils } from 'pankow';

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

import './MarkdownViewer.css';

// cannot be reactive
let view;

// https://github.com/ProseMirror/prosemirror-example-setup/blob/8c11be6850604081dceda8f36e08d2426875e19a/src/menu.ts#L58
function markActive(state, type) {
  let { from, $from, to, empty } = state.selection
  if (empty) return !!type.isInSet(state.storedMarks || $from.marks())
  else return state.doc.rangeHasMark(from, to, type)
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

export default {
  name: 'MarkdownViewer',
  components: {
    Button,
    Dropdown,
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
          mark: schema.marks.strong,
          cmd: toggleMark(schema.marks.strong)
        },
        em: {
          active: false,
          available: false,
          mark: schema.marks.em,
          cmd: toggleMark(schema.marks.em)
        },
        code: {
          active: false,
          available: false,
          mark: schema.marks.code,
          cmd: toggleMark(schema.marks.code)
        },
        ul: {
          active: false,
          available: false,
          mark: null,
          cmd: wrapInList(schema.nodes.bullet_list, {})
        },
        ol: {
          active: false,
          available: false,
          mark: null,
          cmd: wrapInList(schema.nodes.ordered_list, { order: 1 })
        },
        lift: {
          active: false,
          available: false,
          mark: null,
          cmd: liftListItem(schema.nodes.list_item)
        },
        sink: {
          active: false,
          available: false,
          mark: null,
          cmd: sinkListItem(schema.nodes.list_item)
        }
      }
    };
  },
  watch: {
    paragraphType() {
      if (!view) return;

      let cmd = null;
      if (this.paragraphType === 'p') {
        cmd = setBlockType(schema.nodes.paragraph, {});
      } else if (this.paragraphType === 'h1') {
        cmd = setBlockType(schema.nodes.heading, { level: 1 });
      } else if (this.paragraphType === 'h2') {
        cmd = setBlockType(schema.nodes.heading, { level: 2 });
      } else if (this.paragraphType === 'code') {
        cmd = setBlockType(schema.nodes.code_block, {});
      }

      view.focus();

      if (!cmd) return;

      cmd(view.state, view.dispatch);
    }
  },
  mounted() {
    this.paragraphType = this.paragraphTypes[0].slug;
  },
  methods: {
    canHandle(entry) {
      return entry.fileName.endsWith('md');
    },
    onToolbutton(tool) {
      view.focus();
      tool.cmd(view.state, view.dispatch);
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

      if (view) view.destroy();

      const markdownDoc = defaultMarkdownParser.parse(content);

      // unique id at the websocket server
      const collabDocId = entry.id;

      const ydoc = new Y.Doc();
      const provider = new WebsocketProvider(
        'wss://demos.yjs.dev/ws', // use the public ws server
        // `ws${location.protocol.slice(4)}//${location.host}/ws`, // alternatively: use the local ws server (run `npm start` in root directory)
        collabDocId,
        ydoc
      );
      provider.connect();

      // required to have a fragment attached to the ydoc, for some reason I can't see how to attach a fragment later
      const emptyFragment = ydoc.getXmlFragment('prosemirror');

      const yXmlFragment = prosemirrorToYXmlFragment(markdownDoc, emptyFragment);
      const { doc, mapping } = initProseMirrorDoc(yXmlFragment, schema)

      provider.awareness.setLocalStateField('user', { color: '#008833', name: this.profile.displayName })

      view = new EditorView(this.$refs.editorNode, {
        state: EditorState.create({
          doc,
          schema,
          plugins: [
            ySyncPlugin(yXmlFragment, { mapping }),
            yCursorPlugin(provider.awareness),
            yUndoPlugin(),
            keymap({
              'Mod-z': undo,
              'Mod-y': redo,
              'Mod-Shift-z': redo
            })].concat(exampleSetup({ schema, menuBar: false })).concat(menuPlugin(this, this.tools))
          })
      });
    },
    onClose() {
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
