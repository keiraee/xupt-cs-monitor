import { createRouter, createWebHistory } from 'vue-router'
import NoticeList from '../views/NoticeList.vue'

const routes = [
  { path: '/', redirect: '/tzgg' },
  { path: '/:category', name: 'list', component: NoticeList, props: true },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
