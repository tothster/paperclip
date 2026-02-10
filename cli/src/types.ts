// =============================================================================
// TYPES
// =============================================================================

export interface AgentState {
  pubkey: string;
  clipsBalance: number;
  efficiencyTier: number;
  tasksCompleted: number;
  registeredAt: number;
  lastActiveAt: number;
}

export interface TaskInfo {
  taskId: number;
  title: string;
  rewardClips: number;
  maxClaims: number;
  currentClaims: number;
  contentCid: string;
  content?: unknown;
}

export interface CliResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}
