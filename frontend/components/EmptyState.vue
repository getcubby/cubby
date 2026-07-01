<script setup>

import { Icon } from '@cloudron/pankow';

defineProps({
  icon: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: '',
  },
});

</script>

<template>
  <div class="empty-state">
    <Icon :icon="icon" class="empty-state-icon"/>
    <p class="empty-state-title">{{ title }}</p>
    <p v-if="$slots.description" class="empty-state-description"><slot name="description"></slot></p>
    <p v-else-if="description" class="empty-state-description">{{ description }}</p>
    <div v-if="$slots.default" class="empty-state-actions">
      <slot></slot>
    </div>
  </div>
</template>

<style scoped>

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px;
  margin: 0 auto;
}

.empty-state-icon {
  font-size: 48px;
  color: #aaa;
  margin-bottom: 12px;
}

@media (prefers-color-scheme: dark) {
  .empty-state-icon {
    color: #777;
  }
}

.empty-state-title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: var(--pankow-font-weight-bold);
}

.empty-state-description {
  margin: 0;
  font-size: 14px;
  color: #888;
  line-height: 1.4;
}

.empty-state-description a {
  color: var(--pankow-color-primary);
}

.empty-state-actions {
  margin-top: 16px;
}

</style>
