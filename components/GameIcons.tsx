// Custom SVG logos for each game - Neo-brutalism style
export const GameIcons = {
  trivia: (
    <svg viewBox="0 0 100 100" className="game-icon">
      <rect x="10" y="10" width="80" height="80" fill="#FF6B9D" stroke="#000" strokeWidth="4"/>
      <circle cx="50" cy="35" r="15" fill="#FFF" stroke="#000" strokeWidth="4"/>
      <path d="M 50 35 L 50 50" stroke="#000" strokeWidth="5" strokeLinecap="round"/>
      <circle cx="50" cy="65" r="4" fill="#000"/>
      <rect x="5" y="5" width="80" height="80" fill="none" stroke="#000" strokeWidth="3" opacity="0.3"/>
    </svg>
  ),

  word: (
    <svg viewBox="0 0 100 100" className="game-icon">
      <rect x="10" y="10" width="80" height="80" fill="#FFD93D" stroke="#000" strokeWidth="4"/>
      <text x="50" y="65" fontSize="48" fontWeight="900" fill="#000" textAnchor="middle" fontFamily="monospace">A</text>
      <rect x="15" y="15" width="70" height="70" fill="none" stroke="#000" strokeWidth="2" strokeDasharray="5,5" opacity="0.4"/>
    </svg>
  ),

  geo: (
    <svg viewBox="0 0 100 100" className="game-icon">
      <rect x="10" y="10" width="80" height="80" fill="#6BCF7F" stroke="#000" strokeWidth="4"/>
      <circle cx="50" cy="40" r="18" fill="none" stroke="#000" strokeWidth="4"/>
      <path d="M 50 22 L 50 58" stroke="#000" strokeWidth="4"/>
      <ellipse cx="50" cy="40" rx="18" ry="8" fill="none" stroke="#000" strokeWidth="4"/>
      <path d="M 50 58 L 45 70 L 50 68 L 55 70 Z" fill="#000"/>
    </svg>
  ),

  truefalse: (
    <svg viewBox="0 0 100 100" className="game-icon">
      <rect x="10" y="10" width="35" height="80" fill="#6BCF7F" stroke="#000" strokeWidth="4"/>
      <rect x="55" y="10" width="35" height="80" fill="#FF6B6B" stroke="#000" strokeWidth="4"/>
      <path d="M 20 35 L 27 42 L 38 28" stroke="#000" strokeWidth="5" strokeLinecap="round" fill="none"/>
      <path d="M 62 30 L 82 50 M 82 30 L 62 50" stroke="#000" strokeWidth="5" strokeLinecap="round"/>
    </svg>
  ),

  oddoneout: (
    <svg viewBox="0 0 100 100" className="game-icon">
      <rect x="10" y="10" width="80" height="80" fill="#A78BFA" stroke="#000" strokeWidth="4"/>
      <circle cx="30" cy="35" r="8" fill="#000"/>
      <circle cx="50" cy="35" r="8" fill="#000"/>
      <circle cx="70" cy="35" r="8" fill="#000"/>
      <rect x="42" y="55" width="16" height="16" fill="#FFD93D" stroke="#000" strokeWidth="3"/>
      <path d="M 42 55 L 58 71 M 58 55 L 42 71" stroke="#FF6B6B" strokeWidth="3"/>
    </svg>
  ),

  emoji: (
    <svg viewBox="0 0 100 100" className="game-icon">
      <rect x="10" y="10" width="80" height="80" fill="#FFD93D" stroke="#000" strokeWidth="4"/>
      <circle cx="50" cy="50" r="25" fill="#FF6B9D" stroke="#000" strokeWidth="4"/>
      <circle cx="42" cy="45" r="3" fill="#000"/>
      <circle cx="58" cy="45" r="3" fill="#000"/>
      <path d="M 40 58 Q 50 65 60 58" stroke="#000" strokeWidth="3" fill="none" strokeLinecap="round"/>
    </svg>
  ),

  riddles: (
    <svg viewBox="0 0 100 100" className="game-icon">
      <rect x="10" y="10" width="80" height="80" fill="#FF9B71" stroke="#000" strokeWidth="4"/>
      <path d="M 30 30 L 50 25 L 70 30 L 70 55 L 50 60 L 30 55 Z" fill="#FFF" stroke="#000" strokeWidth="4"/>
      <text x="50" y="52" fontSize="32" fontWeight="900" fill="#000" textAnchor="middle">?</text>
      <circle cx="50" cy="75" r="6" fill="#000"/>
    </svg>
  ),

  capitals: (
    <svg viewBox="0 0 100 100" className="game-icon">
      <rect x="10" y="10" width="80" height="80" fill="#6BCDCF" stroke="#000" strokeWidth="4"/>
      <path d="M 50 25 L 35 55 L 40 55 L 40 70 L 60 70 L 60 55 L 65 55 Z" fill="#FF6B9D" stroke="#000" strokeWidth="4"/>
      <rect x="45" y="35" width="10" height="15" fill="#FFF" stroke="#000" strokeWidth="2"/>
      <rect x="42" y="20" width="16" height="8" fill="#FFD93D" stroke="#000" strokeWidth="3"/>
    </svg>
  ),

  math: (
    <svg viewBox="0 0 100 100" className="game-icon">
      <rect x="10" y="10" width="80" height="80" fill="#FF6B9D" stroke="#000" strokeWidth="4"/>
      <text x="30" y="50" fontSize="36" fontWeight="900" fill="#000" fontFamily="monospace">+</text>
      <text x="55" y="50" fontSize="36" fontWeight="900" fill="#000" fontFamily="monospace">×</text>
      <path d="M 25 65 L 75 65" stroke="#000" strokeWidth="5"/>
      <text x="50" y="85" fontSize="28" fontWeight="900" fill="#000" textAnchor="middle" fontFamily="monospace">=</text>
    </svg>
  ),

  landmark: (
    <svg viewBox="0 0 100 100" className="game-icon">
      <rect x="10" y="10" width="80" height="80" fill="#A78BFA" stroke="#000" strokeWidth="4"/>
      <path d="M 50 20 L 30 45 L 35 45 L 35 70 L 65 70 L 65 45 L 70 45 Z" fill="#FFD93D" stroke="#000" strokeWidth="4"/>
      <rect x="45" y="55" width="10" height="15" fill="#000"/>
      <path d="M 25 75 L 75 75" stroke="#000" strokeWidth="5" strokeLinecap="round"/>
    </svg>
  ),

  logo: (
    <svg viewBox="0 0 100 100" className="game-icon">
      <rect x="10" y="10" width="80" height="80" fill="#6BCDCF" stroke="#000" strokeWidth="4"/>
      <circle cx="50" cy="45" r="20" fill="#FF6B9D" stroke="#000" strokeWidth="4"/>
      <path d="M 35 45 L 50 30 L 65 45 L 50 60 Z" fill="#FFD93D" stroke="#000" strokeWidth="3"/>
      <rect x="40" y="65" width="20" height="8" fill="#000"/>
    </svg>
  ),

  movie: (
    <svg viewBox="0 0 100 100" className="game-icon">
      <rect x="10" y="10" width="80" height="80" fill="#FF9B71" stroke="#000" strokeWidth="4"/>
      <rect x="25" y="30" width="50" height="40" fill="#000" stroke="#000" strokeWidth="4"/>
      <rect x="30" y="35" width="40" height="30" fill="#FFF"/>
      <path d="M 50 42 L 45 50 L 50 58 L 55 50 Z" fill="#FF6B9D"/>
      <circle cx="20" cy="20" r="5" fill="#FFD93D" stroke="#000" strokeWidth="2"/>
      <circle cx="80" cy="20" r="5" fill="#FFD93D" stroke="#000" strokeWidth="2"/>
    </svg>
  ),

  color: (
    <svg viewBox="0 0 100 100" className="game-icon">
      <rect x="10" y="10" width="80" height="80" fill="#FFF" stroke="#000" strokeWidth="4"/>
      <rect x="20" y="20" width="25" height="25" fill="#FF6B9D" stroke="#000" strokeWidth="3"/>
      <rect x="55" y="20" width="25" height="25" fill="#6BCF7F" stroke="#000" strokeWidth="3"/>
      <rect x="20" y="55" width="25" height="25" fill="#FFD93D" stroke="#000" strokeWidth="3"/>
      <rect x="55" y="55" width="25" height="25" fill="#6BCDCF" stroke="#000" strokeWidth="3"/>
    </svg>
  ),
};

export function GameIcon({ gameId }: { gameId: string }) {
  const icon = GameIcons[gameId as keyof typeof GameIcons];
  return icon || GameIcons.trivia;
}
