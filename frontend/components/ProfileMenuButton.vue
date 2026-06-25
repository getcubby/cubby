<script setup>

import { Button } from '@cloudron/pankow';

defineProps({
  profile: {
    type: Object,
    default: () => ({}),
  },
  menu: {
    type: Array,
    default: () => [],
  },
});

defineEmits(['login']);

</script>

<template>
  <Button
    v-if="profile.username"
    id="profileMenuButton"
    :menu="menu"
    tool
    secondary
  >
    <span class="pankow-no-mobile">{{ profile.displayName || profile.username }}</span>
  </Button>
  <Button
    v-else
    icon="fa-solid fa-arrow-right-to-bracket"
    secondary
    @click="$emit('login')"
  >
    Log in
  </Button>
</template>
