import {test,expect} from '@playwright/test';
const point=(page,r,c)=>page.locator('.intersection').nth(r*15+c);
async function practice(page,level='normal',color='1'){
  await page.goto('/');await page.locator('#startPractice').click();
  await page.locator(`input[value="${level}"]`).check();await page.locator(`input[name="color"][value="${color}"]`).check();
  await page.locator('#practiceForm button').click();
}
async function ready(page){await expect(page.locator('#turnText')).toContainText('내 차례',{timeout:10000});}

test('defaults, all difficulties and both colors use real module workers',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await page.locator('#startPractice').click();
  await expect(page.locator('input[value="normal"]')).toBeChecked();await expect(page.locator('input[name="color"][value="1"]')).toBeChecked();
  for(const level of ['easy','normal','hard'])for(const color of ['1','2']){
    let workerSeen=false;page.once('worker',()=>workerSeen=true);
    await practice(page,level,color);
    if(color==='1'){await point(page,7,7).click();await expect(page.locator('#turnText')).toContainText('생각 중');await expect(page.locator('.intersection:enabled')).toHaveCount(0);}
    else await expect(page.locator('#turnText')).toContainText('생각 중');
    await ready(page);expect(workerSeen).toBe(true);
    await expect(page.locator('.piece')).toHaveCount(color==='1'?2:1);
    await expect(page.locator('.piece.last')).toHaveCount(1);
    if(color==='2')await expect(point(page,7,7)).toHaveAttribute('aria-label','8행 8열: 흑돌');
  }
  expect(errors).toEqual([]);
});

test('undo/reset/home cancel pending AI and modes do not leak',async({page})=>{
  await practice(page,'hard');await point(page,7,7).click();await page.locator('#undoButton').click();
  await expect(page.locator('.piece')).toHaveCount(0);await page.waitForTimeout(1400);await expect(page.locator('.piece')).toHaveCount(0);
  await point(page,7,7).click();await ready(page);await page.locator('#undoButton').click();await expect(page.locator('.piece')).toHaveCount(0);
  await point(page,7,7).click();await page.locator('#resetButton').click();await page.waitForTimeout(1400);await expect(page.locator('.piece')).toHaveCount(0);
  await point(page,7,7).click();await page.locator('#backHome').click();await page.locator('#startLocal').click();
  await point(page,2,2).click();await page.waitForTimeout(1400);await expect(page.locator('.piece')).toHaveCount(1);await expect(page.locator('#turnText')).toHaveText('백돌 차례');
  await page.locator('#backHome').click();await practice(page,'normal','2');await ready(page);
  await point(page,3,3).click();await ready(page);await page.locator('#undoButton').click();
  await expect(page.locator('.piece')).toHaveCount(1);await expect(page.locator('#turnText')).toContainText('내 차례');
  await page.locator('#resetButton').click();await ready(page);await expect(page.locator('.piece')).toHaveCount(1);
});

test('local forbidden popup preserves turn; local winner, reset and home',async({page})=>{
  await page.goto('/');await page.locator('#startLocal').click();
  for(const [r,c] of [[7,6],[0,0],[7,8],[0,2],[6,7],[0,4],[8,7],[0,6]])await point(page,r,c).click();
  await point(page,7,7).click();await expect(page.locator('#gameEventTitle')).toContainText('3·3');
  await expect(page.locator('.piece')).toHaveCount(8);await page.getByRole('button',{name:'닫기',exact:true}).click();await expect(page.locator('#turnText')).toHaveText('흑돌 차례');
  await page.locator('#resetButton').click();
  for(const [r,c] of [[7,3],[0,0],[7,4],[0,2],[7,5],[0,4],[7,6],[0,6],[7,7]])await point(page,r,c).click();
  await expect(page.locator('#gameEventTitle')).toContainText('흑돌 승리');await expect(page.locator('.intersection:enabled')).toHaveCount(0);
  await page.locator('#gameEventActions').getByRole('button',{name:'새 게임',exact:true}).click();await expect(page.locator('.piece')).toHaveCount(0);
  await page.locator('#backHome').click();await expect(page.locator('#landing')).toBeVisible();
});

// Intercept only the worker entry point to produce repeatable end states;
// the real rule engine, UI and asynchronous lifecycle still execute.
async function scriptedPractice(page,computerMoves,color='1'){
  let i=0;
  await page.route('**/ai-worker.js',route=>route.fulfill({contentType:'text/javascript',body:`self.onmessage=()=>self.postMessage({move:${JSON.stringify(computerMoves[i++])}});`}));
  await practice(page,'normal',color);if(color==='2')await ready(page);
}

