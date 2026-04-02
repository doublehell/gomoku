<script setup lang="ts">
import { computed } from 'vue'
import { BOARD_SIZE, BLACK, WHITE, EMPTY, type Board, type CellValue } from '@/types'

const props = defineProps<{
  board: Board
  currentPlayer: CellValue
  canPlay: boolean
}>()

const emit = defineEmits<{
  (e: 'move', row: number, col: number): void
}>()

// Responsive cell size
const cellSize = computed(() => {
  const viewportWidth = window.innerWidth
  if (viewportWidth < 640) return 14
  if (viewportWidth < 768) return 16
  if (viewportWidth < 1024) return 20
  return 24
})

const boardSize = computed(() => BOARD_SIZE * cellSize.value)

// Star points - at intersections (0-indexed)
const starPoints = computed(() => {
  if (BOARD_SIZE === 15) {
    // Standard 15x15 star points at positions 3, 7, 11 (0-indexed: 2, 6, 10)
    return [
      { row: 2, col: 2 }, { row: 2, col: 6 }, { row: 2, col: 10 },
      { row: 6, col: 2 }, { row: 6, col: 6 }, { row: 6, col: 10 },
      { row: 10, col: 2 }, { row: 10, col: 6 }, { row: 10, col: 10 }
    ]
  }
  // 25x25
  return [
    { row: 2, col: 2 }, { row: 2, col: 10 }, { row: 2, col: 20 },
    { row: 10, col: 2 }, { row: 10, col: 10 }, { row: 10, col: 20 },
    { row: 20, col: 2 }, { row: 20, col: 10 }, { row: 20, col: 20 }
  ]
})

// Flat array for grid cells
const cells = computed(() => {
  const result: { row: number; col: number }[] = []
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      result.push({ row, col })
    }
  }
  return result
})

function handleClick(row: number, col: number) {
  if (!props.canPlay) return
  if (props.board[row][col] !== EMPTY) return
  emit('move', row, col)
}
</script>

<template>
  <div class="flex justify-center items-center">
    <div
      class="relative rounded-lg shadow-2xl"
      :style="{
        width: boardSize + 48 + 'px',
        height: boardSize + 48 + 'px',
        background: 'linear-gradient(135deg, #d4a574 0%, #c9956c 25%, #deb887 50%, #c9956c 75%, #d4a574 100%)',
        boxShadow: 'inset 0 0 20px rgba(0,0,0,0.2), 0 8px 32px rgba(0,0,0,0.3)'
      }"
    >
      <!-- Wood grain texture overlay -->
      <div
        class="absolute inset-0 rounded-lg opacity-30"
        style="background: repeating-linear-gradient(90deg, transparent, rgba(139,90,43,0.1) 2px, transparent 4px);"
      ></div>

      <!-- Grid container -->
      <div
        class="absolute"
        :style="{ left: '24px', top: '24px' }"
      >
        <!-- Horizontal lines -->
        <div
          v-for="i in BOARD_SIZE"
          :key="'h' + i"
          class="absolute bg-black/60"
          :style="{
            left: '0',
            top: ((i - 1) * cellSize) + 'px',
            width: boardSize + 'px',
            height: '1.5px'
          }"
        ></div>

        <!-- Vertical lines -->
        <div
          v-for="i in BOARD_SIZE"
          :key="'v' + i"
          class="absolute bg-black/60"
          :style="{
            left: ((i - 1) * cellSize) + 'px',
            top: '0',
            width: '1.5px',
            height: boardSize + 'px'
          }"
        ></div>
      </div>

      <!-- Star points (hoshi) - at intersections (line crossings) -->
      <div
        v-for="point in starPoints"
        :key="`star-${point.row}-${point.col}`"
        class="absolute rounded-full bg-black/70"
        :style="{
          left: (24 + point.col * cellSize - 4) + 'px',
          top: (24 + point.row * cellSize - 4) + 'px',
          width: '8px',
          height: '8px'
        }"
      ></div>

      <!-- Clickable cells layer -->
      <div
        class="absolute"
        :style="{
          left: '24px',
          top: '24px',
          width: boardSize + 'px',
          height: boardSize + 'px',
          gridTemplateColumns: `repeat(${BOARD_SIZE}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${BOARD_SIZE}, ${cellSize}px)`
        }"
        style="display: grid;"
      >
        <div
          v-for="cell in cells"
          :key="`${cell.row}-${cell.col}`"
          class="relative flex items-center justify-center"
          :class="canPlay && board[cell.row][cell.col] === EMPTY ? 'cursor-pointer' : ''"
          :style="{ width: cellSize + 'px', height: cellSize + 'px' }"
          @click="handleClick(cell.row, cell.col)"
        >
          <!-- Hover effect -->
          <div
            v-if="canPlay && board[cell.row][cell.col] === EMPTY"
            class="absolute inset-0 rounded-full bg-black/10 scale-50 opacity-0 hover:opacity-100 transition-opacity"
          ></div>

          <!-- Black stone -->
          <div
            v-if="board[cell.row][cell.col] === BLACK"
            class="rounded-full shadow-lg"
            style="
              background: radial-gradient(circle at 30% 30%, #4a4a4a, #1a1a1a 60%, #000 100%);
              box-shadow: 2px 2px 4px rgba(0,0,0,0.5), inset -2px -2px 4px rgba(0,0,0,0.3);
            "
            :style="{
              width: (cellSize * 0.9) + 'px',
              height: (cellSize * 0.9) + 'px'
            }"
          ></div>

          <!-- White stone -->
          <div
            v-if="board[cell.row][cell.col] === WHITE"
            class="rounded-full shadow-lg"
            style="
              background: radial-gradient(circle at 30% 30%, #ffffff, #e8e8e8 40%, #d0d0d0 70%, #b0b0b0 100%);
              box-shadow: 2px 2px 4px rgba(0,0,0,0.3), inset -2px -2px 4px rgba(0,0,0,0.1);
            "
            :style="{
              width: (cellSize * 0.9) + 'px',
              height: (cellSize * 0.9) + 'px'
            }"
          ></div>
        </div>
      </div>

      <!-- Coordinate labels - top (numbers) -->
      <div
        v-for="i in BOARD_SIZE"
        :key="'ct' + i"
        class="absolute text-xs font-medium text-center"
        :style="{
          left: ((i - 1) * cellSize + 24 + cellSize / 2 - 4) + 'px',
          top: '4px',
          width: '12px',
          color: '#5c4033'
        }"
      >
        {{ i }}
      </div>

      <!-- Coordinate labels - left (letters) -->
      <div
        v-for="i in BOARD_SIZE"
        :key="'cl' + i"
        class="absolute text-xs font-medium text-center"
        :style="{
          top: ((i - 1) * cellSize + 24 + cellSize / 2 - 4) + 'px',
          left: '4px',
          width: '12px',
          color: '#5c4033'
        }"
      >
        {{ String.fromCharCode(64 + i) }}
      </div>

      <!-- Border frame -->
      <div
        class="absolute inset-2 rounded pointer-events-none"
        style="border: 3px solid #8b4513; box-shadow: inset 0 0 10px rgba(0,0,0,0.3);"
      ></div>
    </div>
  </div>
</template>