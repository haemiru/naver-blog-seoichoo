const form = document.getElementById('login-form');
const submitBtn = document.getElementById('submit-btn');
const statusEl = document.getElementById('status');

function showStatus(message, type) {
  statusEl.hidden = false;
  statusEl.textContent = message;
  statusEl.className = `status status-${type}`;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const naverId = document.getElementById('naverId').value.trim();
  const password = document.getElementById('password').value;
  const neighborCount = parseInt(document.getElementById('neighborCount').value, 10);

  if (!naverId || !password) {
    showStatus('ID와 비밀번호를 입력하세요.', 'error');
    return;
  }
  if (!Number.isInteger(neighborCount) || neighborCount < 1 || neighborCount > 30) {
    showStatus('이웃추가 수는 1~30 사이여야 합니다.', 'error');
    return;
  }

  submitBtn.disabled = true;
  showStatus('처리 중...', 'info');

  try {
    const result = await window.api.startAutomation({ naverId, password, neighborCount });
    showStatus(result.message || '완료', result.ok ? 'success' : 'error');
  } catch (err) {
    showStatus(`오류: ${err.message}`, 'error');
  } finally {
    submitBtn.disabled = false;
  }
});
