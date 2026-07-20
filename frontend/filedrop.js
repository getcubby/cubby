import { createApp } from 'vue';

import pankow from '@cloudron/pankow';

import '@fontsource/inter';

import './style.css';

import FileDrop from './components/FileDrop.vue';

const app = createApp(FileDrop);
app.use(pankow, import.meta.env.DEV ? { fetcher: { credentials: 'include' } } : undefined);
app.mount('#app');
