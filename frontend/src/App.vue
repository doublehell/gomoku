<script setup lang="ts">
import { onMounted } from 'vue'
import { useWebSocket } from '@/composables/useWebSocket'

// 在應用啟動時就建立 WebSocket 連線
const ws = useWebSocket()

onMounted(() => {
  console.log('[App] Mounting, connecting WebSocket...')
  ws.connect().then(() => {
    console.log('[App] WebSocket connected')
  }).catch(e => {
    console.error('[App] WebSocket connection failed:', e)
  })
})
</script>

<template>
  <router-view />
</template>