// ==UserScript==
// @name         AI 캐릭터 맞춤 번역기
// @namespace    http://tampermonkey.net/
// @version      3.4
// @description  별표 1개/2개 모두 인식 및 윤문(Polish) 프롬프트 강력 강화
// @match        https://crack.wrtn.ai/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      generativelanguage.googleapis.com
// @connect      crack-api.wrtn.ai
// ==/UserScript==

(function() {
    'use strict';

    // ===================================================================================
    // [상태 관리]
    // ===================================================================================
    let characters = JSON.parse(GM_getValue('AITrans_chars', '{}'));
    let settings = JSON.parse(GM_getValue('AITrans_settings', '{"provider":"google","apiKey":"","firebaseConfig":"","model":"gemini-3.5-flash","lang":"English","activeChar":"","useContext":true,"usePolish":false}'));
    
    if (settings.useContext === undefined) settings.useContext = true;
    if (settings.usePolish === undefined) settings.usePolish = false;

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
    // [스타일 정의]
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
            height: 1.8rem; width: 1.8rem; border-radius: 6px; background: #ffffff; color: #666666;
            border: 1px solid #cccccc; padding: 0; font-size: 12px; cursor: pointer; transition: 0.2s; display: flex; justify-content: center; align-items: center;
        }
        .trans-setting-btn:hover { background: #f0f0f0; color: #333333; }

        #ai-trans-panel {
            position: fixed; top: 10vh; left: 5vw; z-index: 999999;
            width: 90vw; max-width: 320px;
            background: #ffffff; border: 1px solid #dddddd; color: #333333;
            border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); display: none; flex-direction: column; overflow: hidden;
            font-family: system-ui, -apple-system, sans-serif;
        }
        .ai-panel-header { background: #1f2937; color: white; padding: 10px; display: flex; justify-content: space-between; cursor: move; font-weight: bold; font-size: 13px; user-select: none;}
        .ai-panel-close { cursor: pointer; color: #f87171; padding: 0 5px; }
        .ai-tabs { display: flex; background: #f3f4f6; border-bottom: 1px solid #e5e7eb; }
        .ai-tab { flex: 1; padding: 8px 0; text-align: center; cursor: pointer; font-size: 12px; color: #4b5563; }
        .ai-tab.active { background: #ffffff; color: #6A3DE8; font-weight: bold; border-bottom: 2px solid #6A3DE8; }

        .ai-content { padding: 12px; display: none; max-height: 60vh; overflow-y: auto; background: #ffffff; }
        .ai-content::-webkit-scrollbar { width: 4px; }
        .ai-content::-webkit-scrollbar-thumb { background: #cccccc; border-radius: 4px; }
        .ai-content.active { display: block; }

        .ai-form-group { margin-bottom: 8px; }
        .ai-form-group label.toggle-label { display: flex; align-items: center; gap: 4px; font-size: 11px; margin-bottom: 3px; font-weight: bold; cursor: pointer; }
        .ai-input {
            width: 100%; padding: 6px; background: #ffffff; color: #333333;
            border: 1px solid #d1d5db; border-radius: 4px; box-sizing: border-box; font-size: 12px; outline: none;
        }
        .ai-input:focus { border-color: #6A3DE8; }
        textarea.ai-input { resize: vertical; min-height: 50px; }
        #cfg-firebase { min-height: 70px; font-family: monospace; font-size: 11px; white-space: pre-wrap; }

        .ai-btn-full { width: 100%; background: #6A3DE8; color: white; border: none; padding: 8px; border-radius: 4px; cursor: pointer; font-weight: bold; margin-top: 5px; font-size: 12px;}
        .ai-btn-full:hover { background: #5228CC; }

        .char-item { background: #f9fafb; color: #333333; border: 1px solid #e5e7eb; padding: 6px 8px; margin-bottom: 4px; border-radius: 4px; display: flex; justify-content: space-between; font-size: 12px; cursor: pointer; align-items: center; }
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
                    <span>⚙️ 번역 설정 (V3.4)</span>
                    <span class="ai-panel-close" id="ai-panel-close">✕</span>
                </div>
                <div class="ai-tabs">
                    <div class="ai-tab active" data-target="tab-main">기본 설정</div>
                    <div class="ai-tab" data-target="tab-chars">캐릭터 보관함</div>
                </div>

                <div class="ai-content active" id="tab-main">
                    <div class="ai-form-group">
                        <label style="font-size: 11px; font-weight: bold; margin-bottom: 3px;">적용할 캐릭터</label>
                        <select id="cfg-char" class="ai-input"><option value="">선택 안 함</option></select>
                    </div>
                    <div style="display:flex; gap:4px;">
                        <div class="ai-form-group" style="flex:1;">
                            <label style="font-size: 11px; font-weight: bold; margin-bottom: 3px;">목표 언어</label>
                            <select id="cfg-lang" class="ai-input">
                                <option value="English">영어</option>
                                <option value="Japanese">일본어</option>
                                <option value="Chinese">중국어</option>
                                <option value="Russian">러시아어</option>
                            </select>
                        </div>
                        <div class="ai-form-group" style="flex:1;">
                            <label style="font-size: 11px; font-weight: bold; margin-bottom: 3px;">사용 모델</label>
                            <select id="cfg-model" class="ai-input">
                                <option value="gemini-3.5-flash">3.5 Flash</option>
                                <option value="gemini-3.1-flash-lite-preview">3.1 Flash-Lite</option>
                                <option value="gemini-3.1-pro-preview">3.1 Pro</option>
                            </select>
                        </div>
                    </div>

                    <div class="ai-form-group" style="background: #f8fafc; padding: 8px 10px; border-radius: 6px; border: 1px solid #e2e8f0; margin-top: 4px; display: flex; flex-direction: column; gap: 8px;">
                        <label class="toggle-label" style="color: #6A3DE8;">
                            <input type="checkbox" id="cfg-context" style="margin: 0;"> 🧠 대화 맥락 읽고 뉘앙스 반영하기
                        </label>
                        <label class="toggle-label" style="color: #f97316;">
                            <input type="checkbox" id="cfg-polish" style="margin: 0;"> ✍️ 번역 전 서술(* 또는 **) 화려하게 윤문하기
                        </label>
                    </div>

                    <div class="ai-form-group" style="margin-top: 8px;">
                        <label style="font-size: 11px; font-weight: bold; margin-bottom: 3px;">API 제공자</label>
                        <select id="cfg-provider" class="ai-input">
                            <option value="google">Google API</option>
                            <option value="firebase">Firebase Vertex AI</option>
                        </select>
                    </div>

                    <div class="ai-form-group" id="group-api-key">
                        <label style="font-size: 11px; font-weight: bold; margin-bottom: 3px;">API 키</label>
                        <input type="password" id="cfg-key" class="ai-input" placeholder="Google API Key 입력">
                    </div>

                    <div class="ai-form-group" id="group-firebase" style="display:none;">
                        <label style="font-size: 11px; font-weight: bold; margin-bottom: 3px;">Firebase 설정</label>
                        <textarea id="cfg-firebase" class="ai-input" placeholder="firebaseConfig = { ... }; 형식의 스크립트 입력"></textarea>
                    </div>

                    <button class="ai-btn-full" id="btn-save-cfg">설정 저장</button>
                    <div style="margin-top:10px; font-size:10px; color:#666; line-height:1.3; text-align:center;">
                        * <b>*서술* 대사</b> ➡️ <b>*화려한 서술* 번역 (한국어원문)</b>
                    </div>
                </div>

                <div class="ai-content" id="tab-chars">
                    <div class="ai-form-group"><label style="font-size: 11px; font-weight: bold; margin-bottom: 3px;">이름</label><input type="text" id="ch-name" class="ai-input" placeholder="캐릭터 이름"></div>
                    <div style="display:flex; gap:4px;">
                        <div class="ai-form-group" style="flex:1;"><label style="font-size: 11px; font-weight: bold; margin-bottom: 3px;">나이</label><input type="text" id="ch-age" class="ai-input"></div>
                        <div class="ai-form-group" style="flex:1;"><label style="font-size: 11px; font-weight: bold; margin-bottom: 3px;">성별</label><input type="text" id="ch-gender" class="ai-input"></div>
                    </div>
                    <div class="ai-form-group"><label style="font-size: 11px; font-weight: bold; margin-bottom: 3px;">직업/국적</label><input type="text" id="ch-job" class="ai-input"></div>
                    <div class="ai-form-group"><label style="font-size: 11px; font-weight: bold; margin-bottom: 3px;">특징/말투</label><textarea id="ch-traits" class="ai-input" placeholder="까칠함, 존댓말 등"></textarea></div>
                    <button class="ai-btn-full" id="btn-save-char">캐릭터 저장</button>
                    <div style="border-top:1px solid #dddddd; margin:12px 0 8px;"></div>
                    <label style="font-size:11px; font-weight:bold;">저장된 목록</label>
                    <div id="char-list-box" style="margin-top:4px;"></div>
                </div>
            `;
            document.body.appendChild(panel);

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

            const selProvider = document.getElementById('cfg-provider');
            const groupKey = document.getElementById('group-api-key');
            const groupFb = document.getElementById('group-firebase');

            selProvider.value = settings.provider || 'google';
            document.getElementById('cfg-key').value = settings.apiKey || '';
            document.getElementById('cfg-firebase').value = settings.firebaseConfig || '';
            document.getElementById('cfg-model').value = settings.model || 'gemini-3.5-flash';
            document.getElementById('cfg-lang').value = settings.lang || 'English';
            document.getElementById('cfg-context').checked = settings.useContext; 
            document.getElementById('cfg-polish').checked = settings.usePolish; 

            const toggleProviderUI = () => {
                if (selProvider.value === 'google') {
                    groupKey.style.display = 'block';
                    groupFb.style.display = 'none';
                } else {
                    groupKey.style.display = 'none';
                    groupFb.style.display = 'block';
                }
            };
            selProvider.addEventListener('change', toggleProviderUI);
            toggleProviderUI();

            document.getElementById('btn-save-cfg').onclick = () => {
                settings.provider = selProvider.value;
                settings.apiKey = document.getElementById('cfg-key').value;
                settings.firebaseConfig = document.getElementById('cfg-firebase').value;
                settings.model = document.getElementById('cfg-model').value;
                settings.lang = document.getElementById('cfg-lang').value;
                settings.activeChar = document.getElementById('cfg-char').value;
                settings.useContext = document.getElementById('cfg-context').checked; 
                settings.usePolish = document.getElementById('cfg-polish').checked; 
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
    // [번역 API 호출 및 맥락 추출 함수]
    // ===================================================================================
    function getChatInput() {
        return document.querySelector('.__chat_input_textarea') ||
               document.querySelector('div[contenteditable="true"]') ||
               document.querySelector('textarea');
    }

    async function getRecentContext() {
        const path = location.pathname.match(/\/stories\/([^/]+)\/episodes\/([^/]+)/);
        
        if (!path) {
            const bubbles = Array.from(document.querySelectorAll('div[dir="auto"], .whitespace-pre-wrap, p')).slice(-6);
            return bubbles.map(b => b.textContent.trim()).filter(Boolean).join('\n\n');
        }
        
        try {
            const token = document.cookie.split(";").map((c) => c.trim()).find((c) => c.startsWith("access_token="))?.slice(13);
            if (!token) return "";
            
            const res = await fetch(`https://crack-api.wrtn.ai/crack-gen/v3/chats/${path[2]}/messages?limit=4`, {
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
            });
            const json = await res.json();
            const msgs = (json.data ?? json).messages ?? [];
            
            return msgs.reverse().map(m => `[${m.role === "assistant" ? "상대방" : "나"}]: ${m.content}`).join("\n\n");
        } catch(e) {
            return "";
        }
    }

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
        toast('번역 준비 중...', 'info');

        let contextText = "";
        if (settings.useContext) {
            toast('대화 맥락 읽는 중...', 'info');
            contextText = await getRecentContext();
        }

        // 🔥 프롬프트 전면 수정: * 와 ** 모두 인식하게 만들고 윤문 지시를 극강으로 올림
        let sysPrompt = `You are a specialized RP translator and writer. Process the input text which consists of [NARRATIVE] and [DIALOGUE].\n`;
        sysPrompt += `The [NARRATIVE] is any text wrapped in asterisks (either * or **).\n`;
        sysPrompt += `The [DIALOGUE] is the spoken text outside the asterisks.\n\n`;
        
        if (contextText) {
            sysPrompt += `[Recent Conversation Context]\n${contextText}\n\n*CRITICAL: Use the context ONLY to understand the situation and tone. DO NOT translate the context.*\n\n`;
        }

        sysPrompt += `[RULES]\n`;
        
        if (settings.usePolish) {
            sysPrompt += `1. NARRATIVE: You MUST aggressively rewrite, expand, and polish the Korean [NARRATIVE] into a highly descriptive, emotional, and immersive web novel style in KOREAN. Even if the original narrative is already long, enhance its vocabulary and emotional depth like a professional author. NEVER translate the narrative to a foreign language. DO NOT just copy the original. Wrap the polished narrative in *.\n`;
        } else {
            sysPrompt += `1. NARRATIVE: DO NOT translate or modify the Korean [NARRATIVE]. Keep it EXACTLY as the original Korean text. Wrap it in *.\n`;
        }

        sysPrompt += `2. DIALOGUE: Translate the [DIALOGUE] to ${settings.lang}.\n`;
        sysPrompt += `3. FORMAT: ALWAYS append the original Korean dialogue in parentheses right after the translated dialogue.\n\n`;

        if (settings.usePolish) {
            sysPrompt += `Example Input: *창밖을 보며* 안녕, 반가워!\n`;
            sysPrompt += `Example Output: *유리창에 부딪히는 거센 빗방울을 물끄러미 응시하며, 쓸쓸한 눈빛으로 입을 열었다.* Hello, nice to meet you! (안녕, 반가워!)\n`;
        } else {
            sysPrompt += `Example Input: *창밖을 보며* 안녕, 반가워!\n`;
            sysPrompt += `Example Output: *창밖을 보며* Hello, nice to meet you! (안녕, 반가워!)\n`;
        }

        if (settings.activeChar && characters[settings.activeChar]) {
            const c = characters[settings.activeChar];
            sysPrompt += `\n[Character Persona for Dialogue Translation]\nName:${settings.activeChar}, Age:${c.age}, Gender:${c.gender}, Job:${c.job}, Traits:${c.traits}`;
        }

        try {
            let translatedText = "";

            if (settings.provider === 'firebase') {
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
