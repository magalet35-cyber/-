// ==UserScript==
// @name         크랙 엔터 방지
// @match        https://crack.wrtn.ai/*
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  엔터키 전송 방지 기능을 온오프/짧게 누르면 줄바꾸기, 길게 누르면 전송
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 기능 켜짐/꺼짐 상태 변수
    let isEnterBlocked = true;

    // 꾹 누르기 타이머 관련 변수
    let enterTimer = null;
    let isLongPress = false;
    const LONG_PRESS_TIME = 500; // 0.5초 동안 누르고 있으면 전송

    // 텍스트어레이나 입력창에 안전하게 줄바꿈을 넣는 함수
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

    // 1. 키보드 누를 때 (keydown)
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

    // 2. 키보드에서 손을 뗄 때 (keyup)
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

    // 3. 툴바 버튼 삽입 함수
    function injectEnterToggleButton() {
        if (document.getElementById('enter-toggle-btn')) return;

        const btnContainer = document.querySelector('.flex.items-center.space-x-2');
        if (!btnContainer) return;

        const recommendBtn = Array.from(btnContainer.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('추천답변'));
        const capBtn = document.getElementById('cap-toolbar-btn');

        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'enter-toggle-btn';
        toggleBtn.className = "relative inline-flex items-center gap-1 rounded-full text-sm font-medium transition-colors border border-border bg-card text-line-gray-1 hover:bg-secondary p-0 size-7 justify-center ml-1";
        
        const updateButtonIcon = () => {
            const currentIcon = isEnterBlocked ? '🚫' : '↵';
            toggleBtn.innerHTML = `<span title="엔터 전송 토글" style="font-size: 14px; margin-top: 1px;">${currentIcon}</span>`;
            
            if (isEnterBlocked) {
                toggleBtn.style.backgroundColor = '#fee2e2'; 
                toggleBtn.style.color = '#991b1b';
            } else {
                toggleBtn.style.backgroundColor = 'transparent'; 
                toggleBtn.style.color = 'inherit';
            }
        };

        updateButtonIcon();
        
        const toggleEnter = (e) => {
            e.preventDefault();
            isEnterBlocked = !isEnterBlocked; 
            updateButtonIcon(); 
        };

        toggleBtn.addEventListener('click', toggleEnter);
        toggleBtn.addEventListener('touchstart', toggleEnter, { passive: false });

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

    const observer = new MutationObserver(() => {
        injectEnterToggleButton();
    });
    
    observer.observe(document.body, { childList: true, subtree: true });

})();
