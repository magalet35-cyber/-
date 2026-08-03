// ==UserScript==
// @name         크랙 엔터 방지
// @match        https://crack.wrtn.ai/*
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  엔터키 전송 방지 기능을 켜고 끌 수 있는 버튼을 툴바에 추가합니다. 활성화/비활성화 상태에 따라 커스텀 아이콘을 표시합니다.
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 기능 켜짐/꺼짐 상태 변수 (기본값: true = 엔터 방지 켜짐)
    let isEnterBlocked = true;

    // 꾹 누르기 타이머 관련 변수
    let enterTimer = null;
    let isLongPress = false;
    const LONG_PRESS_TIME = 500; // 500ms(0.5초) 동안 누르고 있으면 전송

    // 텍스트어레이나 입력창에 안전하게 줄바꿈을 넣는 함수 (이전 버전 유지)
    function insertNewline(target) {
        if (!target) return;

        const tagName = target.tagName;

        // 1. TEXTAREA 또는 INPUT인 경우
        if (tagName === 'TEXTAREA' || tagName === 'INPUT') {
            const start = target.selectionStart;
            const end = target.selectionEnd;
            const value = target.value;
            const newValue = value.substring(0, start) + "\n" + value.substring(end);

            // React 상태 감시를 우회하여 값 변경
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set
                                        || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
            if (nativeInputValueSetter) {
                nativeInputValueSetter.call(target, newValue);
            } else {
                target.value = newValue;
            }

            target.selectionStart = target.selectionEnd = start + 1;
            target.dispatchEvent(new Event('input', { bubbles: true }));
            target.dispatchEvent(new Event('change', { bubbles: true }));
        }
        // 2. contenteditable (div 등)인 경우
        else if (target.isContentEditable || tagName === 'DIV') {
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                range.deleteContents();
                const textNode = document.createTextNode('\n');
                range.insertNode(textNode);
                range.setStartAfter(textNode);
                range.setEndAfter(textNode);
                selection.removeAllRanges();
                selection.addRange(range);
                target.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
    }

    // 1. 키보드 누를 때 (keydown) (이전 버전 유지)
    document.addEventListener('keydown', function(e) {
        if (!isEnterBlocked) return;

        if (e.key === 'Enter' && !e.shiftKey) {
            const target = e.target;

            if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable || target.tagName === 'DIV') {
                if (e.repeat) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }

                e.stopPropagation();
                e.preventDefault();

                isLongPress = false;

                // 타이머 시작 (0.5초 이상 누르고 있으면 전송)
                enterTimer = setTimeout(() => {
                    isLongPress = true;

                    isEnterBlocked = false;
                    const enterEvent = new KeyboardEvent('keydown', {
                        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
                    });
                    target.dispatchEvent(enterEvent);
                    isEnterBlocked = true;
                }, LONG_PRESS_TIME);
            }
        }
    }, true);

    // 2. 키보드에서 손을 뗄 때 (keyup) (이전 버전 유지)
    document.addEventListener('keyup', function(e) {
        if (!isEnterBlocked) return;

        if (e.key === 'Enter' && !e.shiftKey) {
            const target = e.target;

            if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable || target.tagName === 'DIV') {
                e.stopPropagation();
                e.preventDefault();

                if (enterTimer) {
                    clearTimeout(enterTimer);
                    enterTimer = null;
                }

                // 0.5초가 되기 전에 손을 뗐다면 (짧게 누르기) -> 줄바꿈 실행
                if (!isLongPress) {
                    insertNewline(target);
                }
            }
        }
    }, true);

    // 3. 툴바 버튼 삽입 및 아이콘 업데이트 함수 (수정된 부분)
    function injectEnterToggleButton() {
        if (document.getElementById('enter-toggle-btn')) return;

        const btnContainer = document.querySelector('.flex.items-center.space-x-2');
        if (!btnContainer) return;

        const recommendBtn = Array.from(btnContainer.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('추천답변'));
        const capBtn = document.getElementById('cap-toolbar-btn');

        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'enter-toggle-btn';
        // 보내주신 스타일 그대로 적용
        toggleBtn.className = "relative inline-flex items-center gap-1 rounded-full text-sm font-medium transition-colors border border-border bg-card text-line-gray-1 hover:bg-secondary p-0 size-7 justify-center ml-1";
        toggleBtn.style.overflow = 'hidden'; // 아이콘이 버튼 경계를 넘지 않도록

        // 버튼 아이콘 업데이트 함수 (핵심 수정)
        const updateButtonIcon = () => {
            let iconHtml = '';

            if (isEnterBlocked) {
                // 활성화 상태: '↵' (검은색, 굵게)
                iconHtml = `<span style="font-size: 16px; color: black; font-weight: bold; line-height: 1;">↵</span>`;
                toggleBtn.style.backgroundColor = '#FFFFFF';
                toggleBtn.style.color = '#991b1b';
            } else {
                // 비활성화 상태: 복합 아이콘
                iconHtml = `
                    <div style="position: relative; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center;">
                        <!-- 기본 엔터 기호 (검은색) -->
                        <span style="position: absolute; font-size: 16px; color: black; line-height: 1;">↵</span>

                        <!-- 겹쳐지는 빨간색 X 선 -->
                        <div style="position: absolute; width: 100%; height: 3px; background-color: red; transform: rotate(45deg);"></div>
                        <div style="position: absolute; width: 100%; height: 3px; background-color: red; transform: rotate(-45deg);"></div>
                    </div>
                `;
                // CSS 선을 사용하여 사용자의 스케치와 더 유사한 모양을 만듭니다.

                toggleBtn.style.backgroundColor = 'transparent';
                toggleBtn.style.color = 'inherit';
            }

            // 버튼 자체에 title 설정
            toggleBtn.setAttribute('title', isEnterBlocked ? '엔터 차단 중 (짧게=줄바꿈, 꾹=전송)' : '엔터 차단 해제');
            // 아이콘 크기를 버튼 크기에 맞게 조정하기 위해 부모 div를 추가합니다.
            toggleBtn.innerHTML = `
                <div style="width: 16px; height: 16px; display: flex; justify-content: center; align-items: center; margin-top: 1px;">
                    ${iconHtml}
                </div>
            `;
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

        // 버튼 위치 삽입 로직 (이전 버전 유지)
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

    // 채팅창이 로드될 때마다 버튼을 다시 넣어주기 위한 관찰자 (React 사이트 특성 대응)
    const observer = new MutationObserver(() => {
        injectEnterToggleButton();
    });

    // body 내부에 변화가 생길 때마다 버튼이 있는지 확인
    observer.observe(document.body, { childList: true, subtree: true });

})();
