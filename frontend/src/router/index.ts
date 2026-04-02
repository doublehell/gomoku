import { createRouter, createWebHistory } from 'vue-router'
import { usePlayerStore } from '@/stores/player'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'login',
      component: () => import('@/components/LoginView.vue')
    },
    {
      path: '/lobby',
      name: 'lobby',
      component: () => import('@/components/LobbyView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/gomoku',
      name: 'gomoku',
      component: () => import('@/components/GameView.vue'),
      meta: { requiresAuth: true }
    }
  ]
})

router.beforeEach((to, from, next) => {
  // 每次導航都檢查是否有 session token
  const hasSession = !!localStorage.getItem('gomoku_session')

  if (to.meta.requiresAuth) {
    // 如果沒有 session，保存原本要去的頁面，然後跳轉到登入頁
    if (!hasSession) {
      sessionStorage.setItem('redirectAfterLogin', to.fullPath)
      next('/')
      return
    }
    // 有 session 的話，允許進入，LoginView 會負責恢復 session
  }
  next()
})

export default router