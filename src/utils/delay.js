function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelaySeconds(min = 30, max = 90) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

module.exports = { sleep, randomDelaySeconds };
