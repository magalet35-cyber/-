// ==UserScript==
// @name         Crack Button Scroll — 크랙 입력창 버튼 가로 스크롤
// @namespace    crack-button-scroll
// @version      1.3.0
// @updateURL    https://raw.githubusercontent.com/magalet35-cyber/-/main/%ED%81%AC%EB%9E%99%20%EB%B2%84%ED%8A%BC%20%EC%8A%A4%ED%81%AC%EB%A1%A4.user.js
// @downloadURL  https://raw.githubusercontent.com/magalet35-cyber/-/main/%ED%81%AC%EB%9E%99%20%EB%B2%84%ED%8A%BC%20%EC%8A%A4%ED%81%AC%EB%A1%A4.user.js
// @description  새 UI 버튼 줄을 손가락으로 직접 좌우 이동. AI 변경 포함, 전송 버튼 고정.
// @match        https://wrtn.ai/*
// @match        https://*.wrtn.ai/*
// @match        https://crack.ai/*
// @match        https://*.crack.ai/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

/*
 * 설치: Tampermonkey → 새 스크립트 → 기존 내용을 전부 지우고 이 파일 전체 붙여넣기 → 저장.
 * 사용: 크랙 새로고침 후 입력창 아래 버튼 줄을 좌우로 밀기.
 * PC: 버튼 줄 위에서 마우스 휠 / 트랙패드 가로 스크롤.
 * 기존 버튼의 DOM 위치, 이벤트, 입력문, 다른 확프의 저장 데이터는 변경하지 않습니다.
 * 버튼을 복제하거나 다른 상자로 옮기지 않습니다. 숨김 버튼은 표시하지 않습니다.
 * 다른 확프가 버튼 자체를 삭제/재생성하는 현상까지 막는 기능은 아닙니다.
 */

