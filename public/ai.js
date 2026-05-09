

(() => {
  const input        = document.getElementById('user-input');
  const chatBox      = document.getElementById('chat-box');
  const sendButton   = document.getElementById('send-btn');
  const form         = document.getElementById('input-form');
  const inputShell   = document.querySelector('.input-shell');
  const welcome      = document.getElementById('welcome-state');
  const scrollFab    = document.getElementById('scroll-fab');
  const toastRoot    = document.getElementById('toast-root');
  const chips        = document.querySelectorAll('.chip');

  /* ---------- Helpers ---------- */
  const scrollToBottom = (smooth = true) => {
    chatBox.scrollTo({
      top: chatBox.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
  };

  const hideWelcome = () => {
    if (welcome && !welcome.classList.contains('is-hidden')) {
      welcome.classList.add('is-hidden');
    }
  };

  const escapeHtml = (s) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const createMessage = (text, sender, opts = {}) => {
    const wrap   = document.createElement('div');
    wrap.className = `message ${sender}${opts.error ? ' is-error' : ''}`;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = sender === 'user' ? 'You' : 'AI';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = escapeHtml(text).replace(/\n/g, '<br/>');

    wrap.appendChild(avatar);
    wrap.appendChild(bubble);
    chatBox.appendChild(wrap);
    requestAnimationFrame(() => scrollToBottom(true));
    return wrap;
  };

  const createLoading = () => {
    const wrap   = document.createElement('div');
    wrap.className = 'message bot loading-message';

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = 'AI';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = `
      <span class=\"loading-text\">Thinking</span>
      <div class=\"loading\" aria-hidden=\"true\">
        <span></span><span></span><span></span>
      </div>
    `;

    wrap.appendChild(avatar);
    wrap.appendChild(bubble);
    chatBox.appendChild(wrap);
    requestAnimationFrame(() => scrollToBottom(true));
    return wrap;
  };

  /* ---------- Toast ---------- */
  const showToast = ({ title = 'Something went wrong', message = '', kind = 'error' } = {}) => {
    const t = document.createElement('div');
    t.className = `toast is-${kind}`;
    t.setAttribute('role', 'alert');
    t.innerHTML = `
      <span class=\"toast-icon\" aria-hidden=\"true\">
        <svg viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">
          <circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 8v4\"/><path d=\"M12 16h.01\"/>
        </svg>
      </span>
      <div>
        <p class=\"toast-title\">${escapeHtml(title)}</p>
        <p class=\"toast-msg\">${escapeHtml(message)}</p>
      </div>
    `;
    toastRoot.appendChild(t);
    setTimeout(() => {
      t.classList.add('is-out');
      t.addEventListener('animationend', () => t.remove(), { once: true });
    }, 4200);
  };

  /* ---------- Auto-grow textarea ---------- */
  const autoGrow = () => {
    input.style.height = 'auto';
    const max = 180;
    input.style.height = Math.min(input.scrollHeight, max) + 'px';
  };
  input.addEventListener('input', autoGrow);

  /* ---------- Send flow ---------- */
  const setBusy = (busy) => {
    input.disabled = busy;
    sendButton.disabled = busy;
    sendButton.classList.toggle('is-loading', busy);
    inputShell.classList.toggle('is-disabled', busy);
  };

  const sendMessage = async () => {
    const userText = input.value.trim();
    if (!userText) return;

    hideWelcome();
    createMessage(userText, 'user');

    input.value = '';
    autoGrow();

    setBusy(true);

    const loadingNode = createLoading();

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userText }),
      });

      let data = {};
      try { data = await response.json(); } catch { throw new Error('Invalid server response'); }

      loadingNode.remove();

      if (!response.ok) {
        throw new Error(data.message || `Server error (${response.status})`);
      }

      const botReply = (data.response && String(data.response).trim()) || 'No response received.';
      createMessage(botReply, 'bot');
    } catch (error) {
      loadingNode.remove();
      const msg = error?.message || 'Unexpected error';
      createMessage(`Error: ${msg}`, 'bot', { error: true });
      showToast({ title: 'Request failed', message: msg, kind: 'error' });
      console.error(error);
    } finally {
      setBusy(false);
      input.focus();
      requestAnimationFrame(() => scrollToBottom(true));
    }
  };

  /* ---------- Form submit + Enter key ---------- */
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage();
  });

  input.addEventListener('keydown', (e) => {
    // Enter to send, Shift+Enter for newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  /* ---------- Suggestion chips ---------- */
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const prompt = chip.getAttribute('data-prompt') || '';
      input.value = prompt;
      autoGrow();
      input.focus();
      // Light haptic-feel: tiny nudge then send
      sendMessage();
    });
  });

  /* ---------- Scroll FAB visibility ---------- */
  const updateFab = () => {
    const distFromBottom = chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight;
    const show = distFromBottom > 120;
    if (show) {
      scrollFab.hidden = false;
      requestAnimationFrame(() => scrollFab.setAttribute('data-show', 'true'));
    } else {
      scrollFab.setAttribute('data-show', 'false');
      // hide after transition
      setTimeout(() => {
        if (scrollFab.getAttribute('data-show') === 'false') scrollFab.hidden = true;
      }, 220);
    }
  };
  chatBox.addEventListener('scroll', updateFab, { passive: true });
  scrollFab.addEventListener('click', () => scrollToBottom(true));

  /* ---------- Cmd/Ctrl + K to focus ---------- */
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      input.focus();
      input.select?.();
    }
  });

  /* ---------- Subtle parallax on orbs (desktop only) ---------- */
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduceMotion && window.matchMedia('(pointer: fine)').matches) {
    const orbs = document.querySelectorAll('.orb');
    let raf = 0, tx = 0, ty = 0, cx = 0, cy = 0;
    window.addEventListener('mousemove', (e) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 14;
      ty = (e.clientY / window.innerHeight - 0.5) * 14;
      if (!raf) raf = requestAnimationFrame(tick);
    });
    const tick = () => {
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      orbs.forEach((o, i) => {
        const k = (i + 1) * 0.6;
        o.style.translate = `${cx * k}px ${cy * k}px`;
      });
      if (Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0;
      }
    };
  }

  // Focus input on load
  window.addEventListener('load', () => {
    setTimeout(() => input.focus(), 200);
  });
})();
