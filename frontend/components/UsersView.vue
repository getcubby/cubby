<template>
  <div class="users-view">
    <div v-for="user in users">
      {{ user.username }} <span v-show="user.admin">(admin)</span>
    </div>
  </div>
</template>

<script>

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ? import.meta.env.VITE_API_ORIGIN : '';

import { createMainModel } from '../models/MainModel.js';

import { Button } from 'pankow';

export default {
    name: 'UsersView',
    components: {
      Button
    },
    data() {
      return {
        apiOrigin: API_ORIGIN,
        mainModel: null,
        users: []
      };
    },
    async mounted() {
      this.mainModel = createMainModel(API_ORIGIN);

      this.users = await this.mainModel.getUsers();
    }
};

</script>

<style scoped>

.users-view {
  padding: 20px;
}

</style>
