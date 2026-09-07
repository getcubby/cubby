<script setup>

import { ref, nextTick } from 'vue';
import { Button, PasswordInput } from '@cloudron/pankow';

const props = defineProps({
  busy: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: ''
  },
  placeholder: {
    type: String,
    default: 'Password'
  },
  buttonLabel: {
    type: String,
    default: 'Continue'
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

const password = ref('');

function submit() {
  if (props.busy) return;
  emit('submit', password.value);
}

function clear() {
  password.value = '';
  nextTick(() => document.getElementById(props.inputId)?.focus());
}

defineExpose({ clear });

</script>

<template>
  <div class="password-prompt">
    <form @submit.prevent="submit">
      <PasswordInput :id="inputId" v-model="password" :placeholder="placeholder" autofocus :disabled="busy" />
      <Button :icon="buttonIcon" :loading="busy" :disabled="busy" @click="submit">{{ buttonLabel }}</Button>
    </form>
    <p v-if="error" class="password-prompt-error">{{ error }}</p>
  </div>
</template>

<style scoped>

.password-prompt {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.password-prompt form {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.password-prompt-error {
  color: var(--pankow-color-danger, #d33);
  margin: 0;
  padding-top: 12px;
}

</style>
