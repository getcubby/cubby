import { createApp } from 'vue';

import '@fontsource/noto-sans';

import './style.css';

import Index from './Index.vue';

const app = createApp(Index);

app.mount('#app');
