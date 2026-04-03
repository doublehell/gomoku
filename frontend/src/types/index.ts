// Constants
export const BOARD_SIZE = 15
export const EMPTY = 0
export const BLACK = 1
export const WHITE = 2
export const TIMEOUT_MS = 60000

// Player status
export type PlayerStatus = 'waiting' | 'queue' | 'playing' | 'spectating'

// Cell value
export type CellValue = typeof EMPTY | typeof BLACK | typeof WHITE

// Board type
export type Board = CellValue[][]

// Chat message
export interface ChatMessage {
  time: string
  name: string
  message: string
}

// Player info
export interface PlayerInfo {
  name: string
  status: PlayerStatus
}

// Server messages
export type ServerMessage =
  | LoginRequest
  | LoginSuccess
  | ErrorMessage
  | QueueStatus
  | PlayerList
  | SpectatorList
  | LobbyState
  | MatchStart
  | Spectate
  | Move
  | Win
  | Lose
  | Timeout
  | GameEnd
  | TimeSync
  | ChatBroadcast
  | OpponentLeft

// Login request - server asks client to login
export interface LoginRequest {
  type: 'login_request'
}

// Login success
export interface LoginSuccess {
  type: 'login_success'
  name: string
  sessionToken: string
  inQueue?: boolean
  restored?: boolean
}

// Error message
export interface ErrorMessage {
  type: 'error'
  message: string
}

// Queue status
export interface QueueStatus {
  type: 'queue_status'
  count: number
}

// Player list
export interface PlayerList {
  type: 'player_list'
  players: PlayerInfo[]
}

// Spectator list
export interface SpectatorList {
  type: 'spectator_list'
  spectators: string[]
  waiting: string[]
}

// Match start
export interface MatchStart {
  type: 'match_start'
  playerColor: CellValue
  opponentName: string
  board: Board
  currentPlayer: CellValue
  restored?: boolean
}

// Spectate
export interface Spectate {
  type: 'spectate'
  players: [string, string]
  board: Board
  currentPlayer: CellValue
  restored?: boolean
}

// Move
export interface Move {
  type: 'move'
  row: number
  col: number
  player: CellValue
  currentPlayer: CellValue
}

// Win (game won)
export interface Win {
  type: 'win'
  winner: CellValue
}

// Lose (game lost)
export interface Lose {
  type: 'lose'
  winner: CellValue
  reason: string
}

// Timeout
export interface Timeout {
  type: 'timeout'
  winner: CellValue
  reason: string
}

// Game end (for spectators)
export interface GameEnd {
  type: 'game_end'
  winner: CellValue
  winnerName: string
  reason: string
}

// Time sync
export interface TimeSync {
  type: 'time_sync'
  remaining: number
}

// Chat broadcast
export interface ChatBroadcast {
  type: 'chat_broadcast'
  time: string
  name: string
  message: string
}

// Opponent left
export interface OpponentLeft {
  type: 'opponent_left'
}

// Lobby state (同步大廳狀態)
export interface LobbyState {
  type: 'lobby_state'
  waiting: string[]      // 排隊中的玩家
  spectators: string[]   // 觀眾
  players: Array<{
    name: string
    status: PlayerStatus
  }>
}

// Client messages
export type ClientMessage =
  | Login
  | JoinQueue
  | LeaveQueue
  | RestoreSession
  | MoveMessage
  | Chat

// Login
export interface Login {
  type: 'login'
  name: string
}

// Join queue
export interface JoinQueue {
  type: 'join_queue'
}

// Leave queue
export interface LeaveQueue {
  type: 'leave_queue'
}

// Restore session
export interface RestoreSession {
  type: 'restore_session'
  sessionToken: string
}

// Move message
export interface MoveMessage {
  type: 'move'
  row: number
  col: number
}

// Chat
export interface Chat {
  type: 'chat'
  message: string
}

// Game state
export interface GameState {
  board: Board
  currentPlayer: CellValue
  playerColor: CellValue | null
  opponentName: string
  isMyTurn: boolean
  gameOver: boolean
  winner: CellValue | null
  reason: string
  remainingTime: number
}