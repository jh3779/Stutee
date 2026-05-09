document.addEventListener('DOMContentLoaded', () => {
  const message = document.querySelector('#logoutMessage');
  document.querySelector('#logoutConfirm').addEventListener('click', async () => {
    await logoutCurrentSession();
    message.textContent = '로그아웃되었습니다.';
    setTimeout(() => {
      window.location.href = 'home.html';
    }, 500);
  });
});
