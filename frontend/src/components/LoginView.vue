<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useWebSocket } from '@/composables/useWebSocket'
import { usePlayerStore } from '@/stores/player'
import type { ServerMessage, LoginRequest, LoginSuccess, ErrorMessage, RestoreSession, LobbyState } from '@/types'

const router = useRouter()
const ws = useWebSocket()
const playerStore = usePlayerStore()

const username = ref('')
const errorMessage = ref('')
const isConnecting = ref(true)
function handleLoginRequest(msg: LoginRequest) {
  // 如果已經顯示登入表單，就不再處理
  if (!isConnecting.value) return

  // Check for saved session
  const savedToken = localStorage.getItem('gomoku_session')
  if (savedToken) {
    ws.send({ type: 'restore_session', sessionToken: savedToken })
    // 如果 session 過期，伺服器會回傳 login_request，前端會顯示登入表單
  } else {
    isConnecting.value = false
  }
}

function handleLoginSuccess(msg: LoginSuccess) {
  playerStore.setLogin(msg.name, msg.sessionToken, msg.inQueue)
  localStorage.setItem('gomoku_session', msg.sessionToken)

  // 導航到原本要去的頁面，或預設為 lobby
  const redirectPath = sessionStorage.getItem('redirectAfterLogin') || '/lobby'
  sessionStorage.removeItem('redirectAfterLogin')
  router.push(redirectPath)
}

function handleError(msg: ErrorMessage) {
  errorMessage.value = msg.message
  isConnecting.value = false
}

function handleRestoreSession(msg: RestoreSession) {
  console.log('[LoginView] Received restore_session, sending restore_session message')
  ws.send({ type: 'restore_session', sessionToken: localStorage.getItem('gomoku_session') || '' })
}

function handleLobbyState(msg: LobbyState) {
  console.log('[LoginView] Received lobby_state:', msg)
  playerStore.updateSpectatorList({
    type: 'spectator_list',
    spectators: msg.spectators,
    waiting: msg.waiting
  })
  playerStore.updatePlayerList({
    type: 'player_list',
    players: msg.players
  })
}

function login() {
  const name = username.value.trim()
  if (name.length < 2) {
    errorMessage.value = '暱稱需要2-20個字'
    return
  }

  errorMessage.value = ''
  ws.send({ type: 'login', name })
}

onMounted(async () => {
  ws.on('login_request', handleLoginRequest as (msg: ServerMessage) => void)
  ws.on('login_success', handleLoginSuccess as (msg: ServerMessage) => void)
  ws.on('error', handleError as (msg: ServerMessage) => void)
  ws.on('restore_session', handleRestoreSession as (msg: ServerMessage) => void)
  ws.on('lobby_state', handleLobbyState as (msg: ServerMessage) => void)

  // 5秒超時：如果仍未收到回應，顯示登入表單
  const timeoutId = setTimeout(() => {
    if (isConnecting.value) {
      console.log('[LoginView] Timeout, showing login form')
      isConnecting.value = false
    }
  }, 3000)

  try {
    await ws.connect()
    // 連線成功後，等待伺服器發送 login_request
    // 如果超過 5 秒沒回應，timeout 會處理
  } catch (e) {
    clearTimeout(timeoutId)
    errorMessage.value = '無法連線伺服器'
    isConnecting.value = false
  }
})

onUnmounted(() => {
  ws.off('login_request', handleLoginRequest as (msg: ServerMessage) => void)
  ws.off('login_success', handleLoginSuccess as (msg: ServerMessage) => void)
  ws.off('error', handleError as (msg: ServerMessage) => void)
  ws.off('restore_session', handleRestoreSession as (msg: ServerMessage) => void)
  ws.off('lobby_state', handleLobbyState as (msg: ServerMessage) => void)
})
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
      <h1 class="text-3xl font-bold text-center text-amber-800 mb-2">五子棋連線對戰</h1>
      <p class="text-center text-gray-500 mb-8">Gobang Online</p>

      <div v-if="isConnecting" class="text-center py-8">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto mb-4"></div>
        <p class="text-gray-600">連線中...</p>
      </div>

      <form v-else @submit.prevent="login">
        <div class="mb-4">
          <label class="block text-gray-700 mb-2" for="username">暱稱</label>
          <input
            id="username"
            v-model="username"
            type="text"
            maxlength="20"
            placeholder="輸入你的暱稱"
            class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition"
            autofocus
          />
        </div>

        <p v-if="errorMessage" class="text-red-500 text-sm mb-4">{{ errorMessage }}</p>

        <button
          type="submit"
          class="w-full bg-amber-600 text-white py-3 rounded-lg font-semibold hover:bg-amber-700 transition-colors"
        >
          開始遊戲
        </button>
      </form>

      <p class="text-center text-gray-400 text-xs mt-6">
        25x25 棋盤 | 60秒計時 | 連線對戰
      </p>
    </div>
  </div>
</template>