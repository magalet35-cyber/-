// ==UserScript==
// @name         전체화면 확프
// @namespace    http://tampermonkey.net/
// @version      2.5
// @description  키보드 여백 비율을 직접 조절하여 공중부양 및 겹침 현상 완벽 해결
// @match        https://crack.wrtn.ai/stories/*/episodes/*
// @match        https://crack.wrtn.ai/characters/*/chats/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================
    // ⚙️ [여백 조절 설정] 
    // 키보드 위 하얀 여백이 너무 넓으면 숫자를 줄이고, 
    // 입력창이 키보드에 가려지면 숫자를 늘려보세요!
    // (예: 0.75, 0.5, 0.3 등)
    // ==========================================
    const GAP_RATIO = 0.15; 
    // ==========================================

    // 전체화면 토글 함수
    const toggleFullscreen = (e) => {
        e.preventDefault();
        if (!document.fullscreenElement) {
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen().catch(console.error);
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen().catch(console.error);
            }
        }
    };

    // 툴바 버튼 삽입 함수
    function injectFullscreenButton() {
        if (document.getElementById('fullscreen-toolbar-btn')) return;

        const btnContainer = document.querySelector('.flex.items-center.space-x-2');
        if (!btnContainer) return;

        const recommendBtn = Array.from(btnContainer.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('추천답변'));
        const hlpBtn = document.getElementById('hlp-toolbar-btn');
        const plBtn = document.getElementById('txt-palette-toolbar-btn');
        const capBtn = document.getElementById('cap-toolbar-btn');

        const fsBtn = document.createElement('button');
        fsBtn.id = 'fullscreen-toolbar-btn';
        fsBtn.className = "relative inline-flex items-center gap-1 rounded-full text-sm font-medium transition-colors border border-border bg-card text-line-gray-1 hover:bg-secondary p-0 size-7 justify-center ml-1";
        
        const currentIcon = document.fullscreenElement ? '✖' : '⛶';
        fsBtn.innerHTML = `<span title="전체화면 토글" style="font-size: 14px; margin-top: 1px;">${currentIcon}</span>`;
        
        fsBtn.addEventListener('click', toggleFullscreen);
        fsBtn.addEventListener('touchstart', toggleFullscreen, { passive: false });

        const targetBtn = capBtn || plBtn || hlpBtn || recommendBtn;
        if (targetBtn && targetBtn.parentNode) {
            if(targetBtn === recommendBtn) {
                targetBtn.parentNode.insertBefore(fsBtn, targetBtn);
            } else {
                targetBtn.parentNode.insertBefore(fsBtn, targetBtn.nextSibling);
            }
        } else { 
            btnContainer.appendChild(fsBtn); 
        }
    }

    // ⭐️ V2.5: 사용자 맞춤형 투명 여백 비율 로직 ⭐️
    function handleViewportResize() {
        if (!window.visualViewport) return;
        
        if (document.fullscreenElement) {
            const kbHeight = window.innerHeight - window.visualViewport.height;
            
            if (kbHeight > 50) {
                // GAP_RATIO를 곱해서 여백의 양을 유동적으로 줄입니다.
                document.body.style.paddingBottom = `${kbHeight * GAP_RATIO}px`;
                
                setTimeout(() => {
                    const activeEl = document.activeElement;
                    if (activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT')) {
                        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                }, 100);
            } else {
                document.body.style.paddingBottom = '0px';
            }
        } else {
            document.body.style.paddingBottom = '';
        }
    }

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', handleViewportResize);
    }

    document.addEventListener('fullscreenchange', () => {
        const btnSpan = document.querySelector('#fullscreen-toolbar-btn span');
        if (btnSpan) {
            btnSpan.innerHTML = document.fullscreenElement ? '✖' : '⛶';
        }
        handleViewportResize();
    });

    setInterval(injectFullscreenButton, 500);

})();
