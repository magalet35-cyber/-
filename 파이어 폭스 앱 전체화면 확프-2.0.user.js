// ==UserScript==
// @name         파이어 폭스 앱 전체화면 확프
// @namespace    http://tampermonkey.net/
// @author       나 이뤼붕과 젬민이쉑
// @version      2.0
// @description  파폭으로 크랙하는데 주소창이랑 핸드폰 상태창 뜨는거 싫어서 만듬. 컴퓨터 F11 하는거랑 똑같음
// @match        https://crack.wrtn.ai/stories/*/episodes/*
// @match        https://crack.wrtn.ai/characters/*/chats/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

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

    // 버튼 삽입 함수 (두 번째 스크립트 방식)
    function injectFullscreenButton() {
        // 이미 버튼이 존재하면 중지
        if (document.getElementById('fullscreen-toolbar-btn')) {
            return;
        }

        // 버튼이 들어갈 툴바 컨테이너 찾기
        const btnContainer = document.querySelector('.flex.items-center.space-x-2');
        if (!btnContainer) return;

        // 기준이 되는 기존 버튼들 찾기
        const recommendBtn = Array.from(btnContainer.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('추천답변'));
        const hlpBtn = document.getElementById('hlp-toolbar-btn');
        const plBtn = document.getElementById('txt-palette-toolbar-btn');
        const capBtn = document.getElementById('cap-toolbar-btn'); // 캡처기 버튼이 있다면 그 옆에 배치

        // 버튼 요소 생성
        const fsBtn = document.createElement('button');
        fsBtn.id = 'fullscreen-toolbar-btn';
        // 뤼튼 기본 UI 버튼과 동일한 클래스 적용
        fsBtn.className = "relative inline-flex items-center gap-1 rounded-full text-sm font-medium transition-colors border border-border bg-card text-line-gray-1 hover:bg-secondary p-0 size-7 justify-center ml-1";

        // 현재 상태에 맞는 아이콘 렌더링
        const currentIcon = document.fullscreenElement ? '✖' : '⛶';
        fsBtn.innerHTML = `<span title="전체화면 토글" style="font-size: 14px; margin-top: 1px;">${currentIcon}</span>`;

        // 이벤트 바인딩
        fsBtn.addEventListener('click', toggleFullscreen);
        fsBtn.addEventListener('touchstart', toggleFullscreen, { passive: false });

        // 버튼 삽입 위치 결정 (다른 확장 프로그램 버튼들 우측에 배치)
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

    // 화면 상태에 따라 아이콘 모양 변경 이벤트
    document.addEventListener('fullscreenchange', () => {
        const btnSpan = document.querySelector('#fullscreen-toolbar-btn span');
        if (btnSpan) {
            btnSpan.innerHTML = document.fullscreenElement ? '✖' : '⛶';
        }
    });

    // 뤼튼 특성상 React 기반이라 화면 전환 및 렌더링이 동적이므로 0.5초마다 버튼 유무 체크 후 주입
    setInterval(injectFullscreenButton, 500);

})();