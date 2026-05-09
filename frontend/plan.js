document.addEventListener('DOMContentLoaded', () => {
  renderCurrentPlan();
  document.querySelectorAll('[data-plan]').forEach((button) => {
    button.addEventListener('click', () => updatePlan(button.dataset.plan));
  });
});
window.addEventListener('stutee-auth-change', renderCurrentPlan);

function renderCurrentPlan() {
  const session = getAuthSession();
  document.querySelectorAll('[data-plan]').forEach((button) => {
    button.classList.toggle('active', session?.user?.plan === button.dataset.plan);
  });
}

async function updatePlan(plan) {
  const message = document.querySelector('#planMessage');
  message.textContent = '';

  if (!getAuthSession()) {
    message.textContent = '로그인 후 플랜을 변경할 수 있습니다.';
    return;
  }

  try {
    const data = await stuteeApi('/api/me/plan', {
      method: 'PATCH',
      body: JSON.stringify({ plan }),
    });
    const session = getAuthSession();
    setAuthSession({ ...session, user: data.user, quota: data.quota });
    message.textContent = `${PLAN_LABELS[plan]} 플랜으로 변경했습니다.`;
    renderCurrentPlan();
  } catch (error) {
    message.textContent = error.message || '플랜 변경에 실패했습니다.';
  }
}

