// ==UserScript==
// @name         Crack Button Scroll — 크랙 입력창 버튼 가로 스크롤
// @namespace    crack-button-scroll
// @version      1.0.0
// @description  입력창 버튼이 넘치면 가로 스크롤. 버튼 크기·배치 안정화, 전송 버튼 고정. 화면 크기 제한 없음.
// @match        https://crack.wrtn.ai/*
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
  if (window[INSTANCE]) return;

  const EDITOR = '.__chat_input_textarea,textarea,[contenteditable="true"],[role="textbox"],[data-lexical-editor="true"],.ProseMirror';
  const CONTROL = 'button,[role="button"],input[type="button"],input[type="submit"]';
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
      touch-action:pan-x pinch-zoom;
      scrollbar-width:thin;
      scrollbar-color:rgba(128,128,128,.35) transparent;
      scroll-behavior:auto !important;
      scroll-snap-type:none !important;
      isolation:isolate;
      gap:6px !important;
      padding-block:3px !important;
    }
    [data-cbs-role="row"]::-webkit-scrollbar { height:3px; }
    [data-cbs-role="row"]::-webkit-scrollbar-track { background:transparent; }
    [data-cbs-role="row"]::-webkit-scrollbar-thumb { background:rgba(128,128,128,.35); border-radius:6px; }
    [data-cbs-role="item"], [data-cbs-role="group"], [data-cbs-role="pin"] {
      flex:0 0 auto !important;
      flex-shrink:0 !important;
      order:var(--cbs-order,0) !important;
      white-space:nowrap !important;
      inset:auto !important;
      position:relative !important;
      margin-inline:0 !important;
    }
    [data-cbs-role="item"] {
      touch-action:pan-x pinch-zoom !important;
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
      touch-action:pan-x pinch-zoom !important;
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
    if (/추천\s*답변|recommend|wish|번역|translate|어시스턴트/i.test(hint(button)+' '+button.id)) return 0;
    if (/전송|메시지\s*보내기|send\s*(message)?|응답\s*중지|생성\s*중지|중지|stop\s*(generat|respond)/i.test(hint(button))) return 100;
    if (button.matches('input[type="submit"],button[type="submit"]')) return 70;
    const paths = [...button.querySelectorAll('svg path')].map(p => p.getAttribute('d') || '').join(' ');
    const primary = /bg-primary|text-primary-foreground/.test(String(button.className));
    if (primary && /M18\.77|M18\.38 12\.88|10\.27-5\.93|11\.86a1 1|6\.62 6\.63/.test(paths)) return 90;
    // aria-label이 없는 새 UI: 색상 있는 우측 아이콘 버튼만 보조 후보로 사용.
    const bg = getComputedStyle(button).backgroundColor;
    const rgb = bg.match(/rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/);
    const colored = rgb && Math.max(...rgb.slice(1).map(Number))-Math.min(...rgb.slice(1).map(Number)) > 65;
    const text = (button.textContent || '').trim();
    return (primary || colored) && button.querySelector('svg') && !text && !button.id ? 35 : 0;
  }

  function branch(parent,node) {
    let child = node;
    while (child && child.parentElement !== parent) child = child.parentElement;
    return child;
  }

  function findRow(input) {
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
      attribute(child,ROLE,child===pinned ? 'pin' : isControl ? 'item' : 'group');
      variable(child,'--cbs-order',String(stableOrder(parent,child)));
      if (!isControl) markChildren(child,keep,null,depth+1);
    }
  }

  function listen(el,type,fn,options) {
    el.addEventListener(type,fn,options);
    (bound.get(el) || listeners).push(()=>el.removeEventListener(type,fn,options));
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
      const buttons=controls(row);
      const send=buttons.map(b=>({button:b,score:sendScore(b)})).filter(b=>b.score>0)
        .sort((a,b)=>b.score-a.score || b.button.getBoundingClientRect().right-a.button.getBoundingClientRect().right)[0]?.button;
      const sendBranch=send ? branch(row,send) : null;
      // send가 복잡한 도구 상자 안에 있으면 그 상자 전체를 고정하지 않는다.
      const pin=sendBranch && (sendBranch===send || controls(sendBranch).length<=2 && sendBranch.getBoundingClientRect().width<=110) ? sendBranch : null;
      keep.add(row);
      attribute(row,ROLE,'row');
      variable(row,'--cbs-limit',safeWidth(row,input)+'px');
      variable(row,'--cbs-surface',surface(row));
      markChildren(row,keep,pin);
      if (!row.hasAttribute('tabindex')) attribute(row,'tabindex','0');
      bindRow(row);
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
      if (record.type==='attributes') return target===currentInput;
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
  if (window.visualViewport) listen(window.visualViewport,'resize',schedule,{passive:true});
  // SPA 화면 전환, 뒤늦게 실행되는 확프, style만 바꾸는 확프를 위한 저빈도 보조 확인.
  const poll=setInterval(()=>{if(!document.hidden)schedule();},1800);
  window[INSTANCE]={version:'1.0.0',refresh:schedule,destroy(){
    destroyed=true;
    observer.disconnect();
    clearInterval(poll);
    clearTimeout(timer);
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
