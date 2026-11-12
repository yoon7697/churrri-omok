import { test, expect } from '@playwright/test';
async function create(page, rounds = 5) {
  await page.goto('/'); await page.locator('#createOnlineRoom').click();
  await page.locator(`input[name="rounds"][value="${rounds}"]`).check();
  await page.locator('#createRoomForm').getByRole('button', { name: '체험 방 만들기' }).click();
}
async function join(page, nickname = '용감한별') {
  await page.goto('/'); await page.locator('#joinOnlineRoom').click();
  await page.getByRole('button', { name: '예시 코드 4827 입력하기' }).click();
  await page.locator('#studentNickname').fill(nickname);
  await page.locator('#joinRoomForm').getByRole('button', { name: '대기실 입장하기' }).click();
}

test('teacher creates 3/5/7-round previews and restores on refresh', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  for (const n of [3, 5, 7]) {
    await create(page, n);
    await expect(page.locator('.room-summary strong')).toHaveText(`${n}라운드 · 한 판 최대 5분`);
    await expect(page.locator('.room-code')).toHaveText('4827');
    await expect(page.locator('.empty-roster')).toBeVisible();
    await expect(page.getByRole('button', { name: '대회 시작 · 다음 단계' })).toBeDisabled();
    await page.reload(); await expect(page.locator('#onlineTitle')).toHaveText('친구들을 기다리고 있어요');
    await page.getByRole('button', { name: '체험 방 닫기' }).click(); await page.locator('#confirmCloseRoom').click();
    await page.getByRole('button', { name: '처음 화면', exact: false }).click();
  }
  expect(errors).toEqual([]);
});

test('teacher manages samples, duplicate names, kick cancellation and lock', async ({ page }) => {
  await create(page); await page.getByRole('button', { name: '＋ 예시 학생 추가' }).click();
  await expect(page.locator('button.participant-card')).toHaveCount(6);
  await page.getByRole('button', { name: '＋ 예시 학생 추가' }).click();
  await expect(page.locator('button.participant-card')).toHaveCount(6);
  await page.getByRole('button', { name: '파란고래 관리' }).click();
  await page.locator('#renameNickname').fill('반짝별'); await page.getByRole('button', { name: '이름 변경하기' }).click();
  await expect(page.locator('#renameError')).toContainText('같은 닉네임');
  await page.locator('#renameNickname').fill('푸른바다'); await page.getByRole('button', { name: '이름 변경하기' }).click();
  await expect(page.getByRole('button', { name: '푸른바다 관리' })).toBeVisible();
  await page.getByRole('button', { name: '푸른바다 관리' }).click(); await page.locator('#kickStudent').click();
  await page.locator('#cancelKick').click(); await expect(page.locator('button.participant-card')).toHaveCount(6);
  await page.getByRole('button', { name: '푸른바다 관리' }).click(); await page.locator('#kickStudent').click();
  await page.locator('#confirmKick').click(); await expect(page.locator('button.participant-card')).toHaveCount(5);
  await page.locator('.lock-button').click(); await expect(page.locator('.lock-button')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '＋ 예시 학생 추가' })).toBeDisabled();
  await page.getByRole('button', { name: '학생 화면 체험 →' }).click();
  await page.locator('#studentNickname').fill('새친구'); await page.locator('#joinRoomForm button[type="submit"]').click();
  await expect(page.locator('#lobbyError')).toContainText('입장을 잠갔어요');
});

test('student validates code and nickname, joins sample lobby and leaves', async ({ page }) => {
  await page.goto('/'); await page.locator('#joinCode').fill('1234'); await page.locator('#joinOnlineRoom').click();
  await expect(page.locator('#lobbyCode')).toHaveValue('1234');
  await page.locator('#studentNickname').fill('테스트별'); await page.locator('#joinRoomForm button[type="submit"]').click();
  await expect(page.locator('#lobbyError')).toContainText('예시 코드 4827');
  await page.getByRole('button', { name: '예시 코드 4827 입력하기' }).click();
  await page.locator('#studentNickname').fill(' '); await page.locator('#joinRoomForm button[type="submit"]').click();
  await expect(page.locator('#lobbyError')).toContainText('2~12자');
  await page.locator('#studentNickname').fill('파란고래'); await page.locator('#joinRoomForm button[type="submit"]').click();
  await expect(page.locator('#lobbyError')).toContainText('같은 닉네임');
  await page.locator('#studentNickname').fill('테스트별'); await page.locator('#joinRoomForm button[type="submit"]').click();
  await expect(page.locator('#myNickname')).toHaveText('테스트별');
  await expect(page.locator('li.participant-card')).toHaveCount(7);
  await expect(page.locator('.my-card')).toContainText('나');
  await page.reload(); await expect(page.locator('#myNickname')).toHaveText('테스트별');
  await page.getByRole('button', { name: '대기실 나가기', exact: true }).click(); await page.locator('#confirmLeave').click();
  await expect(page.locator('#landing')).toBeVisible();
});

