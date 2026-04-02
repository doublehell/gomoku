import { ref, onUnmounted } from 'vue'
import type { ServerMessage, ClientMessage } from '@/types'

// ============================================================================
// Types
// ============================================================================

type MessageHandler<T extends ServerMessage = ServerMessage> = (msg: T) => void

interface UseWebSocketReturn {
  connected: ReturnType<typeof ref<boolean>>
  error: ReturnType<typeof ref<string | null>>
  connect: () => Promise<void>
  disconnect: () => void
  send: (msg: ClientMessage) => void
  on: <T extends ServerMessage>(type: T['type'], handler: MessageHandler<T>) => void
  off: <T extends ServerMessage>(type: T['type'], handler: MessageHandler<T>) => void
  onEffect: <T extends ServerMessage>(type: T['type'], handler: MessageHandler<T>, options?: { once?: boolean }) => void
}

// ============================================================================
// Singleton WebSocket Instance
// ============================================================================

let wsInstance: WebSocket | null = null
let connectionPromise: Promise<void> | null = null
let resolveConnection: (() => void) | null = null
let rejectConnection: ((reason?: any) => void) | null = null

const connected = ref(false)
const error = ref<string | null>(null)
const messageHandlers = new Map<string, Set<MessageHandler>>()
const oneTimeHandlers = new Map<string, Set<MessageHandler>>()

// ============================================================================
// Utility Functions
// ============================================================================

function getWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.host

  // Use proxy in both dev and prod (Vite handles proxy)
  return `${protocol}//${host}/ws`
}

function dispatchMessage(msg: ServerMessage): void {
  const type = msg.type

  // Execute permanent handlers
  const handlers = messageHandlers.get(type)
  handlers?.forEach(handler => handler(msg))

  // Execute one-time handlers then remove
  const oneTime = oneTimeHandlers.get(type)
  if (oneTime) {
    oneTime.forEach(handler => handler(msg))
    oneTimeHandlers.delete(type)
  }
}

// ============================================================================
// WebSocket Connection Management
// ============================================================================

function createWebSocket(): Promise<void> {
  // Return existing connection if available
  if (wsInstance?.readyState === WebSocket.OPEN) {
    console.log('[WS] Already connected')
    return Promise.resolve()
  }

  // Return pending connection promise
  if (connectionPromise) {
    console.log('[WS] Connection in progress, waiting...')
    return connectionPromise
  }

  console.log('[WS] Creating new connection...')

  // Create new connection
  connectionPromise = new Promise((resolve, reject) => {
    resolveConnection = resolve
    rejectConnection = reject

    const url = getWebSocketUrl()
    wsInstance = new WebSocket(url)

    wsInstance.onopen = () => {
      connected.value = true
      error.value = null
      connectionPromise = null
      resolveConnection?.()
      resolveConnection = null
      rejectConnection = null
    }

    wsInstance.onclose = () => {
      connected.value = false
      connectionPromise = null
    }

    wsInstance.onerror = () => {
      error.value = '無法連線伺服器'
      connectionPromise = null
      rejectConnection?.(new Error('Connection failed'))
      rejectConnection = null
      resolveConnection = null
    }

    wsInstance.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage
        console.log('[WS] Received:', msg.type)
        dispatchMessage(msg)
      } catch (e) {
        console.error('[WS] 解析訊息失敗:', e)
      }
    }
  })

  return connectionPromise
}

// ============================================================================
// Export Hook
// ============================================================================

export function useWebSocket(): UseWebSocketReturn {
  function connect(): Promise<void> {
    return createWebSocket()
  }

  function disconnect(): void {
    if (wsInstance) {
      wsInstance.close()
      wsInstance = null
    }
    connected.value = false
  }

  function send(msg: ClientMessage): void {
    if (wsInstance?.readyState === WebSocket.OPEN) {
      wsInstance.send(JSON.stringify(msg))
    } else {
      console.warn('[WS] 連線未建立，無法發送訊息')
    }
  }

  function on<T extends ServerMessage>(type: T['type'], handler: MessageHandler<T>): void {
    if (!messageHandlers.has(type)) {
      messageHandlers.set(type, new Set())
    }
    messageHandlers.get(type)!.add(handler as MessageHandler)
  }

  function off<T extends ServerMessage>(type: T['type'], handler: MessageHandler<T>): void {
    messageHandlers.get(type)?.delete(handler as MessageHandler)
  }

  /**
   * 註冊一次性監聽器，執行後自動移除
   * 適用於：login_success, match_start 等只需要處理一次的訊息
   */
  function onEffect<T extends ServerMessage>(
    type: T['type'],
    handler: MessageHandler<T>,
    _options?: { once?: boolean }
  ): void {
    if (!oneTimeHandlers.has(type)) {
      oneTimeHandlers.set(type, new Set())
    }
    oneTimeHandlers.get(type)!.add(handler as MessageHandler)
  }

  // 元件卸載時只同步狀態，不真正斷開連線（保持單例）
  onUnmounted(() => {
    connected.value = connected.value
  })

  return {
    connected,
    error,
    connect,
    disconnect,
    send,
    on,
    off,
    onEffect
  }
}