(() => {
  'use strict';

  const INSTANCE = '__crackButtonScrollV1';
  if (window[INSTANCE]?.version === '1.3.0') return;
  window[INSTANCE]?.destroy?.();

  const EDITOR = '.__chat_input_textarea,textarea,[contenteditable="true"],[role="textbox"],[data-lexical-editor="true"],.ProseMirror';
  const CONTROL = 'button,[role="button"],input[type="button"],input[type="submit"],[aria-haspopup="menu"],[aria-haspopup="listbox"],[aria-haspopup="dialog"]';
  const POPUP = '[role="dialog"],[role="menu"],[role="listbox"],[role="tooltip"],[popover],[aria-modal="true"],[data-radix-popper-content-wrapper]';
  const EXCLUDE = `${POPUP},#wish-rp-root,#wish-rp-quick,#rpcm-ai-backdrop,#rpcm-ai-settings-backdrop,#cwa-host,#ai-trans-panel,#crack-ext-toolbar-fallback`;
  const STYLE_ID = 'crack-button-scroll-style-v1';
  const ROLE = 'data-cbs-role';
  const touched = new Map();
  const ordering = new WeakMap();
  const bound = new Map();
  const listeners = [];
  let currentInput = null;
  let currentRow = null;
  let frame = 0;
  let timer = 0;
  let destroyed = false;
  let notice = null;
  let noticed = false;
  let noticeTimer = 0;
  let touchDrag = null;
  let blockedClick = null;

  const css = `
    [data-cbs-role="row"] {
      display:flex !important;
      flex-direction:row !important;
      flex-wrap:nowrap !important;
      align-items:center !important;
      justify-content:flex-start !important;
      box-sizing:border-box !important;
      width:100% !important;
      min-width:0 !important;
      max-width:var(--cbs-limit,100%) !important;
      overflow-x:auto !important;
      overflow-y:hidden !important;
      overscroll-behavior-x:contain;
      -webkit-overflow-scrolling:touch;
      touch-action:pan-y pinch-zoom !important;
      scrollbar-width:thin;
      scrollbar-color:rgba(128,128,128,.35) transparent;
      scroll-behavior:auto !important;
      scroll-snap-type:none !important;
      isolation:isolate;
      gap:6px !important;
      padding-block:3px !important;
      padding-inline-end:6px !important;
      direction:ltr !important;
    }
    [data-cbs-role="row"]::-webkit-scrollbar { height:3px; }
    [data-cbs-role="row"]::-webkit-scrollbar-track { background:transparent; }
    [data-cbs-role="row"]::-webkit-scrollbar-thumb { background:rgba(128,128,128,.35); border-radius:6px; }
    [data-cbs-role="item"], [data-cbs-role="group"], [data-cbs-role="pin"], [data-cbs-role="spacer"] {
      flex:0 0 auto !important;
      flex-shrink:0 !important;
      order:var(--cbs-order,0) !important;
      white-space:nowrap !important;
      inset:auto !important;
      position:relative !important;
      margin-inline:0 !important;
      transform:none !important;
      translate:none !important;
    }
    [data-cbs-role="item"] {
      touch-action:pan-y pinch-zoom !important;
    }
    [data-cbs-role="item"]:not(button):not(input):not([role="button"]) {
      width:max-content !important;
      min-width:max-content !important;
      max-width:none !important;
      overflow:visible !important;
    }
    :where([data-cbs-role="group"]) { display:flex; }
    [data-cbs-role="group"] {
      flex-direction:row !important;
      flex-wrap:nowrap !important;
      align-items:center !important;
      justify-content:flex-start !important;
      width:max-content !important;
      min-width:max-content !important;
      max-width:none !important;
      overflow:visible !important;
      gap:6px !important;
      touch-action:pan-y pinch-zoom !important;
    }
    [data-cbs-role="contents"] {
      display:contents !important;
    }
    [data-cbs-model="true"] {
      flex:0 0 auto !important;
      width:max-content !important;
      min-width:max-content !important;
      max-width:none !important;
    }
    [data-cbs-model="true"] > span {
      flex-shrink:0 !important;
      min-width:max-content !important;
      max-width:none !important;
    }
    [data-cbs-role="pin"] {
      position:sticky !important;
      right:0 !important;
      inset-inline-end:0 !important;
      order:2147483647 !important;
      margin-inline-start:auto !important;
      z-index:4 !important;
      box-shadow:-6px 0 0 var(--cbs-surface,#fff);
      touch-action:manipulation !important;
    }
    [data-cbs-role="pin"]:not(button):not([role="button"]):not(input) {
      background-color:var(--cbs-surface,#fff) !important;
    }
    [data-cbs-role][hidden], [data-cbs-role][aria-hidden="true"],
    [data-cbs-role][style*="display: none"], [data-cbs-role][style*="display:none"] {
      display:none !important;
    }
  `;

  function remember(el) {
    if (!touched.has(el)) touched.set(el, { attrs:new Map(), vars:new Map() });
    return touched.get(el);
  }

  function attribute(el, name, value) {
    const saved = remember(el);
    if (!saved.attrs.has(name)) saved.attrs.set(name, el.getAttribute(name));
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  }

  function variable(el, name, value) {
    const saved = remember(el);
    if (!saved.vars.has(name)) saved.vars.set(name, [el.style.getPropertyValue(name),el.style.getPropertyPriority(name)]);
    if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name,value);
  }

  function restore(el) {
    const saved = touched.get(el);
    if (!saved) return;
    for (const [name,value] of saved.attrs) {
      if (value === null) el.removeAttribute(name); else el.setAttribute(name,value);
    }
    for (const [name,[value,priority]] of saved.vars) {
      if (value) el.style.setProperty(name,value,priority); else el.style.removeProperty(name);
    }
    touched.delete(el);
  }

  function visible(el) {
    if (!(el instanceof HTMLElement) || !el.isConnected || el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    // 옆으로 넘친 버튼도 후보에 포함한다. 화면 밖이라는 이유로 제외하지 않는다.
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
  }

  function controls(el) {
    return [...el.querySelectorAll(CONTROL)].filter(b => !b.closest(POPUP) && visible(b));
  }

  function hint(el) {
    return [el.getAttribute('aria-label'),el.getAttribute('title'),el.getAttribute('data-placeholder'),el.getAttribute('placeholder')].filter(Boolean).join(' ');
  }

  function findInput() {
    if (currentInput && visible(currentInput) && !currentInput.closest(EXCLUDE)) return currentInput;
    const viewportHeight = window.visualViewport?.height || innerHeight;
    const candidates = [...document.querySelectorAll(EDITOR)].filter(el => {
      if (!visible(el) || el.closest(EXCLUDE) || el.matches('[readonly],[disabled]')) return false;
      const r = el.getBoundingClientRect();
      return r.width > 70 && r.height > 12 && !/검색|search/i.test(hint(el))
        && (el.matches('.__chat_input_textarea') || /메시지\s*보내기|message|chat/i.test(hint(el)) || r.top > viewportHeight * .35);
    });
    candidates.sort((a,b) => {
      const score = el => (el.matches('.__chat_input_textarea') ? 10000 : 0)
        + (/메시지\s*보내기|message|chat/i.test(hint(el)) ? 3000 : 0) + el.getBoundingClientRect().top;
      return score(b)-score(a);
    });
    return candidates[0] || null;
  }

  function sendScore(button) {
    if (button.hasAttribute('data-crack-ui-empty-send-guard') || button.hasAttribute('data-crack-ui-empty-send-blocked')) return 120;
    const label = hint(button)+' '+button.id+' '+(button.textContent || '').trim();
    if (/추천\s*답변|recommend|wish|번역|translate|어시스턴트|모델|model|AI\s*(변경|선택)|채팅\s*AI|Gemini|Claude|GPT|Opus|Sonnet|페이블|하이퍼/i.test(label)
      || button.matches('[aria-haspopup]')) return 0;
    if (/전송|메시지\s*보내기|\bsend\b|응답\s*중지|생성\s*중지|^중지$|stop\s*(generat|respond)/i.test(hint(button))) return 100;
    const paths = [...button.querySelectorAll('svg path')].map(p => p.getAttribute('d') || '').join(' ');
    const primary = /bg-primary|text-primary-foreground/.test(String(button.className));
    if (primary && /M18\.77|M18\.38 12\.88|10\.27-5\.93|11\.86a1 1|6\.62 6\.63/.test(paths)) return 90;
    // 색상/submit 속성만으로는 번역·AI 선택 버튼과 구분할 수 없다.
    return 0;
  }

  function branch(parent,node) {
    let child = node;
    while (child && child.parentElement !== parent) child = child.parentElement;
    return child;
  }

  function findRow(input) {
    const exact = newLayout(input);
    if (exact) return exact.row;
    const ir = input.getBoundingClientRect();
    const candidates = new Set();
    let scope = input.parentElement;
    for (let depth=0;scope && depth<5 && scope !== document.body;depth++,scope=scope.parentElement) {
      const buttons = scope.querySelectorAll(CONTROL);
      if (buttons.length > 80) break;
      for (const button of buttons) {
        if (button.closest(EXCLUDE) || !visible(button)) continue;
        let row = button.parentElement;
        for (let level=0;row && scope.contains(row) && level<5;level++,row=row.parentElement) {
          if (row.contains(input)) break;
          if (row.matches(CONTROL) || row.closest(EXCLUDE)) continue;
          const r = row.getBoundingClientRect();
          if (r.height > 140 || r.height < 12 || r.top < ir.top-18 || r.top > ir.bottom+125) continue;
          const s = getComputedStyle(row);
          if (/flex|grid/.test(s.display) || row.getAttribute(ROLE) === 'row') candidates.add(row);
        }
      }
    }
    let best = null;
    let bestScore = -Infinity;
    for (const row of candidates) {
      const buttons = controls(row);
      const branches = new Set(buttons.map(b=>branch(row,b)));
      if (buttons.length < 2 || branches.size < 2) continue;
      const r = row.getBoundingClientRect();
      const send = buttons.some(b=>sendScore(b) >= 35);
      const recommend = buttons.some(b=>/추천\s*답변/.test(b.textContent || ''));
      const score = Math.min(buttons.length,20)*12 + (send ? 90 : 0) + (recommend ? 50 : 0)
        - Math.abs(r.top-ir.bottom)*.1;
      if (score > bestScore) { best=row; bestScore=score; }
    }
    return best;
  }

  // 진단으로 확인한 구조: 입력 상자 → 패딩 상자 → 좌우 flex 행.
  // 모델 선택+위시코어+전송이 있는 오른쪽 묶음을 행과 구분해서 잡는다.
  function newLayout(input) {
    let shell=input.parentElement;
    for(let depth=0;shell && depth<4;depth++,shell=shell.parentElement) {
      for(const area of shell.children) {
        if(area===input || area.contains(input) || area.matches(POPUP)) continue;
        for(const row of [area,...area.children]) {
          if(!row.classList.contains('flex') || !row.classList.contains('justify-between') || row.contains(input)) continue;
          const groups=[...row.children].filter(el=>el instanceof HTMLElement && (visible(el) || el.getAttribute(ROLE)==='contents'));
          const left=groups.find(el=>el.classList.contains('shrink-0') && el.querySelector(CONTROL));
          const right=groups.find(el=>el!==left && el.classList.contains('min-w-0') && el.querySelector(CONTROL));
          if(!left || !right) continue;
          const model=[...right.children].find(el=>el.matches(CONTROL) && el.hasAttribute('aria-haspopup'));
          if(!model) continue;
          const send=[...right.children].filter(el=>el.matches(CONTROL) && el!==model &&
            (sendScore(el)>=90 || el.classList.contains('bg-primary') && el.classList.contains('text-primary-foreground'))).pop();
          return {row,left,right,model,send};
        }
      }
    }
    return null;
  }

  function applicationNotice() {
    if(noticed) return;
    noticed=true;
    notice=document.createElement('div');
    notice.textContent='버튼 스크롤 적용됨 · 좌우로 밀어보세요';
    notice.setAttribute('role','status');
    notice.style.cssText='position:fixed;left:50%;top:90px;transform:translateX(-50%);max-width:90vw;padding:8px 12px;border-radius:9px;background:#222;color:#fff;font:12px sans-serif;z-index:2147483647;pointer-events:none;white-space:nowrap;';
    (document.body || document.documentElement).appendChild(notice);
    noticeTimer=setTimeout(()=>{notice?.remove();notice=null;},4000);
  }

  function safeWidth(row,input) {
    const ir = input.getBoundingClientRect();
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft || 0;
    const right = left+(viewport?.width || document.documentElement.clientWidth || innerWidth);
    // 버튼 줄이 넘쳐서 늘어나도 입력창과 공유하는 부모의 안쪽 너비로 제한한다.
    let parent = row.parentElement;
    let available = Math.max(100, Math.min(ir.width+32,right-Math.max(left,ir.left)-8));
    for (let i=0;parent && i<5;i++,parent=parent.parentElement) {
      if (!parent.contains(input)) continue;
      const r = parent.getBoundingClientRect();
      const s = getComputedStyle(parent);
      const content = r.width-(parseFloat(s.paddingLeft)||0)-(parseFloat(s.paddingRight)||0)
        -(parseFloat(s.borderLeftWidth)||0)-(parseFloat(s.borderRightWidth)||0);
      if (content > 70 && r.width <= right-left+2) available=Math.min(content,right-Math.max(left,r.left)-8);
      break;
    }
    const rr = row.getBoundingClientRect();
    return Math.max(70,Math.floor(Math.min(available,right-Math.max(left,rr.left)-8)));
  }

  function surface(row) {
    for (let el=row.parentElement;el;el=el.parentElement) {
      const color=getComputedStyle(el).backgroundColor;
      if (color !== 'transparent' && /^rgb\(/.test(color)) return color;
      if (/^rgba\([^)]*,\s*1\s*\)$/.test(color)) return color;
    }
    return document.documentElement.matches('.dark,[data-theme="dark"]') || getComputedStyle(document.documentElement).colorScheme === 'dark' ? '#18181b' : '#fff';
  }

  function stableOrder(parent,child) {
    let state=ordering.get(parent);
    if (!state) {state={nodes:new WeakMap(),keys:new Map(),next:1};ordering.set(parent,state);}
    if (state.nodes.has(child)) return state.nodes.get(child);
    const control=child.matches(CONTROL) ? child : child.querySelector(CONTROL);
    const identity=child.id || control?.id || (control ? hint(control) || control.querySelector('svg path')?.getAttribute('d') || (control.textContent||'').trim() : '');
    const key=identity ? child.tagName+':'+identity : '';
    let rank=key && state.keys.get(key);
    if (!rank) {rank=state.next++;if(key && state.keys.size<128)state.keys.set(key,rank);}
    state.nodes.set(child,rank);
    return rank;
  }

  function markChildren(parent,keep,pinned=null,depth=0) {
    if (depth>5) return;
    for (const child of parent.children) {
      if (!(child instanceof HTMLElement) || child.matches(POPUP) || child.closest(POPUP) || !visible(child)) continue;
      const isControl=child.matches(CONTROL);
      const buttons=isControl ? [child] : controls(child);
      if (!buttons.length || child.matches(EDITOR) || child.querySelector(EDITOR)) continue;
      // 실제 버튼 상자만 표시한다. 팝업/배지/아이콘은 수정하지 않는다.
      keep.add(child);
      // 모델명+화살표 등 하나의 선택 위젯은 내부 레이아웃을 유지한다.
      const grouped = !isControl && buttons.length > 1;
      attribute(child,ROLE,child===pinned ? 'pin' : grouped ? 'group' : 'item');
      variable(child,'--cbs-order',String(stableOrder(parent,child)));
      if (grouped) markChildren(child,keep,null,depth+1);
    }
  }

  function listen(el,type,fn,options) {
    el.addEventListener(type,fn,options);
    (bound.get(el) || listeners).push(()=>el.removeEventListener(type,fn,options));
  }

  function touchStart(event) {
    touchDrag=null;
    blockedClick=null;
    const row=currentRow;
    const target=event.target;
    if(!row || !(target instanceof Element) || !row.contains(target) || target.closest(POPUP)
      || event.touches.length!==1 || row.scrollWidth<=row.clientWidth+2) return;
    const point=event.touches[0];
    touchDrag={row,id:point.identifier,x:point.clientX,y:point.clientY,scroll:row.scrollLeft,axis:null,moved:false};
  }

  function touchMove(event) {
    const drag=touchDrag;
    if(!drag) return;
    if(event.touches.length!==1 || !drag.row.isConnected || drag.row!==currentRow) {touchDrag=null;return;}
    const point=[...event.touches].find(p=>p.identifier===drag.id);
    if(!point) return;
    const dx=point.clientX-drag.x,dy=point.clientY-drag.y;
    if(!drag.axis) {
      if(Math.max(Math.abs(dx),Math.abs(dy))<7) return;
      if(Math.abs(dy)>Math.abs(dx)) {touchDrag=null;return;}
      drag.axis='x';
    }
    drag.row.scrollLeft=Math.max(0,Math.min(drag.row.scrollWidth-drag.row.clientWidth,drag.scroll-dx));
    drag.moved=true;
    // 기본 스크롤 또는 페이지의 가로 제스처와 중복 실행하지 않는다.
    if(event.cancelable) event.preventDefault();
    event.stopPropagation();
  }

  function touchEnd() {
    if(touchDrag?.moved) blockedClick={row:touchDrag.row,until:Date.now()+650};
    touchDrag=null;
  }

  function touchClick(event) {
    const block=blockedClick;
    if(!block) return;
    if(Date.now()>block.until) {blockedClick=null;return;}
    if(event.detail===0 || !(event.target instanceof Element) || !block.row.contains(event.target)) return;
    // 밀던 손가락을 뗄 때 버튼(특히 전송)이 눌리는 것을 막는다.
    event.preventDefault();event.stopImmediatePropagation();blockedClick=null;
  }

  function bindRow(row) {
    if (bound.has(row)) return;
    bound.set(row,[]);
    listen(row,'wheel',event=>{
      if (row !== currentRow || event.ctrlKey || row.scrollWidth <= row.clientWidth+2 || event.defaultPrevented) return;
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      let delta=event.deltaY;
      if (event.deltaMode===1) delta*=20;
      if (event.deltaMode===2) delta*=row.clientWidth;
      const before=row.scrollLeft;
      row.scrollLeft+=delta;
      if (Math.abs(row.scrollLeft-before)>.5) event.preventDefault();
    },{passive:false});
    listen(row,'keydown',event=>{
      if (event.target !== row || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      if (row.scrollWidth <= row.clientWidth+2) return;
      event.preventDefault();
      if (event.key==='Home') row.scrollLeft=0;
      else if (event.key==='End') row.scrollLeft=row.scrollWidth;
      else row.scrollLeft+=(event.key==='ArrowLeft' ? -80 : 80);
    });
    listen(row,'focusin',event=>{
      const target=event.target;
      if (!(target instanceof HTMLElement) || target.closest('[data-cbs-role="pin"]')) return;
      const r=target.getBoundingClientRect();
      const rr=row.getBoundingClientRect();
      const pin=row.querySelector('[data-cbs-role="pin"]');
      const end=pin ? pin.getBoundingClientRect().left-6 : rr.right-4;
      if (r.left<rr.left+4) row.scrollLeft-=rr.left+4-r.left;
      else if (r.right>end) row.scrollLeft+=r.right-end;
    });
  }

  function refresh() {
    if (destroyed) return;
    const input=findInput();
    const row=input ? findRow(input) : null;
    const keep=new Set();
    currentInput=input;
    currentRow=row;
    for (const [old,removers] of bound) if (old!==row) {
      removers.forEach(remove=>remove());
      bound.delete(old);
    }
    if (row) {
      const layout=newLayout(input);
      const buttons=controls(row);
      const send=buttons.map(b=>({button:b,score:sendScore(b)})).filter(b=>b.score>=90)
        .sort((a,b)=>b.score-a.score || b.button.getBoundingClientRect().right-a.button.getBoundingClientRect().right)[0]?.button;
      const sendBranch=send ? branch(row,send) : null;
      // send가 복잡한 도구 상자 안에 있으면 그 상자 전체를 고정하지 않는다.
      const pin=sendBranch && (sendBranch===send || controls(sendBranch).length<=2 && sendBranch.getBoundingClientRect().width<=110) ? sendBranch : null;
      keep.add(row);
      attribute(row,ROLE,'row');
      variable(row,'--cbs-limit',safeWidth(row,input)+'px');
      variable(row,'--cbs-surface',surface(row));
      markChildren(row,keep,pin);
      if(layout?.row===row) {
        // display:contents로 오른쪽 묶음의 경계만 없앤다. 버튼 DOM/이벤트는 그대로 둔다.
        keep.add(layout.right);
        attribute(layout.right,ROLE,'contents');
        markChildren(layout.right,keep,layout.send);
        attribute(layout.model,'data-cbs-model','true');
        for(const child of layout.right.children) {
          if(!(child instanceof HTMLElement) || !visible(child) || child.matches(POPUP)) continue;
          keep.add(child);
          const nested=controls(child).length;
          attribute(child,ROLE,child===layout.send ? 'pin' : child.matches(CONTROL) ? 'item' : nested>1 ? 'group' : nested ? 'item' : 'spacer');
          variable(child,'--cbs-order',String(stableOrder(row,child)));
        }
      }
      if (!row.hasAttribute('tabindex')) attribute(row,'tabindex','0');
      bindRow(row);
      applicationNotice();
    }
    for (const el of [...touched.keys()]) if (!keep.has(el)) restore(el);
  }

  function schedule() {
    if (destroyed || timer || frame) return;
    timer=setTimeout(()=>{
      timer=0;
      frame=requestAnimationFrame(()=>{frame=0;refresh();});
    },100);
  }

  const observer=new MutationObserver(records=>{
    if (records.some(record=>{
      const target=record.target;
      if (!(target instanceof Element) || target.id===STYLE_ID || target.closest(EXCLUDE)) return false;
      if (currentRow && (target===currentRow || currentRow.contains(target))) return true;
      if (record.type==='attributes') return target===currentInput || !!target.querySelector(EDITOR);
      return [...record.addedNodes,...record.removedNodes].some(node=>node instanceof Element &&
        (node===currentInput || node===currentRow || node.matches(EDITOR+','+CONTROL) || node.querySelector(EDITOR+','+CONTROL)));
    })) schedule();
  });

  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=css;
  (document.head || document.documentElement).appendChild(style);
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden','aria-hidden','aria-label']});
  listen(window,'resize',schedule,{passive:true});
  listen(document,'touchstart',touchStart,{capture:true,passive:true});
  listen(document,'touchmove',touchMove,{capture:true,passive:false});
  listen(document,'touchend',touchEnd,{capture:true,passive:true});
  listen(document,'touchcancel',touchEnd,{capture:true,passive:true});
  listen(document,'click',touchClick,{capture:true});
  if (window.visualViewport) listen(window.visualViewport,'resize',schedule,{passive:true});
  // SPA 화면 전환, 뒤늦게 실행되는 확프, style만 바꾸는 확프를 위한 저빈도 보조 확인.
  const poll=setInterval(()=>{if(!document.hidden)schedule();},1800);
  window[INSTANCE]={version:'1.3.0',refresh:schedule,destroy(){
    destroyed=true;
    observer.disconnect();
    clearInterval(poll);
    clearTimeout(timer);
    clearTimeout(noticeTimer);
    notice?.remove();
    touchDrag=null;blockedClick=null;
    cancelAnimationFrame(frame);
    listeners.forEach(remove=>remove());
    for (const removers of bound.values()) removers.forEach(remove=>remove());
    bound.clear();
    for (const el of [...touched.keys()]) restore(el);
    style.remove();
    delete window[INSTANCE];
  }};
  refresh();
})();
