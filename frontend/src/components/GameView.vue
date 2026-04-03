<script setup lang="ts">
import { onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useWebSocket } from '@/composables/useWebSocket'
import { usePlayerStore } from '@/stores/player'
import { useGameStore } from '@/stores/game'
import { useChatStore } from '@/stores/chat'
import GameBoard from './GameBoard.vue'
import ChatBox from './ChatBox.vue'
import type { ServerMessage, MatchStart, Spectate, Move, Win, Lose, Timeout, GameEnd, TimeSync, OpponentLeft, LoginSuccess } from '@/types'
import { BLACK, WHITE, type CellValue } from '@/types'

const router = useRouter()
const ws = useWebSocket()
const playerStore = usePlayerStore()
const gameStore = useGameStore()
const chatStore = useChatStore()

const playerColorText = computed(() => {
  if (gameStore.playerColor === BLACK) return '黑棋'
  if (gameStore.playerColor === WHITE) return '白棋'
  return '觀眾'
})

function handleMatchStart(msg: MatchStart) {
  console.log('[GameView] handleMatchStart', msg)
  gameStore.startGame(
    msg.playerColor,
    msg.opponentName,
    msg.board,
    msg.currentPlayer,
    msg.restored
  )
  playerStore.setStatus('playing')
  console.log('[GameView] Game started, playerColor:', msg.playerColor, 'isMyTurn:', gameStore.isMyTurn)
}

function handleSpectate(msg: Spectate) {
  gameStore.startSpectating(msg.players, msg.board, msg.currentPlayer, msg.restored)
  playerStore.setStatus('spectating')
}

function handleMove(msg: Move) {
  gameStore.makeMove(msg.row, msg.col, msg.player)
  gameStore.setCurrentPlayer(msg.currentPlayer)
}

function handleWin(msg: Win) {
  gameStore.setGameOver(msg.winner, '五子連珠')
}

function handleLose(msg: Lose) {
  gameStore.setGameOver(msg.winner, msg.reason)
}

function handleTimeout(msg: Timeout) {
  gameStore.setGameOver(msg.winner, msg.reason)
}

function handleGameEnd(msg: GameEnd) {
  gameStore.setGameOver(msg.winner, msg.reason)
}

function handleTimeSync(msg: TimeSync) {
  gameStore.setRemainingTime(msg.remaining)
}

function handleOpponentLeft(msg: OpponentLeft) {
  alert('對手已離開遊戲')
  gameStore.reset()
  playerStore.setStatus('spectating')
  router.push('/lobby')
}

function handleLoginSuccess(msg: LoginSuccess) {
  playerStore.setLogin(msg.name, msg.sessionToken, msg.inQueue)
}

function handleSpectatorList(msg: any) {
  playerStore.updateSpectatorList(msg)
}

function handlePlayerList(msg: any) {
  playerStore.updatePlayerList(msg)
}

function handleQueueStatus(msg: any) {
  playerStore.setQueueCount(msg.count)
}

function handleChatBroadcast(msg: any) {
  chatStore.addMessage({
    time: msg.time,
    name: msg.name,
    message: msg.message
  })
}

function makeMove(row: number, col: number) {
  if (!gameStore.isMyTurn || gameStore.gameOver || gameStore.isSpectator) return
  ws.send({ type: 'move', row, col })
}

function returnToLobby() {
  gameStore.reset()
  playerStore.setStatus('spectating')
  router.push('/lobby')
}

function sendChat(message: string) {
  ws.send({ type: 'chat', message })
}

onMounted(async () => {
  ws.on('match_start', handleMatchStart as (msg: ServerMessage) => void)
  ws.on('spectate', handleSpectate as (msg: ServerMessage) => void)
  ws.on('move', handleMove as (msg: ServerMessage) => void)
  ws.on('win', handleWin as (msg: ServerMessage) => void)
  ws.on('lose', handleLose as (msg: ServerMessage) => void)
  ws.on('timeout', handleTimeout as (msg: ServerMessage) => void)
  ws.on('game_end', handleGameEnd as (msg: ServerMessage) => void)
  ws.on('time_sync', handleTimeSync as (msg: ServerMessage) => void)
  ws.on('opponent_left', handleOpponentLeft as (msg: ServerMessage) => void)
  ws.on('spectator_list', handleSpectatorList as (msg: ServerMessage) => void)
  ws.on('player_list', handlePlayerList as (msg: ServerMessage) => void)
  ws.on('queue_status', handleQueueStatus as (msg: ServerMessage) => void)
  ws.on('chat_broadcast', handleChatBroadcast as (msg: ServerMessage) => void)
  ws.on('login_success', handleLoginSuccess as (msg: ServerMessage) => void)

  // 進入遊戲時，嘗試恢復 session
  const savedToken = localStorage.getItem('gomoku_session')
  if (savedToken) {
    try {
      await ws.connect()
      ws.send({ type: 'restore_session', sessionToken: savedToken })
    } catch (e) {
      console.error('[GameView] 連線失敗:', e)
      router.push('/')
    }
  } else {
    router.push('/')
  }
})

