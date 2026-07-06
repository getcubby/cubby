import { createApp } from 'vue';

import pankow from '@cloudron/pankow';

import '@fontsource/inter';

import './style.css';

import Index from './Index.vue';

const app = createApp(Index);
app.use(pankow, import.meta.env.DEV ? { fetcher: { credentials: 'include' } } : undefined);
app.mount('#app');
