<script setup>

import { useTemplateRef, ref, onMounted, onUnmounted } from 'vue';

const mobileFilterBar = useTemplateRef('mobileFilterBar');

const isMobile = ref(false);

defineProps({
  title: String,
});

function checkForMobile() {
  isMobile.value = window.innerWidth <= 576;
}

onMounted(() => {
  checkForMobile();
  window.addEventListener('resize', checkForMobile);
});

onUnmounted(() => {
  window.removeEventListener('resize', checkForMobile);
});

</script>

<template>
  <div class="section">
    <h2 class="section-header">
      <div>
        <div class="section-header-title-text">
          <slot name="header-title">{{ title }}</slot>
          <slot name="header-title-extra"></slot>
        </div>
      </div>
      <div>
        <Teleport :disabled="!isMobile" :to="mobileFilterBar">
          <slot name="filter-bar"></slot>
        </Teleport>
        <slot name="header-buttons"></slot>
      </div>
    </h2>
    <div class="section-mobile-filter-bar" v-show="isMobile && $slots['filter-bar']" ref="mobileFilterBar"></div>
    <hr class="section-divider"/>
    <div class="section-body">
      <slot></slot>
    </div>
  </div>
</template>

<style>

.section {
  margin-bottom: 20px;
  position: relative;
}

.section-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 5px;
  padding-left: 15px;
  padding-right: 15px;
  padding-top: 5px;
  margin-top: 0;
  margin-bottom: 0;
  font-size: 24px;
  font-weight: var(--pankow-font-weight-bold);
}

.section-header > div {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}

.section-header-title-text {
  display: flex;
  gap: 6px;
  align-items: baseline;
}

.section-divider {
  border: 0;
  border-top: 1px solid #d8dee4;
  margin-top: 10px;
  margin-bottom: 5px;
}

@media (prefers-color-scheme: dark) {
  .section-divider {
    border-top-color: #495057;
  }
}

.section-body {
  position: relative;
  margin-bottom: 15px;
  padding: 10px 15px 25px;
}

.section-mobile-filter-bar {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin: 10px 15px;
}

</style>
