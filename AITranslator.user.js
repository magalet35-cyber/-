// ==UserScript==
// @name         AI 캐릭터 맞춤 번역기 (모바일 최적화)
// @namespace    http://tampermonkey.net/
// @version      2.7
// @description  설정창 모바일 UI 최적화 (초소형 사이즈 및 터치 드래그 지원)
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
    let characters = JSON.parse(GM_getValue('AITrans_chars', '{}'));
    let settings = JSON.parse(GM_getValue('AITrans_settings', '{"apiKey":"","model":"gemini-3.5-flash","lang":"English","activeChar":""}'));

    function saveSettings() { GM_setValue('AITrans_settings', JSON.stringify(settings)); }
    function saveChars() { GM_setValue('AITrans_chars', JSON.stringify(characters)); }

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
        const palette = { success:"#16a34a", warn:"#d97706", error:"#dc2626", info:"#6A3DE8" };
        const el = document.createElement("div");
        el.textContent = msg;
        el.style.cssText = `
            position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
            z-index:999999; background:#1a1a1a; color:#fff;
            padding:10px 16px; border-radius:8px; font-size:12px; font-weight:bold;
            border-left:4px solid ${palette[type]||palette.info};
            box-shadow:0 4px 16px rgba(0,0,0,.4); transition:opacity .4s; white-space:nowrap;
        `;
        document.body.appendChild(el);
        setTimeout(() => { el.style.opacity="0"; setTimeout(()=>el.remove(),400); }, 3000);
    }

    // ===================================================================================
    // [스타일 정의 - 모바일 최적화 (초소형 컴팩트 버전)]
    // ===================================================================================
    GM_addStyle(`
        #ai-trans-inline-group { display: flex; align-items: center; gap: 4px; margin-left: auto; margin-right: 6px; }
        .trans-action-btn {
            height: 1.8rem; border-radius: 6px; background: #6A3DE8; color: white; border: none;
            padding: 0 10px; font-size: 12px; font-weight: bold; cursor: pointer; transition: 0.2s;
            display: flex; align-items: center; gap: 4px; box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        }
        .trans-action-btn:hover { background: #5228CC; transform: translateY(-1px); }
        .trans-action-btn:disabled { background: #9ca3af; cursor: not-allowed; transform: none; }

        .trans-setting-btn {
            height: 1.8rem; width: 1.8rem; border-radius: 6px; background: transparent; color: var(--text_secondary, #666);
            border: 1px solid var(--border, #ccc); padding: 0; font-size: 12px; cursor: pointer; transition: 0.2s; display: flex; justify-content: center; align-items: center;
        }
        .trans-setting-btn:hover { background: var(--bg_elevated_secondary, #f0f0f0); color: #333; }

        /* 패널 UI를 모바일에 맞게 초소형으로 조정 */
        #ai-trans-panel {
            position: fixed; top: 10vh; left: 5vw; z-index: 999999;
            width: 90vw; max-width: 320px; /* 모바일 화면에 쏙 들어가는 사이즈 */
            background: var(--bg_screen, #fff); border: 1px solid var(--border, #ddd);
            border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); display: none; flex-direction: column; overflow: hidden;
            font-family: system-ui, -apple-system, sans-serif;
        }
        .ai-panel-header { background: #1f2937; color: white; padding: 10px; display: flex; justify-content: space-between; cursor: move; font-weight: bold; font-size: 13px; user-select: none;}
        .ai-panel-close { cursor: pointer; color: #f87171; padding: 0 5px; }
        .ai-tabs { display: flex; background: #f3f4f6; border-bottom: 1px solid #e5e7eb; }
        .ai-tab { flex: 1; padding: 8px 0; text-align: center; cursor: pointer; font-size: 12px; color: #4b5563; }
        .ai-tab.active { background: #fff; color: #6A3DE8; font-weight: bold; border-bottom: 2px solid #6A3DE8; }

        .ai-content { padding: 12px; display: none; max-height: 60vh; overflow-y: auto; }
        .ai-content::-webkit-scrollbar { width: 4px; }
        .ai-content::-webkit-scrollbar-thumb { background: #ccc; border-radius: 4px; }
        .ai-content.active { display: block; }

        .ai-form-group { margin-bottom: 8px; }
        .ai-form-group label { display: block; font-size: 11px; margin-bottom: 3px; font-weight: bold; color: #374151; }
        .ai-input { width: 100%; padding: 6px; border: 1px solid #d1d5db; border-radius: 4px; box-sizing: border-box; font-size: 12px; outline: none; }
        .ai-input:focus { border-color: #6A3DE8; }
        textarea.ai-input { resize: vertical; min-height: 50px; }

        .ai-btn-full { width: 100%; background: #6A3DE8; color: white; border: none; padding: 8px; border-radius: 4px; cursor: pointer; font-weight: bold; margin-top: 5px; font-size: 12px;}
        .ai-btn-full:hover { background: #5228CC; }

        .char-item { background: #f9fafb; border: 1px solid #e5e7eb; padding: 6px 8px; margin-bottom: 4px; border-radius: 4px; display: flex; justify-content: space-between; font-size: 12px; cursor: pointer; align-items: center; }
        .char-item:hover { border-color: #6A3DE8; }
        .char-del { color: #ef4444; font-weight: bold; padding: 0 4px; }

        @keyframes spin { 100% { transform: rotate(360deg); } }
        .spin-icon { display: inline-block; animation: spin 1s linear infinite; }
    `);

    // ===================================================================================
    // [UI 패널 생성]
    // ===================================================================================
    const UI = {
        init() {
            this.createPanel();
            this.bindEvents();
            this.renderCharList();
        },

        createPanel() {
            const panel = document.createElement('div');
            panel.id = 'ai-trans-panel';
            panel.innerHTML = `
                <div class="ai-panel-header" id="ai-panel-drag">
                    <span>⚙️ 번역 설정</span>
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
                    <div style="display:flex; gap:4px;">
                        <div class="ai-form-group" style="flex:1;">
                            <label>목표 언어</label>
                            <select id="cfg-lang" class="ai-input">
                                <option value="English">영어</option>
                                <option value="Japanese">일본어</option>
                                <option value="Chinese">중국어</option>
                                <option value="Russian">러시아어</option>
                            </select>
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
                    <div class="ai-form-group">
                        <label>API 키</label>
                        <input type="password" id="cfg-key" class="ai-input" placeholder="API Key 입력">
                    </div>
                    <button class="ai-btn-full" id="btn-save-cfg">설정 저장</button>
                    <div style="margin-top:10px; font-size:10px; color:#666; line-height:1.3; text-align:center;">
                        * <b>**서술** 대사</b> ➡️ <b>**서술** 번역 (한국어원문)</b> 형태로 적용됨
                    </div>
                </div>

                <div class="ai-content" id="tab-chars">
                    <div class="ai-form-group"><label>이름</label><input type="text" id="ch-name" class="ai-input" placeholder="캐릭터 이름"></div>
                    <div style="display:flex; gap:4px;">
                        <div class="ai-form-group" style="flex:1;"><label>나이</label><input type="text" id="ch-age" class="ai-input"></div>
                        <div class="ai-form-group" style="flex:1;"><label>성별</label><input type="text" id="ch-gender" class="ai-input"></div>
                    </div>
                    <div class="ai-form-group"><label>직업/국적</label><input type="text" id="ch-job" class="ai-input"></div>
                    <div class="ai-form-group"><label>특징/말투</label><textarea id="ch-traits" class="ai-input" placeholder="까칠함, 존댓말 등"></textarea></div>
                    <button class="ai-btn-full" id="btn-save-char">캐릭터 저장</button>
                    <div style="border-top:1px solid #ddd; margin:12px 0 8px;"></div>
                    <label style="font-size:11px; font-weight:bold;">저장된 목록</label>
                    <div id="char-list-box" style="margin-top:4px;"></div>
                </div>
            `;
            document.body.appendChild(panel);

            // 모바일 터치 + PC 마우스 드래그 지원
            const dragHandle = document.getElementById('ai-panel-drag');
            let isDragging = false, startX, startY, initLeft, initTop;

            const dragStart = (e) => {
                isDragging = true;
                const evt = e.touches ? e.touches[0] : e;
                startX = evt.clientX; startY = evt.clientY;
                const rect = panel.getBoundingClientRect();
                initLeft = rect.left; initTop = rect.top;
            };
            const dragMove = (e) => {
                if (!isDragging) return;
                // 모바일에서 드래그 시 화면 넘어가는 현상 방지
                e.preventDefault();
                const evt = e.touches ? e.touches[0] : e;
                panel.style.left = Math.max(0, initLeft + (evt.clientX - startX)) + 'px';
                panel.style.top = Math.max(0, initTop + (evt.clientY - startY)) + 'px';
                panel.style.right = 'auto';
            };
            const dragEnd = () => isDragging = false;

            // 마우스 이벤트
            dragHandle.addEventListener('mousedown', dragStart);
            document.addEventListener('mousemove', dragMove, { passive: false });
            document.addEventListener('mouseup', dragEnd);

            // 터치 이벤트
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

            document.getElementById('cfg-key').value = settings.apiKey || '';
            document.getElementById('cfg-model').value = settings.model || 'gemini-3.5-flash';
            document.getElementById('cfg-lang').value = settings.lang || 'English';

            document.getElementById('btn-save-cfg').onclick = () => {
                settings.apiKey = document.getElementById('cfg-key').value;
                settings.model = document.getElementById('cfg-model').value;
                settings.lang = document.getElementById('cfg-lang').value;
                settings.activeChar = document.getElementById('cfg-char').value;
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

    async function executeTranslation() {
        const inputEl = getChatInput();
        if (!inputEl) return toast('입력창을 찾을 수 없음', 'error');

        const isEditableDiv = inputEl.isContentEditable;
        const rawText = isEditableDiv ? inputEl.innerText : inputEl.value;

        if (!rawText || !rawText.trim()) return toast('번역할 텍스트를 입력하세요', 'warn');
        if (!settings.apiKey) return toast('설정창에서 API 키 입력 필요', 'error');

        const btn = document.getElementById('ai-trans-btn');
        const icon = document.getElementById('trans-icon');
        btn.disabled = true;
        icon.innerText = '⏳';
        icon.classList.add('spin-icon');
        toast('번역 중...', 'info');

        let sysPrompt = `Translate the roleplay text to ${settings.lang}.
Rules:
1. Ignore and DO NOT translate any narrative wrapped in ** (e.g. **He smiled.**). Keep it exactly as original Korean.
2. Translate the spoken dialogue (text outside the **) to ${settings.lang}.
3. 🚨CRITICAL: ALWAYS append the original Korean dialogue in parentheses right after the translated dialogue.
Example Input: **손을 흔들며** 안녕, 반가워!
Example Output: **손을 흔들며** Hello, nice to meet you! (안녕, 반가워!)`;

        if (settings.activeChar && characters[settings.activeChar]) {
            const c = characters[settings.activeChar];
            sysPrompt += `\n4. Apply Character Persona to the dialogue translation: Name:${settings.activeChar}, Age:${c.age}, Gender:${c.gender}, Job:${c.job}, Traits:${c.traits}`;
        }

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

        GM_xmlhttpRequest({
            method: "POST",
            url: `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${settings.apiKey}`,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify(payloadData),
            onload: (res) => {
                btn.disabled = false;
                icon.innerText = '🌐';
                icon.classList.remove('spin-icon');

                try {
                    const data = JSON.parse(res.responseText);

                    if (data.promptFeedback && data.promptFeedback.blockReason) {
                        throw new Error(`필터 차단됨`);
                    }

                    if (data.candidates && data.candidates.length > 0) {
                        const cand = data.candidates[0];

                        if (cand.finishReason === "SAFETY") {
                            throw new Error("안전 필터 차단됨");
                        }

                        if (!cand.content || !cand.content.parts || cand.content.parts.length === 0) {
                            throw new Error("빈 텍스트 반환됨");
                        }

                        const translated = cand.content.parts[0].text.trim();
                        setReactValue(inputEl, translated);
                        toast('번역 완료!', 'success');

                    } else if (data.error) {
                        throw new Error(`${data.error.message}`);
                    } else {
                        throw new Error("결과값 없음");
                    }
                } catch (e) {
                    if (e instanceof SyntaxError) {
                        toast('모델명/키 오류', 'error');
                    } else {
                        toast(`에러: ${e.message}`, 'error');
                    }
                }
            },
            onerror: () => {
                btn.disabled = false;
                icon.innerText = '🌐';
                icon.classList.remove('spin-icon');
                toast('네트워크 오류 (API/인터넷 확인)', 'error');
            }
        });
    }

    // ===================================================================================
    // [UI 자동 주입 로직]
    // ===================================================================================
    function findSendContainer() {
        const input = getChatInput();
        if (!input) return null;
        let node = input;
        for (let i = 0; i < 6 && node; i++, node = node.parentElement) {
            const btns = Array.from(node.querySelectorAll("button"));
            if (btns.length > 0) {
                return btns[btns.length - 1].parentElement;
            }
        }
        return null;
    }

    function injectButtons() {
        const container = findSendContainer();
        if (!container) return;

        let wrapper = document.getElementById('ai-trans-inline-group');
        if (!wrapper || !wrapper.isConnected) {
            wrapper = document.createElement('div');
            wrapper.id = 'ai-trans-inline-group';

            wrapper.innerHTML = `
                <button id="ai-trans-btn" class="trans-action-btn" title="캐릭터 번역"><span id="trans-icon">🌐</span> 번역</button>
                <button id="ai-trans-cfg-btn" class="trans-setting-btn" title="설정">⚙️</button>
            `;

            container.insertBefore(wrapper, container.firstChild);

            wrapper.querySelector('#ai-trans-btn').onclick = executeTranslation;
            wrapper.querySelector('#ai-trans-cfg-btn').onclick = () => {
                const p = document.getElementById('ai-trans-panel');
                p.style.display = p.style.display === 'flex' ? 'none' : 'flex';
            };
        }
    }

    UI.init();
    setInterval(injectButtons, 1000);

})();
