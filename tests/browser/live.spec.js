import {test,expect} from '@playwright/test';
test.skip(!process.env.LIVE_TEST_SERVER,'Requires the real local Cloudflare runtime.');
const origin='http://127.0.0.1:8080';
async function pageFor(browser,role){const context=await browser.newContext({baseURL:origin});await context.route('**/live/config.js',route=>route.fulfill({contentType:'text/javascript',body:"export const API_BASE='http://127.0.0.1:8787';"}));const page=await context.newPage();await page.goto(`/?online=1&role=${role}`);return{context,page};}
async function room(browser){const teacher=await pageFor(browser,'teacher');await teacher.page.getByRole('button',{name:'실제 방 만들기',exact:true}).click();await expect(teacher.page.locator('#liveRoomCode')).toHaveText(/^\d{4}$/);const code=await teacher.page.locator('#liveRoomCode').innerText();return{teacher,code};}
async function join(browser,code,name){const student=await pageFor(browser,'student');await student.page.locator('#liveCode').fill(code);await student.page.locator('#liveNickname').fill(name);await student.page.getByRole('button',{name:'실제 방 참가하기'}).click();await expect(student.page.locator('#liveRoomCode')).toHaveText(code);return student;}
async function cleanup(...users){for(const u of users)await u.context.close();}
const point=(p,r,c)=>p.locator('#liveBoard .intersection').nth(r*15+c);

test('three isolated browsers play, preserve anonymous names and restore after reload',async({browser})=>{
  const {teacher,code}=await room(browser),a=await join(browser,code,'바다학생'),b=await join(browser,code,'구름학생');
  await teacher.page.locator('#liveStart').click();await expect(a.page.locator('#liveBoard')).toBeVisible();await expect(b.page.locator('#liveBoard')).toBeVisible();
  await expect(a.page.locator('#onlineSection')).not.toContainText('구름학생');await expect(b.page.locator('#onlineSection')).not.toContainText('바다학생');
  const black=await a.page.locator('#liveTurn').innerText()==='내 차례'?a:b,white=black===a?b:a;
  await point(black.page,7,3).click();await expect(white.page.locator('#liveBoard .piece')).toHaveCount(1);
  await white.page.reload();await expect(white.page.locator('#liveBoard .piece')).toHaveCount(1);await expect(white.page.locator('#liveTurn')).toHaveText('내 차례');
  for(let i=0;i<4;i++){
    await point(white.page,0,i*2).click();await expect(black.page.locator('#liveTurn')).toHaveText('내 차례');
    await point(black.page,7,4+i).click();if(i<3)await expect(white.page.locator('#liveTurn')).toHaveText('내 차례');
  }
  await expect(black.page.locator('.live-result')).toContainText('내가 이겼어요');await expect(white.page.locator('.live-result')).toContainText('상대가 이겼어요');
  await expect(black.page.locator('.live-result')).toContainText('2점');await expect(white.page.locator('.live-result')).toContainText('바다학생');await expect(white.page.locator('.live-result')).toContainText('구름학생');
  await teacher.page.screenshot({path:'test-results/live-teacher-result.png',fullPage:true});
  await cleanup(teacher,a,b);
});
test('teacher start interrupts real AI practice and mobile board stays inside viewport',async({browser})=>{
  const {teacher,code}=await room(browser),a=await join(browser,code,'연습학생'),b=await join(browser,code,'대기학생');
  await a.page.setViewportSize({width:390,height:844});await a.page.getByRole('button',{name:'컴퓨터와 연습하기',exact:true}).click();await expect(a.page.locator('#practiceSection')).toBeVisible();
  await a.page.locator('#practiceForm button').click();await a.page.locator('.intersection').nth(112).click();
  await teacher.page.locator('#liveStart').click();await expect(a.page.locator('#liveBoard')).toBeVisible();await expect(a.page.locator('#gameSection')).toBeHidden();
  const board=await a.page.locator('#liveBoard').boundingBox();expect(board.width).toBeGreaterThan(200);expect(board.x).toBeGreaterThanOrEqual(0);expect(board.x+board.width).toBeLessThanOrEqual(390);expect(board.y+board.height).toBeLessThanOrEqual(844);
  await a.page.mouse.wheel(0,500);expect(await a.page.evaluate(()=>scrollY)).toBe(0);
  await a.page.screenshot({path:'test-results/live-mobile-game.png',fullPage:true});
  await a.context.setOffline(true);await expect(a.page.locator('#liveConnection')).toContainText('다시 연결');
  await a.context.setOffline(false);await expect(a.page.locator('#liveConnection')).toContainText('연결됨');await expect(a.page.locator('#liveBoard')).toBeVisible();
  await teacher.page.getByRole('button',{name:'현재 경기 무승부로 종료'}).click();await teacher.page.locator('#liveConfirm').click();await expect(a.page.locator('.live-result')).toContainText('무승부');
  await teacher.page.locator('#liveStart').click();await expect(a.page.locator('#liveTurn')).toBeVisible();
  await cleanup(teacher,a,b);
});
test('bad code, duplicate names and teacher kick propagate over real server',async({browser})=>{
  const {teacher,code}=await room(browser),a=await join(browser,code,'관리학생');
  const b=await pageFor(browser,'student');await b.page.locator('#liveCode').fill(code);await b.page.locator('#liveNickname').fill('관리학생');await b.page.getByRole('button',{name:'실제 방 참가하기'}).click();await expect(b.page.locator('#liveError')).toContainText('같은 닉네임');
  await teacher.page.getByRole('button',{name:'관리학생 관리'}).click();await teacher.page.locator('#liveRename').fill('바뀐학생');await teacher.page.getByRole('button',{name:'이름 변경',exact:true}).click();await expect(a.page.locator('#onlineTitle')).toContainText('바뀐학생');
  await teacher.page.getByRole('button',{name:'바뀐학생 관리'}).click();await teacher.page.locator('#liveKick').click();await teacher.page.locator('#liveKickConfirm').click();await expect(a.page.locator('#liveConnection')).toContainText('참가 권한이 종료');
  await cleanup(teacher,a,b);
});


