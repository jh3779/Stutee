let authMode = 'login';

document.addEventListener('DOMContentLoaded', () => {
  if (getAuthSession()) {
    window.location.href = 'home.html';
    return;
  }

  const form = document.querySelector('#loginForm');
  const message = document.querySelector('#authMessage');
  const nameField = document.querySelector('.signup-only');
  const passwordInput = document.querySelector('#passwordInput');
  const submit = document.querySelector('#authSubmit');

  document.querySelectorAll('[data-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      authMode = button.dataset.mode;
      document.querySelectorAll('[data-mode]').forEach((item) => item.classList.toggle('active', item === button));
      nameField.classList.toggle('hidden', authMode !== 'signup');
      passwordInput.autocomplete = authMode === 'signup' ? 'new-password' : 'current-password';
      submit.textContent = authMode === 'signup' ? '회원가입' : '로그인';
      message.textContent = '';
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.textContent = '';

    const payload = {
      email: document.querySelector('#emailInput').value.trim(),
      password: passwordInput.value,
    };
    if (authMode === 'signup') payload.name = document.querySelector('#nameInput').value.trim();

    try {
      const data = await stuteeApi(authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setAuthSession({ token: data.token, user: data.user, quota: data.quota });
      window.location.href = 'home.html';
    } catch (error) {
      message.textContent = error.message || '로그인 처리에 실패했습니다.';
    }
  });
});

