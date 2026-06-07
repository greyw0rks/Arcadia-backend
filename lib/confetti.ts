// Confetti animation for wins
export function createConfetti() {
  if (typeof window === 'undefined') return;

  const colors = ['#FF6B9D', '#6BCDCF', '#6BCF7F', '#FFD93D', '#A78BFA', '#FF9B71'];
  const confettiCount = 50;
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 9999;
  `;
  document.body.appendChild(container);

  for (let i = 0; i < confettiCount; i++) {
    const confetti = document.createElement('div');
    const color = colors[Math.floor(Math.random() * colors.length)];
    const left = Math.random() * 100;
    const animationDuration = 2 + Math.random() * 2;
    const size = 8 + Math.random() * 8;
    const rotation = Math.random() * 360;

    confetti.style.cssText = `
      position: absolute;
      left: ${left}%;
      top: -10%;
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      border: 2px solid #0F0F0F;
      transform: rotate(${rotation}deg);
      animation: confettiFall ${animationDuration}s ease-out forwards;
      opacity: 1;
    `;

    container.appendChild(confetti);
  }

  // Add animation keyframes
  if (!document.getElementById('confetti-styles')) {
    const style = document.createElement('style');
    style.id = 'confetti-styles';
    style.textContent = `
      @keyframes confettiFall {
        0% {
          transform: translateY(0) rotate(0deg);
          opacity: 1;
        }
        100% {
          transform: translateY(100vh) rotate(720deg);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Remove after animation
  setTimeout(() => {
    document.body.removeChild(container);
  }, 4000);
}
