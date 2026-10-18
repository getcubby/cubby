import { createRouter, createWebHashHistory } from 'vue-router';

const Blank = { render() { return null; } };

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/:pathMatch(.*)*', name: 'app', component: Blank }
  ]
});

// set while a viewer updates the URL without reloading the file list
let ignoreNext = false;

function toRoutePath(hashOrPath) {
  let value = hashOrPath || '/';
  if (value.startsWith('/#')) value = value.slice(2);
  else if (value.startsWith('#')) value = value.slice(1);
  if (!value.startsWith('/')) value = '/' + value;
  try {
    value = decodeURIComponent(value);
  } catch (e) {
    // keep a malformed escape as written
  }
  return value;
}

function go(hashOrPath) {
  return router.push(toRoutePath(hashOrPath));
}

function replace(hashOrPath) {
  return router.replace(toRoutePath(hashOrPath));
}

function replaceQuiet(hashOrPath) {
  const path = toRoutePath(hashOrPath);
  if (router.currentRoute.value.path === path) return Promise.resolve();
  ignoreNext = true;
  return router.replace(path).then(function (failure) {
    if (failure) ignoreNext = false;
    return failure;
  }, function (error) {
    ignoreNext = false;
    throw error;
  });
}

function consumeIgnore() {
  if (!ignoreNext) return false;
  ignoreNext = false;
  return true;
}

function goBack(fallback = '/files/home/') {
  if (router.options.history.state && router.options.history.state.back) {
    router.back();
    return;
  }
  return router.push(fallback);
}

function followLink(event, hashOrPath) {
  if (!event || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  return go(hashOrPath);
}

export {
  router,
  toRoutePath,
  go,
  replace,
  replaceQuiet,
  consumeIgnore,
  goBack,
  followLink
};
