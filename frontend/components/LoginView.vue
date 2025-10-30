<script setup>

import { API_ORIGIN } from '../utils.js';
import { Button } from '@cloudron/pankow';

</script>

<template>
  <div class="container">
    <div class="desktop">
      <div class="left">
        <img src="/logo-transparent.svg" style="width: 30%; margin: auto;"/>
      </div>
      <div class="right">
        <h1>Cubby</h1>
        <h2>The painless file sharing solution</h2>
        <Button id="loginButton" :href="API_ORIGIN + '/api/v1/oidc/login'">Login with Cloudron</Button>
        <div class="footer">
          By <a href="https://cloudron.io" target="_blank">Cloudron</a>
        </div>
      </div>
    </div>
    <div class="mobile">
      <img src="/logo.svg" style="height: 50%; max-height: 128px; margin: 10% auto;"/>
      <div style="flex-grow: 1; text-align: center;">
        <h1>Cubby</h1>
        <h2>The painless file sharing solution</h2>
        <Button id="loginButton" :href="API_ORIGIN + '/api/v1/oidc/login'">Login with Cloudron</Button>
      </div>
      <div class="mobile-footer">By <a href="https://cloudron.io" target="_blank">Cloudron</a></div>
    </div>
  </div>
</template>

<style scoped>

.container {
  height: 100%;
}

.mobile {
  display: none;
  height: 100%;
  width: 100%;
  flex-direction: column;
}

.mobile-footer {
  color: var(--pankow-color-dark);
  text-align: center;
  margin: 6px;
}

.desktop {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  height: 100%;
  width: 100%;
}

.left {
  background: linear-gradient(90deg, rgb(0, 120, 241) 0%, var(--pankow-color-primary) 100%);
  flex-grow: 1;
  display: flex;
  max-width: 40%;
  align-items: center;
  align-content: center;
  flex-direction: column;
  justify-content: space-between;
}

@media (prefers-color-scheme: dark) {
  .left {
    filter: brightness(80%);
  }
}

@media only screen and (max-width: 768px) and (orientation: portrait) {
  .mobile {
    display: flex;
  }

  .desktop {
    display: none;
  }
}

.right {
  display: flex;
  align-self: stretch;
  flex-direction: column;
  padding: 40px;
  white-space: nowrap;
  justify-content: center;
}

h1 {
  margin-bottom: 0;
}

h2 {
  font-size: 16px;
  margin-top: 10px;
  margin-bottom: 30px;
}

.footer {
  width: 100%;
  font-size: 12px;
  padding: 5px;
  position: absolute;
  bottom: 5px;
}

.footer a:hover,
.footer a:active {
  text-decoration: underline;
}

</style>
