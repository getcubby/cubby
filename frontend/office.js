import { createApp } from 'vue';

import pankow from '@cloudron/pankow';

import '@fontsource/inter';

import './style.css';

import Office from './Office.vue';

const app = createApp(Office);
app.use(pankow, import.meta.env.DEV ? { fetcher: { credentials: 'include' } } : undefined);
app.mount('#app');