test('five students play two games with a bye, private lists and teacher-controlled progression',async({browser})=>{
  const {teacher,code}=await room(browser),students=[];
  try{
    for(let i=0;i<5;i++)students.push(await join(browser,code,`동시학생${i}`));
    await teacher.page.locator('#liveStart').click();
    await expect(teacher.page.locator('.live-match-row')).toHaveCount(3);
    const groups=new Map();let firstBye=-1;
    for(let i=0;i<students.length;i++){
      const p=students[i].page;await expect(p.locator('.live-match-row.is-mine')).toHaveCount(1);
      if(await p.locator('.live-result').count()){await expect(p.locator('.live-result')).toContainText('부전승');firstBye=i;continue;}
      const id=await p.locator('.live-match-row.is-mine').getAttribute('data-match');if(!groups.has(id))groups.set(id,[]);groups.get(id).push(students[i]);
      await expect(p.locator('#liveBoard')).toBeVisible();await expect(p.locator('.live-my-color')).toHaveCount(1);
      await expect(p.locator('.board-caption')).toHaveText('마지막 수는 빨간색으로 표시돼요.');
      for(let j=0;j<students.length;j++)await expect(p.locator('.live-match-row').filter({hasText:'진행 중'})).not.toContainText([`동시학생${j}`]);
    }
    expect(firstBye).toBeGreaterThanOrEqual(0);expect(groups.size).toBe(2);
    const [pair,other]=[...groups.values()];const black=(await pair[0].page.locator('#liveTurn').innerText())==='내 차례'?pair[0]:pair[1],white=black===pair[0]?pair[1]:pair[0];
    await point(black.page,7,3).click();await expect(white.page.locator('#liveBoard .piece')).toHaveCount(1);await expect(other[0].page.locator('#liveBoard .piece')).toHaveCount(0);
    await other[0].page.reload();await expect(other[0].page.locator('#liveBoard .piece')).toHaveCount(0);
    for(let i=0;i<4;i++){await point(white.page,0,i*2).click();await expect(black.page.locator('#liveTurn')).toHaveText('내 차례');await point(black.page,7,4+i).click();if(i<3)await expect(white.page.locator('#liveTurn')).toHaveText('내 차례');}
    await expect(black.page.locator('.live-result')).toContainText('내가 이겼어요');await expect(teacher.page.locator('.lobby-heading')).toContainText('3 / 5명');await expect(teacher.page.locator('#liveStart')).toHaveCount(0);
    for(const u of other){const ownName=await u.page.locator('#onlineTitle').innerText();expect(ownName).toContain('상대와');}
    await teacher.page.screenshot({path:'test-results/multi-teacher-progress.png',fullPage:true});
    await other[0].page.setViewportSize({width:390,height:844});const board=await other[0].page.locator('#liveBoard').boundingBox();expect(board.x+board.width).toBeLessThanOrEqual(390);expect(board.y+board.height).toBeLessThanOrEqual(844);
    await other[0].page.screenshot({path:'test-results/multi-student-mobile.png',fullPage:true});
    await other[0].page.setViewportSize({width:1024,height:768});const tablet=await other[0].page.locator('#liveBoard').boundingBox();expect(tablet.x+tablet.width).toBeLessThanOrEqual(1024);expect(tablet.y+tablet.height).toBeLessThanOrEqual(768);
    await other[0].page.screenshot({path:'test-results/multi-student-tablet.png',fullPage:true});
    await teacher.page.getByRole('button',{name:/^경기 [0-9]+ 무승부 종료$/}).click();await teacher.page.locator('#liveConfirm').click();await expect(teacher.page.locator('#liveStart')).toBeEnabled();
    await teacher.page.locator('#liveStart').click();await expect(students[firstBye].page.locator('#liveBoard')).toBeVisible();await expect(students[firstBye].page.locator('.live-result')).toHaveCount(0);
  }finally{await cleanup(teacher,...students);}
});
test('a late student can practice during other games and joins the next round automatically',async({browser})=>{
 const {teacher,code}=await room(browser),students=[];let late;
 try{
  for(let i=0;i<4;i++)students.push(await join(browser,code,`먼저학생${i}`));await teacher.page.locator('#liveStart').click();await expect(students[0].page.locator('#liveBoard')).toBeVisible();
  late=await join(browser,code,'나중학생');await expect(late.page.locator('.live-wait-notice')).toContainText('다음 라운드부터');await expect(late.page.locator('#liveBoard')).toHaveCount(0);
  await late.page.getByRole('button',{name:'컴퓨터와 연습하기',exact:true}).click();await expect(late.page.locator('#practiceSection')).toBeVisible();
  await teacher.page.getByRole('button',{name:'진행 중인 경기 모두 무승부로 종료',exact:true}).click();await teacher.page.locator('#liveConfirm').click();await teacher.page.locator('#liveStart').click();
  // A low-score newcomer may receive the bye, which is still participation.
  await expect(late.page.locator('#practiceSection')).toBeVisible();
  await late.page.locator('#practiceHome').click();await expect(late.page.locator('.live-result')).toContainText('부전승');
 }finally{await cleanup(teacher,...students,...(late?[late]:[]));}
});
