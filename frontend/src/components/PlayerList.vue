<script setup lang="ts">
import type { PlayerStatus } from '@/types'

defineProps<{
  players: Array<{ name: string; status: PlayerStatus }>
}>()

function getStatusText(status: PlayerStatus): string {
  switch (status) {
    case 'playing': return '對戰中'
    case 'queue': return '排隊中'
    case 'spectating': return '觀眾'
    default: return '等待中'
  }
}

function getStatusColor(status: PlayerStatus): string {
  switch (status) {
    case 'playing': return 'text-red-600'
    case 'queue': return 'text-amber-600'
    default: return 'text-gray-500'
  }
}
</script>

<template>
  <div>
    <h2 class="text-lg font-semibold text-gray-700 mb-3">對戰中玩家</h2>
    <div class="bg-gray-50 rounded-lg p-4 min-h-[120px]">
      <p v-if="players.length === 0" class="text-gray-500 text-center py-8">
        目前沒有對戰
      </p>
      <ul v-else class="space-y-2">
        <li
          v-for="player in players"
          :key="player.name"
          class="flex justify-between items-center py-2 border-b border-gray-200 last:border-0"
        >
          <span class="font-medium text-gray-800">{{ player.name }}</span>
          <span :class="getStatusColor(player.status)" class="text-sm">
            {{ getStatusText(player.status) }}
          </span>
        </li>
      </ul>
    </div>
  </div>
</template>