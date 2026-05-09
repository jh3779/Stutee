document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('#deleteAccountForm');
  const message = document.querySelector('#deleteMessage');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.textContent = '';

    if (!getAuthSession()) {
      message.textContent = '로그인 후 탈퇴할 수 있습니다.';
      return;
    }

    if (!confirm('정말 계정을 삭제하시겠습니까?')) return;

    try {
      await stuteeApi('/api/me', {
        method: 'DELETE',
        body: JSON.stringify({ password: document.querySelector('#deletePassword').value }),
      });
      Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
      window.location.href = 'login.html';
    } catch (error) {
      message.textContent = error.message || '계정 삭제에 실패했습니다.';
    }
  });
});
