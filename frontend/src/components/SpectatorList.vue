<script setup lang="ts">
import { computed } from 'vue'
import type { PlayerStatus } from '@/types'

interface PlayerWithStatus {
  name: string
  status: PlayerStatus
}

const props = defineProps<{
  spectators: string[]
  waiting: string[]
  players: Array<{ name: string; status: PlayerStatus }>
}>()

// 合併所有玩家資訊
const allPlayers = computed(() => {
  const result: PlayerWithStatus[] = []

  // 加入排隊中的玩家
  props.waiting.forEach(name => {
    result.push({ name, status: 'queue' })
  })

  // 加入對戰中的玩家
  props.players.forEach(p => {
    result.push({ name: p.name, status: p.status })
  })

  // 加入觀眾
  props.spectators.forEach(name => {
    if (!result.find(p => p.name === name)) {
      result.push({ name, status: 'spectating' })
    }
  })

  return result
})

function getStatusText(status: PlayerStatus): string {
  switch (status) {
    case 'queue': return '排隊中'
    case 'playing': return '對戰中'
    case 'spectating': return '觀眾'
    default: return '等待中'
  }
}

function getStatusColor(status: PlayerStatus): string {
  switch (status) {
    case 'queue': return 'bg-amber-200 text-amber-800'
    case 'playing': return 'bg-red-200 text-red-800'
    case 'spectating': return 'bg-blue-200 text-blue-800'
    default: return 'bg-gray-200 text-gray-800'
  }
}
</script>

<template>
  <div>
    <h2 class="text-lg font-semibold text-gray-700 mb-3">所有人</h2>
    <div class="bg-blue-50 rounded-lg p-4 min-h-[120px]">
      <div v-if="allPlayers.length === 0" class="text-gray-500 text-center py-8">
        目前沒有人
      </div>
      <div v-else class="flex flex-wrap gap-1">
        <span
          v-for="player in allPlayers"
          :key="player.name"
          class="relative group px-2 py-1 rounded-full text-xs cursor-default"
          :class="getStatusColor(player.status)"
        >
          {{ player.name }}
          <!-- Hover tooltip -->
          <span class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity">
            {{ getStatusText(player.status) }}
          </span>
        </span>
      </div>
    </div>
  </div>
</template>