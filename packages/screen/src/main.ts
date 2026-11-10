import { createGame } from '@horizon/sim';

const game = createGame();
document.getElementById('app')!.textContent = `Горизонт: ${game.world.obstacles.length} перешкод`;
