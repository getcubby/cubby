<template>
  <MainLayout :gap="false" class="main-layout">
    <template #header>
      <div class="tool-bar">
        <div class="tool-bar-left">
          <Button :loading="busySave" icon="fa-solid fa-floppy-disk" success tool @click="onSave" :disabled="busySave || !isChanged" style="margin-right: 20px;"/>
          <Button icon="fa-solid fa-bold" secondary :outline="!tools.strong.active ? true : null" :disabled="!tools.strong.available" tool @click="onToggleStrong()" />
          <Button icon="fa-solid fa-italic" secondary :outline="!tools.em.active ? true : null" :disabled="!tools.em.available" tool @click="onToggleEm()" />
          <Button icon="fa-solid fa-code" secondary :outline="!tools.code.active ? true : null" :disabled="!tools.code.available" tool @click="onToggleCode()" />

          <Dropdown v-model="paragraphType" :options="paragraphTypes" option-label="display" option-key="slug" style="margin-left: 20px; margin-right: 20px;" />

          <Button icon="fa-solid fa-list-ul" secondary outline tool @click="onToggleUnorderedList()" />
          <Button icon="fa-solid fa-list-ol" secondary outline tool @click="onToggleOrderedList()" />

          <Button icon="fa-solid fa-indent" secondary outline tool @click="onSinkList()" />
          <Button icon="fa-solid fa-outdent" secondary outline tool @click="onLiftList()" />
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

import { EditorState, Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { undo, redo, history } from "prosemirror-history";
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
            tools[tool].active = markActive(editorView.state, toRaw(tools[tool].mark));
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
    tr: {
      type: Function,
      default(id) { console.warn('Missing tr for MarkdownViewer'); return utils.translation(id); }
    }
  },
  emits: [ 'close' ],
  data() {
    return {
      busySave: false,
      isChanged: true,
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
    onToggleStrong() {
      const cmd = toggleMark(schema.marks.strong);
      view.focus();
      cmd(view.state, view.dispatch);
    },
    onToggleEm() {
      const cmd = toggleMark(schema.marks.em);
      view.focus();
      cmd(view.state, view.dispatch);
    },
    onToggleCode() {
      const cmd = toggleMark(schema.marks.code);
      view.focus();
      cmd(view.state, view.dispatch);
    },
    onToggleUnorderedList() {
      const cmd = wrapInList(schema.nodes.bullet_list, {});
      view.focus();
      cmd(view.state, view.dispatch);
    },
    onToggleOrderedList() {
      const cmd = wrapInList(schema.nodes.ordered_list, { order: 1 });
      view.focus();
      cmd(view.state, view.dispatch);
    },
    onSinkList() {
      view.focus();
      const cmd = sinkListItem(schema.nodes.list_item);
      cmd(view.state, view.dispatch);
    },
    onLiftList() {
      view.focus();
      const cmd = liftListItem(schema.nodes.list_item);
      cmd(view.state, view.dispatch);
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

      const state = EditorState.create({
        doc: defaultMarkdownParser.parse(content),
        plugins: exampleSetup({ schema, menuBar: false }).concat(menuPlugin(this, this.tools))
      });

      if (view) view.destroy();

      view = new EditorView(this.$refs.editorNode, { state });
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
  background-color: white;
  display: flex;
}

.tool-bar-left {
  flex-grow: 1;
}

.tool-bar-right {
}

.main-layout {
  background-color: #f7f7f7;
}

.editor-wrapper {
  height: 100%;
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
}

</style>
