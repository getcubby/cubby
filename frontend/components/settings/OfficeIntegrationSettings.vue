<script setup>

import { ref, onMounted, inject } from 'vue';
import { Button, TextInput, InputGroup } from '@cloudron/pankow';
import Section from '../Section.vue';
import MainModel from '../../models/MainModel.js';

const refreshConfig = inject('refreshConfig');

const office = ref({
  error: '',
  busy: false,
  wopiHost: '',
});
const isOfficeWorking = ref(false);

async function onOfficeSubmit() {
  office.value.busy = true;

  try {
    await MainModel.setWopiHost(office.value.wopiHost);
  } catch (error) {
    office.value.error = error.message;
    office.value.busy = false;
    isOfficeWorking.value = false;
    return;
  }

  office.value.error = '';

  try {
    office.value.wopiHost = await MainModel.getWopiHost();
  } catch (error) {
    office.value.wopiHost = '';
    office.value.error = error.message;
  }

  await refreshConfig();
  isOfficeWorking.value = MainModel.isOfficeWorking();
  office.value.busy = false;
}

onMounted(async () => {
  office.value.error = '';

  try {
    office.value.wopiHost = await MainModel.getWopiHost();
    isOfficeWorking.value = MainModel.isOfficeWorking();
  } catch (error) {
    office.value.wopiHost = '';
    office.value.error = error.message;
    console.log('Failed to get wopi host:', error);
  }
});

</script>

<template>
  <Section title="Office integration">
    <p>
      Open and edit Office documents in Cubby by connecting to an online editor.
      Works with Collabora and OnlyOffice on Cloudron.
    </p>
    <form @submit.prevent="onOfficeSubmit">
      <label for="wopiHostnameInput">Editor URL</label>
      <InputGroup>
        <TextInput id="wopiHostnameInput" v-model="office.wopiHost" placeholder="https://office.domain.com" style="width: 100%; max-width: 300px" />
        <Button id="wopiHostnameSubmitButtom" type="submit" :loading="office.busy" tool>Save</Button>
      </InputGroup>
      <small v-if="office.error" class="has-error"><i class="fa-solid fa-xmark"></i> {{ office.error }}</small>
      <small v-else-if="isOfficeWorking"><i class="fa-solid fa-check"></i> Working and set up.</small>
    </form>
  </Section>
</template>
