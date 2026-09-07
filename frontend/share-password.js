import { createApp } from 'vue';

import pankow from '@cloudron/pankow';

import '@fontsource/inter';

import './style.css';

import SharePassword from './components/SharePassword.vue';

const app = createApp(SharePassword);
app.use(pankow, import.meta.env.DEV ? { fetcher: { credentials: 'include' } } : undefined);
app.mount('#app');
