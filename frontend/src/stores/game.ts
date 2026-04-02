import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { BOARD_SIZE, EMPTY, BLACK, WHITE, type Board, type CellValue, type GameState } from '@/types'

export const useGameStore = defineStore('game', () => {
  const board = ref<Board>(createEmptyBoard())
  const playerColor = ref<CellValue | null>(null)
  const opponentName = ref<string>('')
  const currentPlayer = ref<CellValue>(BLACK)
  const gameOver = ref(false)
  const winner = ref<CellValue | null>(null)
  const reason = ref<string>('')
  const remainingTime = ref<number>(60)
  const isSpectator = ref(false)
  const spectatingPlayers = ref<[string, string]>(['', ''])

  const isMyTurn = computed(() => {
    const result = !playerColor.value || gameOver.value ? false : currentPlayer.value === playerColor.value
    console.log('[GameStore] isMyTurn computed:', { playerColor: playerColor.value, currentPlayer: currentPlayer.value, gameOver: gameOver.value, result })
    return result
  })

  const isBlack = computed(() => playerColor.value === BLACK)
  const isWhite = computed(() => playerColor.value === WHITE)

  function createEmptyBoard(): Board {
    return Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(EMPTY))
  }

  function startGame(color: CellValue, opponent: string, initialBoard: Board, current: CellValue, restored = false) {
    board.value = initialBoard.map(row => [...row])
    playerColor.value = color
    opponentName.value = opponent
    currentPlayer.value = current
    gameOver.value = false
    winner.value = null
    reason.value = ''
    isSpectator.value = false
    remainingTime.value = 60
  }

  function startSpectating(players: [string, string], initialBoard: Board, current: CellValue, restored = false) {
    board.value = initialBoard.map(row => [...row])
    spectatingPlayers.value = players
    playerColor.value = null
    opponentName.value = ''
    currentPlayer.value = current
    gameOver.value = false
    winner.value = null
    reason.value = ''
    isSpectator.value = true
    remainingTime.value = 60
  }

  function makeMove(row: number, col: number, player: CellValue) {
    if (row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE) {
      board.value[row][col] = player
    }
  }

  function setCurrentPlayer(player: CellValue) {
    currentPlayer.value = player
  }

  function setGameOver(w: CellValue, r: string) {
    gameOver.value = true
    winner.value = w
    reason.value = r
  }

  function setRemainingTime(seconds: number) {
    remainingTime.value = seconds
  }

  function reset() {
    board.value = createEmptyBoard()
    playerColor.value = null
    opponentName.value = ''
    currentPlayer.value = BLACK
    gameOver.value = false
    winner.value = null
    reason.value = ''
    isSpectator.value = false
    spectatingPlayers.value = ['', '']
    remainingTime.value = 60
  }

  return {
    board,
    playerColor,
    opponentName,
    currentPlayer,
    gameOver,
    winner,
    reason,
    remainingTime,
    isSpectator,
    spectatingPlayers,
    isMyTurn,
    isBlack,
    isWhite,
    startGame,
    startSpectating,
    makeMove,
    setCurrentPlayer,
    setGameOver,
    setRemainingTime,
    reset
  }
})