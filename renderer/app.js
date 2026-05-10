const form = document.getElementById('login-form');
const discoverBtn = document.getElementById('discover-btn');
const statusEl = document.getElementById('status');

const stepLogin = document.getElementById('step-login');
const stepCandidates = document.getElementById('step-candidates');
const stepResults = document.getElementById('step-results');
const resultsSummary = document.getElementById('results-summary');
const resultsList = document.getElementById('results-list');
const resultsFile = document.getElementById('results-file');
const candidatesList = document.getElementById('candidates-list');
const candidatesSummary = document.getElementById('candidates-summary');
const selectAllBtn = document.getElementById('select-all');
const deselectAllBtn = document.getElementById('deselect-all');
const applyBtn = document.getElementById('apply-btn');

let neededCount = 10;

function showStatus(message, type) {
  statusEl.hidden = false;
  statusEl.textContent = message;
  statusEl.className = `status status-${type}`;
}

function updateApplyBtnLabel() {
  const checked = candidatesList.querySelectorAll('input[type="checkbox"]:checked').length;
  applyBtn.textContent = `선택한 ${checked}명 이웃 신청`;
  applyBtn.disabled = checked === 0;
}

function renderCandidates(candidates, needed) {
  candidatesList.innerHTML = '';
  candidates.forEach((c, idx) => {
    const li = document.createElement('li');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = idx < needed; // 상위 needed명 기본 체크
    checkbox.dataset.blogId = c.blogId;
    checkbox.addEventListener('change', updateApplyBtnLabel);

    const label = document.createElement('label');
    label.className = 'candidate';
    label.appendChild(checkbox);

    const text = document.createElement('span');
    text.innerHTML = `<strong>${c.blogId}</strong> <span class="kw">${c.hitKeywords.join(' · ')}</span>`;
    label.appendChild(text);

    li.appendChild(label);
    candidatesList.appendChild(li);
  });
  candidatesSummary.textContent = `총 ${candidates.length}명 발견. 상위 ${needed}명 기본 체크됨.`;
  updateApplyBtnLabel();
}

window.api.onProgress((message) => {
  showStatus(message, 'info');
});

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

  neededCount = neighborCount;
  discoverBtn.disabled = true;
  showStatus('처리 중...', 'info');

  try {
    const result = await window.api.startDiscovery({ naverId, password, neighborCount });
    if (!result.ok) {
      showStatus(`오류: ${result.message}`, 'error');
      discoverBtn.disabled = false;
      return;
    }
    showStatus(result.message, 'success');
    renderCandidates(result.candidates, neighborCount);
    stepCandidates.hidden = false;
  } catch (err) {
    showStatus(`오류: ${err.message}`, 'error');
    discoverBtn.disabled = false;
  }
});

selectAllBtn.addEventListener('click', () => {
  candidatesList.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = true; });
  updateApplyBtnLabel();
});

deselectAllBtn.addEventListener('click', () => {
  candidatesList.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = false; });
  updateApplyBtnLabel();
});

function renderResults(result) {
  resultsList.innerHTML = '';
  for (const r of result.results || []) {
    const li = document.createElement('li');
    li.className = `result result-${r.status}`;
    const statusLabel = {
      success: '✅ 성공',
      already_buddy: '🔁 이미이웃',
      rejected: '🚫 거부',
      not_found: '❓ 없음',
      error: '⚠ 오류',
    }[r.status] || r.status;
    const detail = r.detail ? `<div class="result-detail">${r.detail}</div>` : '';
    li.innerHTML = `
      <div class="result-head"><strong>${r.blogId}</strong> <span class="result-status">${statusLabel}</span></div>
      <div class="result-msg">"${r.message}"</div>
      ${detail}
    `;
    resultsList.appendChild(li);
  }
  resultsSummary.textContent = result.summary || result.message;
  resultsFile.textContent = result.resultFile ? `결과 저장: ${result.resultFile}` : '';
}

applyBtn.addEventListener('click', async () => {
  const selected = Array.from(candidatesList.querySelectorAll('input[type="checkbox"]:checked'))
    .map((cb) => cb.dataset.blogId);
  if (selected.length === 0) return;

  applyBtn.disabled = true;
  showStatus(`${selected.length}명 이웃 신청 시작...`, 'info');

  try {
    const result = await window.api.startApplying({ blogIds: selected });
    showStatus(result.message, result.ok ? 'success' : 'error');
    if (result.ok) {
      renderResults(result);
      stepCandidates.hidden = true;
      stepResults.hidden = false;
    }
  } catch (err) {
    showStatus(`오류: ${err.message}`, 'error');
  } finally {
    applyBtn.disabled = false;
    updateApplyBtnLabel();
  }
});
