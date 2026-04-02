import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { PlayerStatus, SpectatorList, PlayerList } from '@/types'

export const usePlayerStore = defineStore('player', () => {
  const name = ref<string>('')
  const sessionToken = ref<string>('')
  const status = ref<PlayerStatus>('waiting')
  const inQueue = ref(false)

  const spectatorList = ref<string[]>([])
  const waitingList = ref<string[]>([])
  const playerList = ref<Array<{ name: string; status: PlayerStatus }>>([])

  const queueCount = ref(0)

  const isLoggedIn = computed(() => name.value !== '')
  const isInQueue = computed(() => inQueue.value)
  const isPlaying = computed(() => status.value === 'playing')
  const isSpectating = computed(() => status.value === 'spectating')

  function setLogin(newName: string, token: string, wasInQueue = false) {
    name.value = newName
    sessionToken.value = token
    inQueue.value = wasInQueue
    status.value = wasInQueue ? 'queue' : 'spectating'
  }

  function setStatus(newStatus: PlayerStatus) {
    status.value = newStatus
    inQueue.value = newStatus === 'queue'
  }

  function setQueueCount(count: number) {
    queueCount.value = count
  }

  function updateSpectatorList(data: SpectatorList) {
    spectatorList.value = data.spectators
    waitingList.value = data.waiting
  }

  function updatePlayerList(data: PlayerList) {
    playerList.value = data.players
  }

  function clear() {
    name.value = ''
    sessionToken.value = ''
    status.value = 'waiting'
    inQueue.value = false
    spectatorList.value = []
    waitingList.value = []
    playerList.value = []
    queueCount.value = 0
  }

  return {
    name,
    sessionToken,
    status,
    inQueue,
    spectatorList,
    waitingList,
    playerList,
    queueCount,
    isLoggedIn,
    isInQueue,
    isPlaying,
    isSpectating,
    setLogin,
    setStatus,
    setQueueCount,
    updateSpectatorList,
    updatePlayerList,
    clear
  }
})