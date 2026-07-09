// ==UserScript==
// @name         AI 캐릭터 맞춤 번역기
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  출력 형식 커스텀 + 목표 언어 확장 + 다크/라이트 자동 테마 UI (Scene Painter 호환)
// @match        https://crack.wrtn.ai/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      generativelanguage.googleapis.com
// ==/UserScript==

(function() {
    'use strict';

    // ===================================================================================
    // [상태 관리]
    // ===================================================================================
    const DEFAULT_FORMAT = '{번역문} ({원문})';

    let characters = JSON.parse(GM_getValue('AITrans_chars', '{}'));
    let settings = JSON.parse(GM_getValue('AITrans_settings',
        '{"provider":"google","apiKey":"","firebaseConfig":"","model":"gemini-3.5-flash","lang":"English","customLang":"","format":"' + DEFAULT_FORMAT.replace(/"/g, '\\"') + '","activeChar":""}'
    ));
    if (settings.format === undefined) settings.format = DEFAULT_FORMAT;
    if (settings.customLang === undefined) settings.customLang = '';

    function saveSettings() { GM_setValue('AITrans_settings', JSON.stringify(settings)); }
    function saveChars() { GM_setValue('AITrans_chars', JSON.stringify(characters)); }

    // ===================================================================================
    // [테마 감지] - Crack 다크/라이트 모드에 맞춰 UI 자동 전환
    // ===================================================================================
    function isDarkTheme() {
        const html = document.documentElement;
        const body = document.body;
        const hints = [
            html.getAttribute('data-theme'), html.getAttribute('data-color-mode'), html.className,
            body?.getAttribute('data-theme'), body?.getAttribute('data-color-mode'), body?.className
        ].join(' ').toLowerCase();

        if (/\bdark\b|theme-dark|dark-mode|darkmode|color-scheme-dark/.test(hints)) return true;
        if (/\blight\b|theme-light|light-mode|lightmode|color-scheme-light/.test(hints)) return false;

        // 텍스트 색 밝기로 판별 (Scene Painter와 같은 방식)
        try {
            const probe = document.createElement('span');
            probe.style.cssText = 'position:fixed;left:-9999px;color:var(--text_primary, var(--foreground, inherit));';
            document.documentElement.appendChild(probe);
            const rgb = getComputedStyle(probe).color.match(/\d+/g);
            probe.remove();
            if (rgb && rgb.length >= 3) {
                const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
                if (lum > 0.58) return true;
                if (lum < 0.42) return false;
            }
        } catch (e) {}

        return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches || false;
    }

    function applyAitTheme() {
        const theme = isDarkTheme() ? 'dark' : 'light';
        document.getElementById('ai-trans-panel')?.setAttribute('data-ait-theme', theme);
        document.getElementById('ai-trans-inline-group')?.setAttribute('data-ait-theme', theme);
    }

    function setReactValue(el, value) {
        if (el.isContentEditable) {
            el.innerText = value;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            return;
        }

        const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (setter) {
            setter.call(el, value);
        } else {
            el.value = value;
        }

        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));

        if(el.tagName === "TEXTAREA") {
            el.style.height = 'auto';
            el.style.height = el.scrollHeight + 'px';
        }
    }

    function toast(msg, type = "info") {
        const palette = { success:"#4ade80", warn:"#fbbf24", error:"#f87171", info:"#a5b4fc" };
        const el = document.createElement("div");
        el.textContent = msg;
        el.style.cssText = `
            position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
            z-index:999999; background:rgba(20,22,30,.94); color:#eceef6;
            padding:10px 16px; border-radius:10px; font-size:12px; font-weight:bold;
            border:1px solid rgba(205,216,255,.16); border-left:3px solid ${palette[type]||palette.info};
            box-shadow:0 8px 24px rgba(0,0,0,.4); transition:opacity .4s; white-space:nowrap;
            backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);
        `;
        document.body.appendChild(el);
        setTimeout(() => { el.style.opacity="0"; setTimeout(()=>el.remove(),400); }, 3000);
    }

    // ===================================================================================
    // [스타일 정의] - 다크(기본)/라이트 이중 테마
    // ===================================================================================
    GM_addStyle(`
        #ai-trans-inline-group { display: flex; align-items: center; gap: 5px; margin-right: 8px; }

        /* 인라인 버튼: Crack 하단 툴바의 둥근 아이콘 버튼과 통일 */
        .trans-action-btn, .trans-setting-btn {
            height: 2rem; width: 2rem; border-radius: 999px; padding: 0;
            font-size: 14px; cursor: pointer; transition: background .15s ease, transform .15s ease;
            display: flex; align-items: center; justify-content: center;
            box-shadow: none;
        }
        /* 다크 (기본) */
        .trans-action-btn {
            background: rgba(255,255,255,.09); color: #e8ecf5;
            border: 1px solid rgba(255,255,255,.10);
        }
        .trans-action-btn:hover { background: rgba(255,255,255,.16); transform: translateY(-1px); }
        .trans-action-btn:disabled { background: rgba(255,255,255,.05); color: rgba(255,255,255,.35); cursor: not-allowed; transform: none; }
        .trans-setting-btn {
            background: rgba(255,255,255,.06); color: #b9c0d0;
            border: 1px solid rgba(255,255,255,.08); font-size: 12px;
        }
        .trans-setting-btn:hover { background: rgba(255,255,255,.13); color: #eceef6; }

        /* 라이트 */
        [data-ait-theme="light"] .trans-action-btn {
            background: #f0f0f3; color: #444; border: 1px solid #dcdce2;
        }
        [data-ait-theme="light"] .trans-action-btn:hover { background: #e5e5ea; }
        [data-ait-theme="light"] .trans-setting-btn {
            background: #f7f7fa; color: #777; border: 1px solid #e2e2e8;
        }
        [data-ait-theme="light"] .trans-setting-btn:hover { background: #ececf1; color: #444; }

        /* ===== 설정 패널 ===== */
        #ai-trans-panel {
            position: fixed; top: 10vh; left: 5vw; z-index: 999999;
            width: 90vw; max-width: 330px;
            border-radius: 16px; display: none; flex-direction: column; overflow: hidden;
            font-family: Pretendard, system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif;
            /* 다크 글라스 (기본) */
            background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.015)), rgba(20,22,31,.92);
            border: 1px solid rgba(205,216,255,.20); color: #e8ecf5;
            box-shadow: 0 20px 60px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.09);
            backdrop-filter: blur(16px) saturate(1.1); -webkit-backdrop-filter: blur(16px) saturate(1.1);
        }
        #ai-trans-panel[data-ait-theme="light"] {
            background: #ffffff; border: 1px solid #ddd; color: #333;
            box-shadow: 0 10px 30px rgba(0,0,0,.22);
            backdrop-filter: none; -webkit-backdrop-filter: none;
        }

        .ai-panel-header {
            padding: 11px 14px; display: flex; justify-content: space-between; cursor: move;
            font-weight: 800; font-size: 13px; user-select: none;
            background: rgba(255,255,255,.04); border-bottom: 1px solid rgba(205,216,255,.13); color: inherit;
        }
        #ai-trans-panel[data-ait-theme="light"] .ai-panel-header { background: #f6f6f9; border-bottom-color: #e7e7ec; }
        .ai-panel-close { cursor: pointer; color: #f87171; padding: 0 5px; font-weight: 400; }

        .ai-tabs { display: flex; gap: 4px; padding: 8px 10px 0; }
        .ai-tab {
            flex: 1; padding: 7px 0; text-align: center; cursor: pointer; font-size: 12px; font-weight: 700;
            color: rgba(226,232,248,.62); border-radius: 9px; transition: background .15s ease;
        }
        .ai-tab:hover { background: rgba(255,255,255,.06); }
        .ai-tab.active { background: rgba(255,255,255,.10); color: #fff; box-shadow: inset 0 0 0 1px rgba(205,216,255,.22); }
        #ai-trans-panel[data-ait-theme="light"] .ai-tab { color: #888; }
        #ai-trans-panel[data-ait-theme="light"] .ai-tab:hover { background: #f1f1f5; }
        #ai-trans-panel[data-ait-theme="light"] .ai-tab.active { background: #f1eefb; color: #5a43b5; box-shadow: inset 0 0 0 1px #d8cff2; }

        .ai-content { padding: 12px; display: none; max-height: 62vh; overflow-y: auto; }
        .ai-content::-webkit-scrollbar { width: 4px; }
        .ai-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,.18); border-radius: 4px; }
        #ai-trans-panel[data-ait-theme="light"] .ai-content::-webkit-scrollbar-thumb { background: #ccc; }
        .ai-content.active { display: block; }

        .ai-form-group { margin-bottom: 9px; }
        .ai-form-group label { display: block; font-size: 11px; margin-bottom: 4px; font-weight: 700; color: rgba(226,232,248,.72); }
        #ai-trans-panel[data-ait-theme="light"] .ai-form-group label { color: #555; }

        .ai-input {
            width: 100%; padding: 7px 9px; box-sizing: border-box; font-size: 12px; outline: none;
            border-radius: 8px; background: rgba(255,255,255,.07); color: #eceef6;
            border: 1px solid rgba(205,216,255,.16); transition: border-color .15s ease;
        }
        .ai-input:focus { border-color: rgba(165,180,252,.60); background: rgba(255,255,255,.10); }
        .ai-input::placeholder { color: rgba(226,232,248,.38); }
        select.ai-input option { color: #111; background: #fff; }
        #ai-trans-panel[data-ait-theme="light"] .ai-input {
            background: #fff; color: #333; border: 1px solid #d6d6dd;
        }
        #ai-trans-panel[data-ait-theme="light"] .ai-input:focus { border-color: #8a72d8; }
        textarea.ai-input { resize: vertical; min-height: 50px; }
        #cfg-firebase { min-height: 70px; font-family: ui-monospace, monospace; font-size: 11px; white-space: pre-wrap; }
        #cfg-format { min-height: 40px; font-family: ui-monospace, monospace; font-size: 12px; }

        .ai-hint { margin-top: 5px; font-size: 10.5px; line-height: 1.5; color: rgba(226,232,248,.52); }
        #ai-trans-panel[data-ait-theme="light"] .ai-hint { color: #888; }
        .ai-hint code {
            padding: 1px 5px; border-radius: 5px; font-size: 10px;
            background: rgba(255,255,255,.10); border: 1px solid rgba(205,216,255,.14); color: #cfd8ff;
        }
        #ai-trans-panel[data-ait-theme="light"] .ai-hint code { background: #f0eefa; border-color: #e0daf0; color: #5a43b5; }

        .ai-btn-full {
            width: 100%; border: 1px solid rgba(165,180,252,.34); padding: 9px; border-radius: 10px;
            cursor: pointer; font-weight: 800; margin-top: 6px; font-size: 12px;
            background: linear-gradient(180deg, rgba(129,140,248,.30), rgba(106,90,232,.24)); color: #eef0ff;
            transition: background .15s ease;
        }
        .ai-btn-full:hover { background: linear-gradient(180deg, rgba(129,140,248,.42), rgba(106,90,232,.34)); }
        #ai-trans-panel[data-ait-theme="light"] .ai-btn-full {
            background: #6A3DE8; color: #fff; border-color: #6A3DE8;
        }
        #ai-trans-panel[data-ait-theme="light"] .ai-btn-full:hover { background: #5228CC; }

        .ai-divider { border-top: 1px solid rgba(205,216,255,.13); margin: 12px 0 8px; }
        #ai-trans-panel[data-ait-theme="light"] .ai-divider { border-top-color: #e5e5ea; }

        .char-item {
            padding: 6px 9px; margin-bottom: 4px; border-radius: 8px; display: flex;
            justify-content: space-between; font-size: 12px; cursor: pointer; align-items: center;
            background: rgba(255,255,255,.05); border: 1px solid rgba(205,216,255,.12); color: inherit;
            transition: border-color .15s ease;
        }
        .char-item:hover { border-color: rgba(165,180,252,.55); }
        #ai-trans-panel[data-ait-theme="light"] .char-item { background: #f9f9fb; border-color: #e5e5ea; }
        #ai-trans-panel[data-ait-theme="light"] .char-item:hover { border-color: #8a72d8; }
        .char-del { color: #f87171; font-weight: bold; padding: 0 4px; }

        @keyframes spin { 100% { transform: rotate(360deg); } }
        .spin-icon { display: inline-block; animation: spin 1s linear infinite; }
    `);

    // ===================================================================================
    // [목표 언어 목록]
    // ===================================================================================
    const LANGUAGES = [
        { value: 'English', label: '영어' },
        { value: 'Japanese', label: '일본어' },
        { value: 'Chinese (Simplified)', label: '중국어 간체' },
        { value: 'Chinese (Traditional)', label: '중국어 번체' },
        { value: 'Russian', label: '러시아어' },
        { value: 'Spanish', label: '스페인어' },
        { value: 'French', label: '프랑스어' },
        { value: 'German', label: '독일어' },
        { value: 'Italian', label: '이탈리아어' },
        { value: 'Portuguese', label: '포르투갈어' },
        { value: 'Vietnamese', label: '베트남어' },
        { value: 'Thai', label: '태국어' },
        { value: 'Indonesian', label: '인도네시아어' },
        { value: 'Arabic', label: '아랍어' },
        { value: 'Turkish', label: '터키어' },
        { value: 'Hindi', label: '힌디어' },
        { value: '__custom__', label: '직접 입력…' }
    ];

    function getTargetLang() {
        if (settings.lang === '__custom__') {
            return (settings.customLang || '').trim() || 'English';
        }
        return settings.lang || 'English';
    }

    // ===================================================================================
    // [출력 형식 템플릿]
    // {번역문} = 번역된 대사, {원문} = 한국어 원문. {원문}은 생략 가능.
    // ===================================================================================
    function getFormatTemplate() {
        let fmt = (settings.format || '').trim();
        if (!fmt.includes('{번역문}')) fmt = DEFAULT_FORMAT;
        return fmt;
    }

    function buildFormatInstruction() {
        const fmt = getFormatTemplate();
        const pattern = fmt
            .split('{번역문}').join('<TRANSLATED_DIALOGUE>')
            .split('{원문}').join('<ORIGINAL_KOREAN_DIALOGUE>');
        const example = fmt
            .split('{번역문}').join('Hello, nice to meet you!')
            .split('{원문}').join('안녕, 반가워!');
        return { pattern, example, includesOriginal: fmt.includes('{원문}') };
    }

    // ===================================================================================
    // [UI 패널 생성]
    // ===================================================================================
    const UI = {
        init() {
            this.createPanel();
            this.bindEvents();
            this.renderCharList();
            applyAitTheme();
        },

        createPanel() {
            const panel = document.createElement('div');
            panel.id = 'ai-trans-panel';

            const langOptions = LANGUAGES.map(l => `<option value="${l.value}">${l.label}</option>`).join('');

            panel.innerHTML = `
                <div class="ai-panel-header" id="ai-panel-drag">
                    <span>🌐 번역 설정</span>
                    <span class="ai-panel-close" id="ai-panel-close">✕</span>
                </div>
                <div class="ai-tabs">
                    <div class="ai-tab active" data-target="tab-main">기본 설정</div>
                    <div class="ai-tab" data-target="tab-chars">캐릭터 보관함</div>
                </div>

                <div class="ai-content active" id="tab-main">
                    <div class="ai-form-group">
                        <label>적용할 캐릭터</label>
                        <select id="cfg-char" class="ai-input"><option value="">선택 안 함</option></select>
                    </div>
                    <div style="display:flex; gap:6px;">
                        <div class="ai-form-group" style="flex:1;">
                            <label>목표 언어</label>
                            <select id="cfg-lang" class="ai-input">${langOptions}</select>
                        </div>
                        <div class="ai-form-group" style="flex:1;">
                            <label>사용 모델</label>
                            <select id="cfg-model" class="ai-input">
                                <option value="gemini-3.5-flash">3.5 Flash</option>
                                <option value="gemini-3.1-flash-lite-preview">3.1 Flash-Lite</option>
                                <option value="gemini-3.1-pro-preview">3.1 Pro</option>
                            </select>
                        </div>
                    </div>

                    <div class="ai-form-group" id="group-custom-lang" style="display:none;">
                        <label>목표 언어 직접 입력</label>
                        <input type="text" id="cfg-custom-lang" class="ai-input" placeholder="예: Polish, Swahili, 고전 라틴어...">
                    </div>

                    <div class="ai-form-group">
                        <label>출력 형식</label>
                        <textarea id="cfg-format" class="ai-input" placeholder="${DEFAULT_FORMAT}"></textarea>
                        <div class="ai-hint">
                            <code>{번역문}</code> 자리에 번역된 대사, <code>{원문}</code> 자리에 한국어 원문이 들어가요.<br>
                            예: <code>{번역문} ({원문})</code> · <code>{원문} → {번역문}</code> · <code>{번역문}</code> (원문 생략)<br>
                            <b>**서술**</b> 부분은 항상 한국어 그대로 유지돼요.
                        </div>
                    </div>

                    <div class="ai-form-group">
                        <label>API 제공자</label>
                        <select id="cfg-provider" class="ai-input">
                            <option value="google">Google API</option>
                            <option value="firebase">Firebase Vertex AI</option>
                        </select>
                    </div>

                    <div class="ai-form-group" id="group-api-key">
                        <label>API 키</label>
                        <input type="password" id="cfg-key" class="ai-input" placeholder="Google API Key 입력">
                    </div>

                    <div class="ai-form-group" id="group-firebase" style="display:none;">
                        <label>Firebase 설정</label>
                        <textarea id="cfg-firebase" class="ai-input" placeholder="firebaseConfig = { ... }; 형식의 스크립트 입력"></textarea>
                    </div>

                    <button class="ai-btn-full" id="btn-save-cfg">설정 저장</button>
                </div>

                <div class="ai-content" id="tab-chars">
                    <div class="ai-form-group"><label>이름</label><input type="text" id="ch-name" class="ai-input" placeholder="캐릭터 이름"></div>
                    <div style="display:flex; gap:6px;">
                        <div class="ai-form-group" style="flex:1;"><label>나이</label><input type="text" id="ch-age" class="ai-input"></div>
                        <div class="ai-form-group" style="flex:1;"><label>성별</label><input type="text" id="ch-gender" class="ai-input"></div>
                    </div>
                    <div class="ai-form-group"><label>직업/국적</label><input type="text" id="ch-job" class="ai-input"></div>
                    <div class="ai-form-group"><label>특징/말투</label><textarea id="ch-traits" class="ai-input" placeholder="까칠함, 존댓말 등"></textarea></div>
                    <button class="ai-btn-full" id="btn-save-char">캐릭터 저장</button>
                    <div class="ai-divider"></div>
                    <label style="font-size:11px; font-weight:bold;">저장된 목록</label>
                    <div id="char-list-box" style="margin-top:4px;"></div>
                </div>
            `;
            document.body.appendChild(panel);

            const dragHandle = document.getElementById('ai-panel-drag');
            let isDragging = false, startX, startY, initLeft, initTop;

            const dragStart = (e) => {
                if (e.target.id === 'ai-panel-close') return;
                isDragging = true;
                const evt = e.touches ? e.touches[0] : e;
                startX = evt.clientX; startY = evt.clientY;
                const rect = panel.getBoundingClientRect();
                initLeft = rect.left; initTop = rect.top;
            };
            const dragMove = (e) => {
                if (!isDragging) return;
                e.preventDefault();
                const evt = e.touches ? e.touches[0] : e;
                panel.style.left = Math.max(0, initLeft + (evt.clientX - startX)) + 'px';
                panel.style.top = Math.max(0, initTop + (evt.clientY - startY)) + 'px';
                panel.style.right = 'auto';
            };
            const dragEnd = () => isDragging = false;

            dragHandle.addEventListener('mousedown', dragStart);
            document.addEventListener('mousemove', dragMove, { passive: false });
            document.addEventListener('mouseup', dragEnd);

            dragHandle.addEventListener('touchstart', dragStart, { passive: true });
            document.addEventListener('touchmove', dragMove, { passive: false });
            document.addEventListener('touchend', dragEnd);
        },

        bindEvents() {
            document.getElementById('ai-panel-close').onclick = () => document.getElementById('ai-trans-panel').style.display = 'none';

            document.querySelectorAll('.ai-tab').forEach(tab => {
                tab.onclick = (e) => {
                    document.querySelectorAll('.ai-tab').forEach(t => t.classList.remove('active'));
                    document.querySelectorAll('.ai-content').forEach(c => c.classList.remove('active'));
                    e.target.classList.add('active');
                    document.getElementById(e.target.dataset.target).classList.add('active');
                };
            });

            // 설정값 불러오기
            const selProvider = document.getElementById('cfg-provider');
            const selLang = document.getElementById('cfg-lang');
            const groupKey = document.getElementById('group-api-key');
            const groupFb = document.getElementById('group-firebase');
            const groupCustomLang = document.getElementById('group-custom-lang');

            selProvider.value = settings.provider || 'google';
            document.getElementById('cfg-key').value = settings.apiKey || '';
            document.getElementById('cfg-firebase').value = settings.firebaseConfig || '';
            document.getElementById('cfg-model').value = settings.model || 'gemini-3.5-flash';
            document.getElementById('cfg-format').value = settings.format || DEFAULT_FORMAT;
            document.getElementById('cfg-custom-lang').value = settings.customLang || '';

            // 저장된 언어가 목록에 없으면 (구버전 'Chinese' 등) 목록에 임시 추가
            if (settings.lang && ![...selLang.options].some(o => o.value === settings.lang)) {
                const opt = document.createElement('option');
                opt.value = settings.lang;
                opt.textContent = settings.lang;
                selLang.insertBefore(opt, selLang.lastElementChild);
            }
            selLang.value = settings.lang || 'English';

            // Provider 변경에 따른 UI 토글
            const toggleProviderUI = () => {
                const isGoogle = selProvider.value === 'google';
                groupKey.style.display = isGoogle ? 'block' : 'none';
                groupFb.style.display = isGoogle ? 'none' : 'block';
            };
            selProvider.addEventListener('change', toggleProviderUI);
            toggleProviderUI();

            // 직접 입력 언어 토글
            const toggleCustomLangUI = () => {
                groupCustomLang.style.display = selLang.value === '__custom__' ? 'block' : 'none';
            };
            selLang.addEventListener('change', toggleCustomLangUI);
            toggleCustomLangUI();

            document.getElementById('btn-save-cfg').onclick = () => {
                const fmt = document.getElementById('cfg-format').value.trim();
                if (fmt && !fmt.includes('{번역문}')) {
                    return toast('출력 형식에 {번역문}이 반드시 포함돼야 해요', 'warn');
                }

                settings.provider = selProvider.value;
                settings.apiKey = document.getElementById('cfg-key').value;
                settings.firebaseConfig = document.getElementById('cfg-firebase').value;
                settings.model = document.getElementById('cfg-model').value;
                settings.lang = selLang.value;
                settings.customLang = document.getElementById('cfg-custom-lang').value.trim();
                settings.format = fmt || DEFAULT_FORMAT;
                settings.activeChar = document.getElementById('cfg-char').value;

                if (settings.lang === '__custom__' && !settings.customLang) {
                    return toast('직접 입력할 언어를 적어주세요', 'warn');
                }

                saveSettings();
                toast('기본 설정 저장됨', 'success');
            };

            document.getElementById('btn-save-char').onclick = () => {
                const name = document.getElementById('ch-name').value.trim();
                if(!name) return toast('이름을 입력하세요', 'warn');
                characters[name] = {
                    age: document.getElementById('ch-age').value,
                    gender: document.getElementById('ch-gender').value,
                    job: document.getElementById('ch-job').value,
                    traits: document.getElementById('ch-traits').value
                };
                saveChars();
                this.renderCharList();
                toast(`'${name}' 저장 완료`, 'success');
            };
        },

        renderCharList() {
            const box = document.getElementById('char-list-box');
            const select = document.getElementById('cfg-char');
            box.innerHTML = '';
            select.innerHTML = '<option value="">선택 안 함 (일반 번역)</option>';

            Object.keys(characters).forEach(name => {
                select.innerHTML += `<option value="${name}">${name}</option>`;

                const item = document.createElement('div');
                item.className = 'char-item';
                item.innerHTML = `<span>${name}</span> <span class="char-del" data-name="${name}">✕</span>`;

                item.onclick = (e) => {
                    if (e.target.classList.contains('char-del')) {
                        if(confirm(`'${name}' 삭제할까요?`)) {
                            delete characters[name];
                            saveChars();
                            if(settings.activeChar === name) { settings.activeChar = ""; saveSettings(); }
                            this.renderCharList();
                        }
                        return;
                    }
                    const c = characters[name];
                    document.getElementById('ch-name').value = name;
                    document.getElementById('ch-age').value = c.age;
                    document.getElementById('ch-gender').value = c.gender;
                    document.getElementById('ch-job').value = c.job;
                    document.getElementById('ch-traits').value = c.traits;
                };
                box.appendChild(item);
            });
            select.value = settings.activeChar || "";
        }
    };

    // ===================================================================================
    // [번역 API 호출]
    // ===================================================================================
    function getChatInput() {
        return document.querySelector('.__chat_input_textarea') ||
               document.querySelector('div[contenteditable="true"]') ||
               document.querySelector('textarea');
    }

    // Firebase 설정 파싱
    function parseVertexContent(scriptStr) {
        try {
            const match = scriptStr.match(/firebaseConfig\s*=\s*(\{[\s\S]*?\});/);
            if (match && match[1]) return new Function("return " + match[1])();

            if (scriptStr.includes("apiKey")) {
                const startText = "firebaseConfig = {";
                const startIndex = scriptStr.indexOf(startText);
                if (startIndex !== -1) {
                    const endIndex = scriptStr.indexOf("}", startIndex);
                    if (endIndex !== -1) {
                        const objStr = scriptStr.substring(startIndex + startText.length - 1, endIndex + 1);
                        return new Function("return " + objStr)();
                    }
                }
            }
        } catch(e) {}
        return null;
    }

    function buildSystemPrompt() {
        const lang = getTargetLang();
        const { pattern, example, includesOriginal } = buildFormatInstruction();

        let sysPrompt = `Translate the roleplay text to ${lang}.
Rules:
1. Ignore and DO NOT translate any narrative wrapped in ** (e.g. **He smiled.**). Keep it exactly as original Korean.
2. Translate the spoken dialogue (text outside the **) to ${lang}.
3. 🚨CRITICAL: Output each dialogue segment EXACTLY in this format: ${pattern}`;

        if (!includesOriginal) {
            sysPrompt += `\n   Do NOT append the original Korean dialogue. Output only what the format specifies.`;
        }

        sysPrompt += `
Example Input: **손을 흔들며** 안녕, 반가워!
Example Output: **손을 흔들며** ${example}`;

        if (settings.activeChar && characters[settings.activeChar]) {
            const c = characters[settings.activeChar];
            sysPrompt += `\n4. Apply Character Persona to the dialogue translation: Name:${settings.activeChar}, Age:${c.age}, Gender:${c.gender}, Job:${c.job}, Traits:${c.traits}`;
        }

        return sysPrompt;
    }

    async function executeTranslation() {
        const inputEl = getChatInput();
        if (!inputEl) return toast('입력창을 찾을 수 없음', 'error');

        const isEditableDiv = inputEl.isContentEditable;
        const rawText = isEditableDiv ? inputEl.innerText : inputEl.value;

        if (!rawText || !rawText.trim()) return toast('번역할 텍스트를 입력하세요', 'warn');
        if (settings.provider === 'google' && !settings.apiKey) return toast('설정창에서 Google API 키 입력 필요', 'error');
        if (settings.provider === 'firebase' && !settings.firebaseConfig) return toast('설정창에서 Firebase 스크립트 입력 필요', 'error');

        const btn = document.getElementById('ai-trans-btn');
        const icon = document.getElementById('trans-icon');
        btn.disabled = true;
        icon.innerText = '⏳';
        icon.classList.add('spin-icon');
        toast('번역 중...', 'info');

        const sysPrompt = buildSystemPrompt();

        try {
            let translatedText = "";

            if (settings.provider === 'firebase') {
                // Firebase 처리
                const config = parseVertexContent(settings.firebaseConfig);
                if (!config) throw new Error("Firebase 스크립트 형식이 올바르지 않습니다.");

                const { initializeApp } = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js");
                const { getAI, getGenerativeModel, VertexAIBackend, HarmBlockThreshold, HarmCategory } = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-ai.js");

                let app;
                try {
                    app = initializeApp(config, "trans-ai-" + Date.now());
                } catch(e) {
                    throw new Error("Firebase 초기화 실패: " + e.message);
                }

                const ai = getAI(app, { backend: new VertexAIBackend('global') });
                const safetySettings = [
                    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.OFF },
                    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.OFF },
                    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.OFF },
                    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.OFF }
                ];

                const model = getGenerativeModel(ai, {
                    model: settings.model,
                    systemInstruction: sysPrompt,
                    safetySettings: safetySettings
                });

                const result = await model.generateContent(rawText);
                const response = await result.response;
                translatedText = response.text().trim();

            } else {
                // 기존 Google API 처리
                const payloadData = {
                    system_instruction: { parts: [{ text: sysPrompt }] },
                    contents: [{ parts: [{ text: rawText }] }],
                    safetySettings: [
                        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                    ]
                };

                translatedText = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: "POST",
                        url: `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${settings.apiKey}`,
                        headers: { "Content-Type": "application/json" },
                        data: JSON.stringify(payloadData),
                        onload: (res) => {
                            try {
                                const data = JSON.parse(res.responseText);
                                if (data.promptFeedback && data.promptFeedback.blockReason) throw new Error(`필터 차단됨`);
                                if (data.candidates && data.candidates.length > 0) {
                                    const cand = data.candidates[0];
                                    if (cand.finishReason === "SAFETY") throw new Error("안전 필터 차단됨");
                                    if (!cand.content || !cand.content.parts || cand.content.parts.length === 0) throw new Error("빈 텍스트 반환됨");
                                    resolve(cand.content.parts[0].text.trim());
                                } else if (data.error) {
                                    throw new Error(`${data.error.message}`);
                                } else {
                                    throw new Error("결과값 없음");
                                }
                            } catch (e) {
                                if (e instanceof SyntaxError) reject(new Error('모델명/키 오류'));
                                else reject(e);
                            }
                        },
                        onerror: () => reject(new Error('네트워크 오류 (API/인터넷 확인)'))
                    });
                });
            }

            setReactValue(inputEl, translatedText);
            toast('번역 완료!', 'success');

        } catch (error) {
            toast(`에러: ${error.message}`, 'error');
        } finally {
            btn.disabled = false;
            icon.innerText = '🌐';
            icon.classList.remove('spin-icon');
        }
    }

    // ===================================================================================
    // [UI 자동 주입 로직]
    // ===================================================================================
    function findSendContainer() {
        // 대시보드 버튼에 낚이지 않도록, 하단 툴바(</> 버튼 있는 곳)를 정확히 지정합니다.
        const toolbar = document.querySelector('.flex.items-center.space-x-2');
        return toolbar || null;
    }

    function injectButtons() {
        const container = findSendContainer();
        if (!container) return;

        let wrapper = document.getElementById('ai-trans-inline-group');
        if (!wrapper || !wrapper.isConnected) {
            wrapper = document.createElement('div');
            wrapper.id = 'ai-trans-inline-group';
            wrapper.style.marginRight = '4px';

            wrapper.innerHTML = `
                <button id="ai-trans-btn" class="trans-action-btn" title="캐릭터 번역"><span id="trans-icon">🌐</span></button>
                <button id="ai-trans-cfg-btn" class="trans-setting-btn" title="설정">⚙️</button>
            `;

            container.insertBefore(wrapper, container.firstChild);

            wrapper.querySelector('#ai-trans-btn').onclick = executeTranslation;
            wrapper.querySelector('#ai-trans-cfg-btn').onclick = () => {
                const p = document.getElementById('ai-trans-panel');
                p.style.display = p.style.display === 'flex' ? 'none' : 'flex';
                applyAitTheme();
            };
        }

        applyAitTheme();
    }

    UI.init();
    setInterval(injectButtons, 1000);

})();
