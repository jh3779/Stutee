document.addEventListener('DOMContentLoaded', renderProfile);
window.addEventListener('stutee-auth-change', renderProfile);

function renderProfile() {
  const card    = document.querySelector('#profileCard');
  const summary = document.querySelector('#profileSummary');
  const session = getAuthSession();

  /* 로그인 전용 메뉴 표시/숨김 */
  document.querySelectorAll('[data-auth-required]').forEach((el) => {
    el.classList.toggle('hidden', !session);
  });

  if (!session) {
    summary.textContent = '로그인 후 프로필을 확인할 수 있습니다.';
    card.innerHTML = `
      <h2>로그인이 필요합니다</h2>
      <p>프로필 설정과 사용자별 생성 이력을 사용하려면 먼저 로그인하세요.</p>
      <a class="btn btn-primary" href="login.html">로그인</a>
    `;
    return;
  }

  const quota = session.quota || {};
  summary.textContent = `${session.user.name || session.user.email} 계정 설정입니다.`;
  card.innerHTML = `
    <h2>${escapeHtml(session.user.name || session.user.email)}</h2>
    <dl class="profile-details">
      <div><dt>이메일</dt><dd>${escapeHtml(session.user.email)}</dd></div>
      <div><dt>플랜</dt><dd>${PLAN_LABELS[session.user.plan] || session.user.plan}</dd></div>
      <div><dt>오늘 생성</dt><dd>${quota.dailyCount ?? 0} / ${quota.dailyLimit ?? '-'}</dd></div>
      <div><dt>남은 횟수</dt><dd>${quota.remaining ?? '-'}</dd></div>
    </dl>
  `;
}