test('student practices with real AI and returns to same lobby, setup and game navigation', async ({ page }) => {
  await join(page); await page.getByRole('button', { name: '컴퓨터와 연습하기', exact: false }).click();
  await expect(page.locator('#practiceSection')).toBeVisible();
  await expect(page.locator('#practiceHome')).toHaveText('← 대기실로');
  await page.locator('#practiceForm button').click(); await page.locator('.intersection').nth(112).click();
  await expect(page.locator('.piece')).toHaveCount(2, { timeout: 10000 });
  await page.locator('#backHome').click(); await expect(page.locator('#myNickname')).toHaveText('용감한별');
  await expect(page.locator('li.participant-card')).toHaveCount(7);
  await page.getByRole('button', { name: '컴퓨터와 연습하기', exact: false }).click(); await page.locator('#practiceHome').click();
  await expect(page.locator('#myNickname')).toHaveText('용감한별');
  await page.getByRole('button', { name: '처음 화면', exact: false }).click();
  await page.locator('#startPractice').click(); await expect(page.locator('#practiceHome')).toHaveText('← 메인으로');
  await page.locator('#practiceHome').click(); await expect(page.locator('#landing')).toBeVisible();
});

test('preview role switch, rename current student, close room and local game isolation', async ({ page }) => {
  await create(page); await page.getByRole('button', { name: '학생 화면 체험 →' }).click();
  await page.locator('#studentNickname').fill('내닉네임'); await page.locator('#joinRoomForm button[type="submit"]').click();
  await page.getByRole('button', { name: '선생님 대기실로 돌아가기 →' }).click();
  await page.getByRole('button', { name: '내닉네임 관리' }).click(); await page.locator('#renameNickname').fill('바뀐닉네임');
  await page.getByRole('button', { name: '이름 변경하기' }).click();
  await page.getByRole('button', { name: '처음 화면', exact: false }).click(); await page.locator('#joinOnlineRoom').click();
  await expect(page.locator('#myNickname')).toHaveText('바뀐닉네임');
  await page.getByRole('button', { name: '선생님 대기실로 돌아가기 →' }).click();
  await page.getByRole('button', { name: '체험 방 닫기' }).click(); await page.locator('#confirmCloseRoom').click();
  await expect(page.locator('#onlineTitle')).toHaveText('체험 방이 닫혔어요');
  await page.getByRole('button', { name: '처음 화면', exact: false }).click(); await page.locator('#startLocal').click();
  await page.locator('.intersection').nth(112).click(); await page.locator('.intersection').nth(113).click();
  await expect(page.locator('.piece')).toHaveCount(2); await expect(page.locator('#turnText')).toHaveText('흑돌 차례');
  await page.locator('#backHome').click(); await expect(page.locator('#landing')).toBeVisible();
});

test('nickname markup is rendered as text and storage denial does not block preview', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('blocked'); } }); });
  await join(page, '<b>별</b>');
  await expect(page.locator('#myNickname')).toHaveText('<b>별</b>'); await expect(page.locator('#myNickname b')).toHaveCount(0);
  await expect(page.locator('.preview-footnote')).toContainText('초기화될 수 있어요');
});

for (const [width, height] of [[390,844],[768,1024],[1024,768],[1366,768]]) {
  test(`lobby screens fit ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height }); await create(page, 7);
    await page.getByRole('button', { name: '＋ 예시 학생 추가' }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/lobby-teacher-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: '학생 화면 체험 →' }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/lobby-join-${width}.png`, fullPage: true });
    await page.locator('#studentNickname').fill('우리반오목왕친구들'); await page.locator('#joinRoomForm button[type="submit"]').click();
    await expect(page.locator('#myNickname')).toHaveText('우리반오목왕친구들');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/lobby-student-${width}.png`, fullPage: true });
  });
}
