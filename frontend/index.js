import { createApp } from 'vue';

import PrimeVue from 'primevue/config';

import 'primevue/resources/themes/saga-blue/theme.css';
import 'primevue/resources/primevue.min.css';

import '@fontsource/noto-sans';

import './style.css';

import Index from './Index.vue';

const app = createApp(Index);

app.use(PrimeVue);

app.mount('#app');
