import qrcode from './vendor/qrcode.js';

// Start with a clean student URL; never share teacher credentials or other query parameters.
export function studentInviteURL(pageURL,code){
  if(!/^\d{4}$/.test(String(code)))throw Error('방 코드를 확인해 주세요.');
  const page=new URL(pageURL),url=new URL(page.pathname,page.origin);
  url.searchParams.set('online','1');
  url.searchParams.set('role','student');
  url.searchParams.set('code',code);
  return url.href;
}

let cachedURL='',cachedSVG='';
export function inviteQrSVG(url){
  if(url!==cachedURL){
    const qr=qrcode(0,'M');
    qr.addData(url,'Byte');qr.make();
    // Four white modules around every edge keep the code easy to scan.
    cachedSVG=qr.createSvgTag({cellSize:4,margin:16,scalable:true});
    cachedURL=url;
  }
  return cachedSVG;
}
