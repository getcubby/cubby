<script setup>

import { ref, onMounted } from 'vue';
import PasswordPage from './PasswordPage.vue';

const API_ORIGIN = '';

const passwordPage = ref(null);

const shareId = ref('');
const returnTo = ref('/');
const unlocking = ref(false);
const invalid = ref(false);
const error = ref('');

function extractShareId() {
  const path = window.location.pathname;
  const match = path.match(/\/share-password\/([^/]+)/);
  return match ? match[1] : '';
}

function safeReturnTo(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

async function unlock(candidate) {
  if (unlocking.value) return;

  if (!candidate) {
    error.value = 'Please enter the password.';
    return;
  }

  unlocking.value = true;
  error.value = '';

  try {
    const response = await fetch(`${API_ORIGIN}/api/v1/shares/${shareId.value}/unlock`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: candidate })
    });
    if (response.status === 401) {
      error.value = 'Invalid password.';
      unlocking.value = false;
      passwordPage.value?.clear();
      return;
    }
    if (!response.ok) {
      error.value = 'Failed to unlock. Please try again.';
      unlocking.value = false;
      return;
    }

    window.location.href = returnTo.value;
  } catch (e) {
    error.value = 'Failed to connect. Please try again later.';
    unlocking.value = false;
  }
}

onMounted(() => {
  shareId.value = extractShareId();
  const params = new URLSearchParams(window.location.search);
  returnTo.value = safeReturnTo(params.get('returnTo'));

  if (!shareId.value) invalid.value = true;
});

</script>

<template>
  <div v-if="invalid" class="share-password-invalid">
    <div class="share-password-invalid-icon">
      <i class="fa-solid fa-circle-exclamation"></i>
    </div>
    <h2>Invalid link</h2>
    <p>This password link is malformed.</p>
  </div>

  <PasswordPage
    v-else
    ref="passwordPage"
    title="Password required"
    description="This share is protected. Enter the password to continue."
    :busy="unlocking"
    :error="error"
    input-id="sharePasswordInput"
    @submit="unlock"
  />
</template>

<style scoped>

.share-password-invalid {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 96px 20px 20px;
  text-align: center;
  background: var(--pankow-body-background-color, white);
}

.share-password-invalid-icon {
  font-size: 48px;
  color: var(--pankow-color-text-secondary, #999);
  margin-bottom: 16px;
}

.share-password-invalid h2 {
  font-size: 20px;
  margin: 0 0 8px 0;
  color: var(--pankow-color-text, #333);
}

.share-password-invalid p {
  color: var(--pankow-color-text-secondary, #666);
  margin: 0;
}

</style>
