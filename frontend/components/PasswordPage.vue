<script setup>

import { ref } from 'vue';
import PasswordPrompt from './PasswordPrompt.vue';

defineProps({
  title: {
    type: String,
    default: 'Password required'
  },
  description: {
    type: String,
    default: ''
  },
  busy: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: ''
  },
  buttonLabel: {
    type: String,
    default: 'Unlock'
  },
  buttonIcon: {
    type: String,
    default: 'fa-solid fa-lock'
  },
  inputId: {
    type: String,
    default: 'passwordInput'
  },
});

const emit = defineEmits([ 'submit' ]);

const passwordPrompt = ref(null);

function clear() {
  passwordPrompt.value?.clear();
}

defineExpose({ clear });

</script>

<template>
  <div class="password-page">
    <div class="password-container">
      <div class="password-card">
        <div class="password-icon">
          <i class="fa-solid fa-lock"></i>
        </div>
        <h2>{{ title }}</h2>
        <p>{{ description }}</p>
        <PasswordPrompt
          ref="passwordPrompt"
          :busy="busy"
          :error="error"
          :button-label="buttonLabel"
          :button-icon="buttonIcon"
          :input-id="inputId"
          @submit="emit('submit', $event)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>

.password-page {
  display: flex;
  justify-content: center;
  min-height: 100vh;
  padding: 96px 20px 20px;
  background: var(--pankow-body-background-color, white);
}

.password-container {
  width: 100%;
}

.password-card {
  text-align: center;
  padding: 40px 24px;
}

.password-icon {
  font-size: 48px;
  color: var(--pankow-color-text-secondary, #999);
  margin-bottom: 16px;
}

.password-card h2 {
  font-size: 20px;
  font-weight: var(--pankow-font-weight-bold, 600);
  margin: 0 0 8px 0;
  color: var(--pankow-color-text, #333);
}

.password-card p {
  color: var(--pankow-color-text-secondary, #666);
  margin: 0 0 16px 0;
}

</style>
