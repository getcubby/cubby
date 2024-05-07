<template>
  <div class="container">
    <div class="left">
      <img src="/logo-transparent.svg" style="width: 30%; margin: auto;"/>
      <div class="footer">
        by <a href="https://cloudron.io" target="_blank">Cloudron</a>
      </div>
    </div>
    <div class="right">
      <h1>Cubby</h1>
      <Button id="loginButton" :href="apiOrigin + '/api/v1/oidc/login'">Login with Cloudron</Button>
    </div>
  </div>
</template>

<script>

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ? import.meta.env.VITE_API_ORIGIN : '';

import { Button } from 'pankow';

export default {
    name: 'LoginView',
    components: {
      Button
    },
    data() {
      return {
        apiOrigin: API_ORIGIN,
      };
    }
};

</script>

<style scoped>

.container {
  display: flex;
  flex-direction: row;
  align-items: stretch;
}

.left {
  background: linear-gradient(90deg, rgb(168, 85, 247) 0%, #0071e3 100%);
  flex-grow: 1;
  display: none;
  max-width: 40%;
  align-items: center;
  align-content: center;
  flex-direction: column;
  justify-content: space-between;
}

@media (min-width:320px) {
  .left {
    display: flex;
  }
}

.right {
  display: flex;
  background-color: white;
  align-self: stretch;
  flex-direction: column;
  padding: 40px;
  white-space: nowrap;
  justify-content: center;
}

.footer {
  color: white;
  width: 100%;
  font-size: 12px;
  padding: 5px;
}

.footer a {
  color: white;
}

.footer a:hover,
.footer a:active {
  color: white;
  text-decoration: underline;
}

</style>
