// Database schema for leaderboard and user profiles
// This would typically be in a database migration file

export interface UserProfile {
  address: string; // Wallet address (primary key)
  username: string | null;
  avatar: string | null; // URL or emoji
  createdAt: number;
  updatedAt: number;
  stats: UserStats;
  achievements: string[];
  friends: string[]; // Array of wallet addresses
}

export interface UserStats {
  totalGamesPlayed: number;
  totalGamesWon: number;
  totalStaked: number; // in cUSD
  totalWinnings: number; // in cUSD
  totalLosses: number; // in cUSD
  highestMultiplier: number; // in basis points
  currentStreak: number;
  longestStreak: number;
  favoriteGame: string | null;
  lastPlayedAt: number;
}

export interface LeaderboardEntry {
  address: string;
  username: string | null;
  avatar: string | null;
  score: number; // Different scoring methods
  gamesPlayed: number;
  winRate: number; // percentage
  totalWinnings: number;
  rank: number;
}

export interface GameSession {
  sessionId: string;
  player: string;
  gameId: string;
  stake: number;
  finalMultiplier: number;
  payout: number;
  profit: number; // payout - stake
  roundsPlayed: number;
  correctAnswers: number;
  wrongAnswers: number;
  timestamp: number;
  settled: boolean;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  requirement: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

// Leaderboard types
export type LeaderboardPeriod = 'daily' | 'weekly' | 'monthly' | 'allTime';
export type LeaderboardMetric = 'winnings' | 'winRate' | 'gamesPlayed' | 'highestMultiplier';