test('practice human victory popup restarts same settings',async({page})=>{
  await scriptedPractice(page,[{r:0,c:0},{r:0,c:2},{r:0,c:4},{r:0,c:6}]);
  for(const c of [3,4,5,6]){await point(page,7,c).click();await ready(page);}
  await point(page,7,7).click();await expect(page.locator('#gameEventTitle')).toContainText('내가 이겼어요');
  await page.locator('#gameEventActions').getByRole('button',{name:'새 게임'}).click();await expect(page.locator('.piece')).toHaveCount(0);await expect(page.locator('#gameTitle')).toHaveText('컴퓨터와 오목 연습');
});

test('practice computer victory popup returns home',async({page})=>{
  await scriptedPractice(page,[3,4,5,6,7].map(c=>({r:7,c})),'2');
  for(const c of [0,2,4,6]){await point(page,0,c).click();if(c!==6)await ready(page);}
  await expect(page.locator('#gameEventTitle')).toContainText('컴퓨터가 이겼어요');await page.locator('#gameEventActions').getByRole('button',{name:'처음 화면'}).click();await expect(page.locator('#landing')).toBeVisible();
});

test('worker failure uses a legal fallback and remains playable',async({page})=>{
  await page.route('**/ai-worker.js',route=>route.abort());await practice(page);await point(page,7,7).click();await ready(page);await expect(page.locator('.piece')).toHaveCount(2);
});

for(const [width,height] of [[390,844],[768,1024],[1024,768],[1366,768],[844,390]]){
  test(`viewport ${width}x${height}: setup and board fit, game page does not scroll`,async({page})=>{
    await page.setViewportSize({width,height});await page.goto('/');await page.locator('#startPractice').click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await expect(page.locator('#practiceForm button')).toBeVisible();
    await page.screenshot({path:`test-results/setup-${width}x${height}.png`,fullPage:true});
    await page.locator('#practiceForm button').click();
    const board=await page.locator('.board-wrap').boundingBox();expect(board.width).toBeGreaterThan(100);expect(Math.abs(board.width-board.height)).toBeLessThan(2);
    expect(board.x).toBeGreaterThanOrEqual(0);expect(board.x+board.width).toBeLessThanOrEqual(width);expect(board.y+board.height).toBeLessThanOrEqual(height);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.mouse.wheel(0,500);expect(await page.evaluate(()=>scrollY)).toBe(0);
    await expect(page.locator('#resetButton')).toBeInViewport();await expect(page.locator('#backHome')).toBeInViewport();
    await page.screenshot({path:`test-results/practice-${width}x${height}.png`,fullPage:true});
  });
}

test('full local board shows draw popup and new game',async({page})=>{
  await page.goto('/');await page.locator('#startLocal').click();
  await page.evaluate(()=>{
    const groups=[[],[]];
    for(let r=0;r<15;r++)for(let c=0;c<15;c++)groups[(Math.floor(c/2)+r)%2].push(r*15+c);
    for(let i=0;i<225;i++)document.querySelectorAll('.intersection')[groups[i%2].shift()].click();
  });
  await expect(page.locator('.piece')).toHaveCount(225);await expect(page.locator('#gameEventTitle')).toHaveText('무승부예요!');
  await page.locator('#gameEventActions').getByRole('button',{name:'새 게임'}).click();await expect(page.locator('.piece')).toHaveCount(0);
});

test('an already running worker is cancelled by undo and reset',async({page})=>{
  await page.route('**/ai-worker.js',route=>route.fulfill({contentType:'text/javascript',body:'self.onmessage=()=>setTimeout(()=>self.postMessage({move:{r:6,c:6}}),1200);'}));
  await practice(page,'hard');
  let started=page.waitForEvent('worker');await point(page,7,7).click();await started;await page.locator('#undoButton').click();
  await page.waitForTimeout(1600);await expect(page.locator('.piece')).toHaveCount(0);await expect(page.locator('#turnText')).toContainText('내 차례');
  started=page.waitForEvent('worker');await point(page,7,7).click();await started;await page.locator('#resetButton').click();
  await page.waitForTimeout(1600);await expect(page.locator('.piece')).toHaveCount(0);
});

test.describe('touch tablet',()=>{
  test.use({hasTouch:true,viewport:{width:768,height:1024}});
  test('touch places stones in practice and local games',async({page})=>{
    await practice(page,'easy');await point(page,7,7).tap();await ready(page);await expect(page.locator('.piece')).toHaveCount(2);
    await page.locator('#undoButton').tap();await expect(page.locator('.piece')).toHaveCount(0);
    await page.locator('#backHome').tap();await page.locator('#startLocal').tap();
    await point(page,7,7).tap();await point(page,7,8).tap();await expect(page.locator('.piece')).toHaveCount(2);
    await expect(page.locator('#turnText')).toHaveText('흑돌 차례');
  });
});
