<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useWebSocket } from '@/composables/useWebSocket'
import { usePlayerStore } from '@/stores/player'
import { useChatStore } from '@/stores/chat'
import SpectatorList from './SpectatorList.vue'
import ChatBox from './ChatBox.vue'
import type { ServerMessage, QueueStatus, SpectatorList as SpectatorListMsg, PlayerList as PlayerListMsg, MatchStart, LoginSuccess, Spectate, LobbyState, LoginRequest } from '@/types'

const router = useRouter()
const ws = useWebSocket()
const playerStore = usePlayerStore()
const chatStore = useChatStore()

function handleQueueStatus(msg: QueueStatus) {
  playerStore.setQueueCount(msg.count)
}

function handleSpectatorList(msg: SpectatorListMsg) {
  playerStore.updateSpectatorList(msg)
}

function handlePlayerList(msg: PlayerListMsg) {
  playerStore.updatePlayerList(msg)
}

function handleMatchStart(msg: MatchStart) {
  playerStore.setStatus('playing')
  router.push('/gomoku')
}

function handleLoginSuccess(msg: LoginSuccess) {
  playerStore.setLogin(msg.name, msg.sessionToken, msg.inQueue)
}

// 處理 session 過期，需要重新登入
function handleLoginRequest() {
  console.log('[LobbyView] Session expired, redirecting to login')
  localStorage.removeItem('gomoku_session')
  playerStore.clear()
  router.push('/')
}

function handleLobbyState(msg: LobbyState) {
  console.log('[LobbyView] Received lobby_state, waiting:', msg.waiting)
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

function handleSpectate(msg: Spectate) {
  playerStore.setStatus('spectating')
  router.push('/gomoku')
}

function joinQueue() {
  console.log('[LobbyView] joinQueue called, sending join_queue')
  ws.send({ type: 'join_queue' })
  playerStore.setStatus('queue')
  console.log('[LobbyView] Status set to queue, isInQueue:', playerStore.isInQueue)
}

function leaveQueue() {
  ws.send({ type: 'leave_queue' })
  playerStore.setStatus('spectating')
  // Remove self from waiting list
  const idx = playerStore.waitingList.indexOf(playerStore.name)
  if (idx > -1) {
    playerStore.waitingList.splice(idx, 1)
  }
}

function handleChatBroadcast(msg: any) {
  chatStore.addMessage({
    time: msg.time,
    name: msg.name,
    message: msg.message
  })
}

function sendChat(message: string) {
  ws.send({ type: 'chat', message })
}

onMounted(async () => {
  console.log('[LobbyView] Mounting, registering handlers...')

  ws.on('queue_status', handleQueueStatus as (msg: ServerMessage) => void)
  ws.on('spectator_list', handleSpectatorList as (msg: ServerMessage) => void)
  ws.on('player_list', handlePlayerList as (msg: ServerMessage) => void)
  ws.on('lobby_state', handleLobbyState as (msg: ServerMessage) => void)
  ws.on('match_start', handleMatchStart as (msg: ServerMessage) => void)
  ws.on('login_success', handleLoginSuccess as (msg: ServerMessage) => void)
  ws.on('login_request', handleLoginRequest as (msg: ServerMessage) => void)
  ws.on('spectate', handleSpectate as (msg: ServerMessage) => void)
  ws.on('chat_broadcast', handleChatBroadcast as (msg: ServerMessage) => void)

  console.log('[LobbyView] Handlers registered')

  // 進入大廳時，嘗試恢復 session 或請求大廳狀態
  const savedToken = localStorage.getItem('gomoku_session')
  console.log('[LobbyView] Token exists:', !!savedToken)

  if (savedToken) {
    // 等待連線建立後再發送
    try {
      console.log('[LobbyView] Connecting...')
      await ws.connect()
      console.log('[LobbyView] Connected, sending restore_session')
      ws.send({ type: 'restore_session', sessionToken: savedToken })
    } catch (e) {
      console.error('[LobbyView] 連線失敗:', e)
      router.push('/')
    }
  } else {
    // 如果沒有 session，重定向到登入頁
    console.log('[LobbyView] No token, redirecting to /')
    router.push('/')
  }
})

onUnmounted(() => {
  ws.off('queue_status', handleQueueStatus as (msg: ServerMessage) => void)
  ws.off('spectator_list', handleSpectatorList as (msg: ServerMessage) => void)
  ws.off('player_list', handlePlayerList as (msg: ServerMessage) => void)
  ws.off('lobby_state', handleLobbyState as (msg: ServerMessage) => void)
  ws.off('match_start', handleMatchStart as (msg: ServerMessage) => void)
  ws.off('login_success', handleLoginSuccess as (msg: ServerMessage) => void)
  ws.off('login_request', handleLoginRequest as (msg: ServerMessage) => void)
  ws.off('spectate', handleSpectate as (msg: ServerMessage) => void)
  ws.off('chat_broadcast', handleChatBroadcast as (msg: ServerMessage) => void)
})
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 p-4">
    <div class="max-w-6xl mx-auto">
      <div class="bg-white rounded-2xl shadow-xl p-6 mb-4">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h1 class="text-2xl font-bold text-amber-800">大廳</h1>
            <p class="text-gray-600">歡迎，{{ playerStore.name }}</p>
          </div>
          <button
            v-if="!playerStore.isInQueue && !playerStore.isPlaying"
            @click="joinQueue"
            class="bg-amber-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-amber-700 transition-colors"
          >
            開始配對
          </button>
          <button
            v-else-if="playerStore.isInQueue"
            @click="leaveQueue"
            class="bg-gray-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-600 transition-colors"
          >
            取消配對
          </button>
          <div v-else class="text-amber-600 font-semibold">
            配對中...
          </div>
        </div>

        <SpectatorList
            :spectators="playerStore.spectatorList"
            :waiting="playerStore.waitingList"
            :players="playerStore.playerList"
          />
      </div>

      <ChatBox @send="sendChat" />
    </div>
  </div>
</template>