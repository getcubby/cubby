import { createApp } from 'vue';

// this is only for local dev where the origins differ
import { fetcher, tooltip } from 'pankow';
if (import.meta.env.DEV) fetcher.globalOptions.credentials = 'include';

import '@fontsource/inter';

import './style.css';

import Index from './Index.vue';

const app = createApp(Index);

app.directive('tooltip', tooltip);

app.mount('#app');
