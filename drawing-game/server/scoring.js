function scoreCorrectGuess(secondsRemaining, roundDuration) {
  const speedBonus = Math.ceil((Math.max(0, secondsRemaining) / roundDuration) * 100);
  return 100 + speedBonus;
}

function scoreDrawer(correctGuessCount) {
  return correctGuessCount * 50;
}

module.exports = { scoreCorrectGuess, scoreDrawer };