onUnmounted(() => {
  ws.off('match_start', handleMatchStart as (msg: ServerMessage) => void)
  ws.off('spectate', handleSpectate as (msg: ServerMessage) => void)
  ws.off('move', handleMove as (msg: ServerMessage) => void)
  ws.off('win', handleWin as (msg: ServerMessage) => void)
  ws.off('lose', handleLose as (msg: ServerMessage) => void)
  ws.off('timeout', handleTimeout as (msg: ServerMessage) => void)
  ws.off('game_end', handleGameEnd as (msg: ServerMessage) => void)
  ws.off('time_sync', handleTimeSync as (msg: ServerMessage) => void)
  ws.off('opponent_left', handleOpponentLeft as (msg: ServerMessage) => void)
  ws.off('spectator_list', handleSpectatorList as (msg: ServerMessage) => void)
  ws.off('player_list', handlePlayerList as (msg: ServerMessage) => void)
  ws.off('queue_status', handleQueueStatus as (msg: ServerMessage) => void)
  ws.off('chat_broadcast', handleChatBroadcast as (msg: ServerMessage) => void)
  ws.off('login_success', handleLoginSuccess as (msg: ServerMessage) => void)
})
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 p-4">
    <div class="max-w-6xl mx-auto">
      <div class="bg-white rounded-2xl shadow-xl p-6 mb-4">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h1 class="text-2xl font-bold text-amber-800">對戰中</h1>
            <p v-if="!gameStore.isSpectator" class="text-gray-600">
              你執 {{ playerColorText }} vs {{ gameStore.opponentName }}
            </p>
            <p v-else class="text-gray-600">
              觀戰中: {{ gameStore.spectatingPlayers[0] }} vs {{ gameStore.spectatingPlayers[1] }}
            </p>
          </div>
          <div class="flex items-center gap-4">
            <div v-if="gameStore.gameOver" class="text-xl font-bold" :class="gameStore.isSpectator ? 'text-blue-600' : (gameStore.winner === gameStore.playerColor ? 'text-green-600' : 'text-red-600')">
              <template v-if="gameStore.isSpectator">
                {{ gameStore.winner !== null ? gameStore.spectatingPlayers[gameStore.winner === 1 ? 0 : 1] + ' 獲勝' : '遊戲結束' }}
              </template>
              <template v-else>
                {{ gameStore.winner === gameStore.playerColor ? '你獲勝！' : '對手獲勝' }}
              </template>
              <span v-if="gameStore.reason" class="text-gray-500 text-base font-normal">({{ gameStore.reason }})</span>
            </div>
            <div v-else-if="gameStore.isMyTurn" class="text-xl font-bold text-green-600">
              輪到你囉！
            </div>
            <div v-else-if="!gameStore.isSpectator" class="text-xl font-bold text-gray-600">
              對手思考中...
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="lg:col-span-2">
            <GameBoard
              :board="gameStore.board"
              :current-player="gameStore.currentPlayer"
              :can-play="gameStore.isMyTurn && !gameStore.gameOver"
              @move="makeMove"
            />
          </div>

          <div class="space-y-4">
            <div class="bg-amber-50 rounded-lg p-4">
              <h3 class="font-semibold text-gray-700 mb-3">計時器</h3>
              <div class="text-4xl font-bold text-center" :class="gameStore.remainingTime <= 10 ? 'text-red-600' : 'text-amber-600'">
                {{ gameStore.remainingTime }}s
              </div>
            </div>

            <div v-if="gameStore.gameOver" class="bg-amber-50 rounded-lg p-4">
              <h3 class="font-semibold text-gray-700 mb-3">遊戲結果</h3>
              <p class="text-center text-lg">
                <span v-if="gameStore.winner === gameStore.playerColor" class="text-green-600 font-bold">你獲勝！</span>
                <span v-else-if="gameStore.winner && gameStore.playerColor" class="text-red-600 font-bold">你輸了</span>
                <span v-else class="text-gray-600">{{ gameStore.spectatingPlayers[gameStore.winner === 1 ? 0 : 1] }} 獲勝</span>
              </p>
              <p v-if="gameStore.reason" class="text-center text-gray-500 mt-2">{{ gameStore.reason }}</p>
              <button
                @click="returnToLobby"
                class="w-full mt-4 bg-amber-600 text-white py-2 rounded-lg font-semibold hover:bg-amber-700 transition-colors"
              >
                返回大廳
              </button>
            </div>

            <div v-if="!gameStore.isSpectator" class="bg-amber-50 rounded-lg p-4">
              <h3 class="font-semibold text-gray-700 mb-3">你是 {{ playerColorText }}</h3>
              <div class="flex items-center justify-center gap-4">
                <div class="flex items-center gap-2">
                  <div class="w-4 h-4 rounded-full bg-black"></div>
                  <span>黑棋先行</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ChatBox @send="sendChat" />
    </div>
  </div>
</template>