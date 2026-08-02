// ==UserScript==
// @name         크랙 엔터 방지
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  엔터키 전송 방지 기능을 켜고 끌 수 있는 버튼을 툴바에 추가.
// @match        https://crack.wrtn.ai/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 기능 켜짐/꺼짐 상태 변수 (기본값: true = 엔터 방지 켜짐)
    let isEnterBlocked = true;

    // 1. 키보드 입력 가로채기 로직
    document.addEventListener('keydown', function(e) {
        // 기능이 꺼져있으면 개입하지 않음
        if (!isEnterBlocked) return;

        if (e.key === 'Enter' && !e.shiftKey) {
            const target = e.target;

            if (target.tagName === 'TEXTAREA' || target.isContentEditable) {
                e.stopPropagation();
                e.preventDefault();

                if (target.tagName === 'TEXTAREA') {
                    const start = target.selectionStart;
                    const end = target.selectionEnd;
                    const value = target.value;

                    target.value = value.substring(0, start) + "\n" + value.substring(end);
                    target.selectionStart = target.selectionEnd = start + 1;
                    target.dispatchEvent(new Event('input', { bubbles: true }));
                } else if (target.isContentEditable) {
                    document.execCommand('insertLineBreak');
                }
            }
        }
    }, true);

    // 2. 툴바 버튼 삽입 함수
    function injectEnterToggleButton() {
        // 이미 버튼이 있으면 중복 생성 방지
        if (document.getElementById('enter-toggle-btn')) return;

        const btnContainer = document.querySelector('.flex.items-center.space-x-2');
        if (!btnContainer) return;

        const recommendBtn = Array.from(btnContainer.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('추천답변'));
        const capBtn = document.getElementById('cap-toolbar-btn'); // 다른 유저스크립트 버튼 기준점

        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'enter-toggle-btn';
        // 보내주신 스타일 그대로 적용
        toggleBtn.className = "relative inline-flex items-center gap-1 rounded-full text-sm font-medium transition-colors border border-border bg-card text-line-gray-1 hover:bg-secondary p-0 size-7 justify-center ml-1";

        // 버튼 아이콘 업데이트 함수
        const updateButtonIcon = () => {
            // 막힘 상태면 🚫(또는 X), 허용 상태면 ↵ 아이콘 표시
            const currentIcon = isEnterBlocked ? '🚫' : '↵';
            toggleBtn.innerHTML = `<span title="엔터 전송 토글" style="font-size: 14px; margin-top: 1px;">${currentIcon}</span>`;

            // 시각적으로 현재 상태를 더 잘 보여주기 위해 배경색 변경 (선택 사항)
            if (isEnterBlocked) {
                toggleBtn.style.backgroundColor = '#fee2e2'; // 옅은 붉은색 (막힘)
                toggleBtn.style.color = '#991b1b';
            } else {
                toggleBtn.style.backgroundColor = 'transparent'; // 원래 배경색 (허용)
                toggleBtn.style.color = 'inherit';
            }
        };

        // 초기 아이콘 설정
        updateButtonIcon();

        // 클릭 시 상태 변경 이벤트
        const toggleEnter = (e) => {
            e.preventDefault();
            isEnterBlocked = !isEnterBlocked; // 상태 반전
            updateButtonIcon(); // 아이콘 새로고침
        };

        toggleBtn.addEventListener('click', toggleEnter);
        toggleBtn.addEventListener('touchstart', toggleEnter, { passive: false });

        // 버튼 위치 삽입 로직 (보내주신 코드 유지)
        const targetBtn = capBtn || recommendBtn;
        if (targetBtn && targetBtn.parentNode) {
            if(targetBtn === recommendBtn) {
                targetBtn.parentNode.insertBefore(toggleBtn, targetBtn);
            } else {
                targetBtn.parentNode.insertBefore(toggleBtn, targetBtn.nextSibling);
            }
        } else {
            btnContainer.appendChild(toggleBtn);
        }
    }

    // 3. 채팅창이 로드될 때마다 버튼을 다시 넣어주기 위한 관찰자 (React 사이트 특성 대응)
    const observer = new MutationObserver(() => {
        injectEnterToggleButton();
    });

    // body 내부에 변화가 생길 때마다 버튼이 있는지 확인
    observer.observe(document.body, { childList: true, subtree: true });

})();
