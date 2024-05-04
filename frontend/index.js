import { createApp } from 'vue';

import PrimeVue from 'primevue/config';
import ConfirmationService from 'primevue/confirmationservice';
import BadgeDirective from 'primevue/badgedirective';

import 'primevue/resources/themes/saga-blue/theme.css';
import 'primevue/resources/primevue.min.css';
import 'primeicons/primeicons.css';

import '@fontsource/noto-sans';

import './style.css';

import Index from './Index.vue';

const app = createApp(Index);

app.use(PrimeVue);
app.use(ConfirmationService);

app.directive('badge', BadgeDirective);

app.mount('#app');
