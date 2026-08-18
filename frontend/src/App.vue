<template>
  <div class="app-shell">
    <div class="topbar">
      <div class="topbar-logo">西安邮电大学计算机学院、软件学院<span>---公告</span></div>
      <div class="topbar-right">
        <span><span class="dot" :class="online ? 'on' : 'off'"></span>{{ online ? '在线' : '离线' }}</span>
        <span>{{ clock }}</span>
        <span>总计: ~{{ totalItems }}</span>
      </div>
    </div>

    <div class="cat-tabs">
      <router-link
        v-for="c in categories"
        :key="c.key"
        :to="{ name: 'list', params: { category: c.key } }"
        class="cat-tab"
        :class="{ active: $route.params.category === c.key }"
      >{{ c.name }}<span class="count">~{{ c.totalItems }}</span></router-link>
    </div>

    <router-view :key="$route.fullPath" />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { getCategories } from './api'

const categories = ref([])
const totalItems = ref(0)
const online = ref(true)
const clock = ref('')

let timer

async function loadCategories(retries = 2) {
  try {
    const data = await getCategories()
    categories.value = data.categories
    totalItems.value = data.categories.reduce((s, c) => s + c.totalItems, 0)
    online.value = true
  } catch {
    if (retries > 0) {
      setTimeout(() => loadCategories(retries - 1), 3000)
    } else {
      online.value = false
    }
  }
}

onMounted(() => {
  timer = setInterval(() => {
    clock.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  }, 1000)
  clock.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })

  loadCategories()
})

onUnmounted(() => clearInterval(timer))
</script>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
</style>
