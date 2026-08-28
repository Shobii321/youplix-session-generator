const nodeCrypto = require('crypto');
if (!globalThis.crypto) {
    globalThis.crypto = nodeCrypto.webcrypto || nodeCrypto;
}
if (!global.crypto) {
    global.crypto = globalThis.crypto;
}

const http = require('http');
const fs = require('fs');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, Browsers, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');

const PORT = process.env.PORT || 3000;
const activeSockets = new Map();

function formatPhoneNumber(input) {
    let clean = (input || '').replace(/[^0-9]/g, '');
    if (clean.startsWith('03')) clean = '92' + clean.slice(1);
    else if (clean.startsWith('0092')) clean = '92' + clean.slice(4);
    return clean;
}

function cleanupSocket(phone) {
    const item = activeSockets.get(phone);
    if (!item) return;
    try {
        if (item.sock) {
            item.sock.ev.removeAllListeners('connection.update');
            item.sock.ev.removeAllListeners('creds.update');
            try { item.sock.end(); } catch (e) {}
        }
    } catch (e) {}
    try {
        if (item.tempDir && fs.existsSync(item.tempDir)) {
            fs.rmSync(item.tempDir, { recursive: true, force: true });
        }
    } catch (e) {}
    activeSockets.delete(phone);
}

async function startPairingSession(phone) {
    const cleanPhone = formatPhoneNumber(phone);
    if (!cleanPhone || cleanPhone.length < 9) {
        return { success: false, message: 'Please enter a valid phone number with country code (e.g. 923270321760)' };
    }

    if (activeSockets.has(cleanPhone)) cleanupSocket(cleanPhone);

    const tempDir = path.join(process.cwd(), 'temp_sessions', `pair_${cleanPhone}_${Date.now()}`);
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(tempDir);

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: Browsers.ubuntu('Chrome'),
        printQRInTerminal: false,
        syncFullHistory: false
    });

    const sessionData = {
        sock,
        tempDir,
        status: 'requesting',
        code: null,
        sessionId: null,
        error: null,
        createdAt: Date.now()
    };
    activeSockets.set(cleanPhone, sessionData);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection } = update;

        if (connection === 'open') {
            console.log(`🎉 [PAIRING SUCCESS]: Connected for ${cleanPhone}!`);
            try {
                await delay(1500);
                const credsPath = path.join(tempDir, 'creds.json');
                if (fs.existsSync(credsPath)) {
                    const raw = fs.readFileSync(credsPath, 'utf-8');
                    const sessionId = 'YOUPLIX~' + Buffer.from(raw).toString('base64');
                    sessionData.sessionId = sessionId;
                    sessionData.status = 'connected';

                    const myJid = (sock.user?.id ? sock.user.id.split(':')[0] : cleanPhone) + '@s.whatsapp.net';
                    const dmMessage = 
`╔══════════════════════════════════╗
║  👑 *YOUPLIX SESSION GENERATOR*  ║
╚══════════════════════════════════╝

🎉 *CONGRATULATIONS! YOUR WHATSAPP IS LINKED!*

🔑 *YOUR REUSABLE SESSION ID:*
\`\`\`${sessionId}\`\`\`

📌 *How to Deploy:*
1. Copy this Session ID.
2. In your bot folder, open config.json and set:
   "sessionId": "${sessionId}"
3. Run node bot.js on RDP, VPS, Heroku or Render!
   Bot will connect instantly with ZERO QR scanning!

⚠️ *Never share your session ID with strangers.*
👑 *Bot Engine Created By:* Shobii (03270321760)`;

                    try {
                        await sock.sendMessage(myJid, { text: dmMessage });
                        console.log(`📨 [DM SENT]: Session ID delivered to ${cleanPhone}`);
                    } catch (e) {
                        console.error('Failed to send DM:', e.message);
                    }
                }
            } catch (e) {
                sessionData.error = e.message;
            }
            setTimeout(() => cleanupSocket(cleanPhone), 120000);
        } else if (connection === 'close') {
            if (sessionData.status !== 'connected') sessionData.status = 'closed';
        }
    });

    try {
        await delay(2000);
        const rawCode = await sock.requestPairingCode(cleanPhone);
        const formatted = rawCode?.match(/.{1,4}/g)?.join('-') || rawCode;
        sessionData.code = formatted;
        sessionData.status = 'waiting';
        return { success: true, code: formatted, phone: cleanPhone };
    } catch (err) {
        cleanupSocket(cleanPhone);
        return { success: false, message: err.message || 'Failed to request code. Check number.' };
    }
}

function getWebPageHtml() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
    <title>👑 Youplix Nexus — WhatsApp Session Generator</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #00e676;
            --primary-dim: rgba(0, 230, 118, 0.12);
            --primary-glow: rgba(0, 230, 118, 0.28);
            --cyan: #38bdf8;
            --cyan-dim: rgba(56, 189, 248, 0.12);
            --bg: #07090e;
            --card-bg: rgba(15, 23, 42, 0.8);
            --border: rgba(255, 255, 255, 0.08);
            --t1: #f8fafc;
            --t2: #94a3b8;
            --t3: #475569;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', sans-serif;
            background: var(--bg);
            color: var(--t1);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            overflow-x: hidden;
            position: relative;
        }
        .orb { position: fixed; border-radius: 50%; filter: blur(120px); pointer-events: none; z-index: 1; }
        .o1 { width: 600px; height: 600px; background: rgba(0, 230, 118, 0.08); top: -200px; right: -100px; }
        .o2 { width: 500px; height: 500px; background: rgba(56, 189, 248, 0.08); bottom: -150px; left: -100px; }

        .container { position: relative; z-index: 10; width: 100%; max-width: 500px; }
        .header-badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 5px 14px;
            border-radius: 9999px;
            background: var(--primary-dim);
            border: 1px solid rgba(0, 230, 118, 0.3);
            color: var(--primary);
            font-size: 0.75rem;
            font-weight: 700;
            font-family: 'JetBrains Mono', monospace;
            margin-bottom: 16px;
        }
        .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--primary); animation: pulse 1.8s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.85); } }

        .card {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 24px;
            backdrop-filter: blur(20px);
            padding: 36px 30px;
            box-shadow: 0 35px 80px -15px rgba(0, 0, 0, 0.8);
            text-align: center;
        }
        h1 { font-size: 1.7rem; font-weight: 900; letter-spacing: -0.03em; margin-bottom: 8px; background: linear-gradient(135deg, #fff 30%, var(--cyan) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        p.subtitle { font-size: 0.88rem; color: var(--t2); line-height: 1.6; margin-bottom: 25px; }

        .steps { display: flex; justify-content: space-between; margin-bottom: 28px; position: relative; }
        .steps::before { content: ''; position: absolute; top: 14px; left: 15%; right: 15%; height: 2px; background: var(--border); z-index: 1; }
        .step { position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center; gap: 6px; }
        .step-circle { width: 28px; height: 28px; border-radius: 50%; background: #0f172a; border: 2px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 0.72rem; font-weight: 800; font-family: 'JetBrains Mono', monospace; color: var(--t3); transition: 0.3s; }
        .step.active .step-circle { border-color: var(--primary); color: var(--primary); box-shadow: 0 0 12px var(--primary-glow); }
        .step.done .step-circle { background: var(--primary); border-color: var(--primary); color: #000; }
        .step-label { font-size: 0.7rem; color: var(--t3); font-weight: 600; }
        .step.active .step-label { color: var(--primary); }

        .input-group { text-align: left; margin-bottom: 18px; }
        .input-label { font-size: 0.78rem; font-weight: 700; color: var(--t2); margin-bottom: 8px; display: block; text-transform: uppercase; letter-spacing: 0.05em; }
        .input-wrap { position: relative; }
        .input-wrap i { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: var(--cyan); font-size: 1.1rem; }
        input[type="text"] {
            width: 100%;
            padding: 15px 16px 15px 48px;
            background: rgba(15, 23, 42, 0.9);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 14px;
            color: #fff;
            font-size: 1.05rem;
            font-family: 'JetBrains Mono', monospace;
            outline: none;
            transition: all 0.2s;
        }
        input[type="text"]:focus { border-color: var(--cyan); box-shadow: 0 0 15px var(--cyan-dim); }

        .btn-submit {
            width: 100%;
            padding: 16px;
            background: linear-gradient(135deg, var(--primary) 0%, #00b0ff 100%);
            color: #050a12;
            border: none;
            border-radius: 14px;
            font-size: 0.96rem;
            font-weight: 800;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            transition: all 0.25s;
            box-shadow: 0 10px 25px -5px rgba(0, 230, 118, 0.4);
        }
        .btn-submit:hover { transform: translateY(-2px); box-shadow: 0 15px 30px -5px rgba(0, 230, 118, 0.6); }
        .btn-submit:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

        .code-box {
            display: none;
            background: rgba(2, 6, 23, 0.9);
            border: 2px solid var(--primary);
            border-radius: 18px;
            padding: 24px;
            margin-top: 24px;
            box-shadow: 0 0 35px var(--primary-glow);
        }
        .code-title { font-size: 0.8rem; font-weight: 800; text-transform: uppercase; color: var(--primary); letter-spacing: 0.1em; margin-bottom: 12px; }
        .code-display {
            font-size: 2rem;
            font-weight: 900;
            font-family: 'JetBrains Mono', monospace;
            color: #fef08a;
            letter-spacing: 4px;
            padding: 14px;
            background: rgba(0, 0, 0, 0.5);
            border-radius: 12px;
            border: 1px dashed rgba(255, 255, 255, 0.15);
            margin-bottom: 16px;
        }
        .btn-copy {
            padding: 10px 22px;
            background: rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.1);
            color: #fff;
            border-radius: 10px;
            font-size: 0.82rem;
            font-weight: 700;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }

        .instructions {
            text-align: left;
            background: rgba(15, 23, 42, 0.8);
            border-radius: 12px;
            padding: 16px;
            font-size: 0.82rem;
            color: var(--t2);
            line-height: 1.7;
            margin-top: 16px;
            border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .instructions b { color: #fff; }

        .session-box {
            display: none;
            background: rgba(6, 78, 59, 0.2);
            border: 2px solid var(--primary);
            border-radius: 18px;
            padding: 24px;
            margin-top: 24px;
            text-align: center;
        }
        .session-textarea {
            width: 100%;
            height: 95px;
            background: #020617;
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 10px;
            color: #4ade80;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.8rem;
            padding: 12px;
            outline: none;
            resize: none;
            margin: 12px 0;
        }
        .spin { display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(0,0,0,0.25); border-top-color: #000; border-radius: 50%; animation: spin 0.6s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .footer { margin-top: 25px; font-size: 0.78rem; color: var(--t3); }
    </style>
</head>
<body>
    <div class="orb o1"></div>
    <div class="orb o2"></div>

    <div class="container">
        <div class="card">
            <div class="header-badge">
                <div class="dot"></div>
                YOUPLIX NEXUS v3.0 • DIRECT PAIRING
            </div>

            <h1>WhatsApp Session Generator</h1>
            <p class="subtitle">Enter your WhatsApp phone number to get an 8-digit pairing code & instant Reusable Session ID.</p>

            <div class="steps">
                <div class="step active" id="st1">
                    <div class="step-circle" id="sc1">1</div>
                    <div class="step-label">Number</div>
                </div>
                <div class="step" id="st2">
                    <div class="step-circle" id="sc2">2</div>
                    <div class="step-label">Pair Code</div>
                </div>
                <div class="step" id="st3">
                    <div class="step-circle" id="sc3">3</div>
                    <div class="step-label">Linking</div>
                </div>
                <div class="step" id="st4">
                    <div class="step-circle" id="sc4">4</div>
                    <div class="step-label">Session ID</div>
                </div>
            </div>

            <div class="input-group">
                <label class="input-label">Phone Number (With Country Code)</label>
                <div class="input-wrap">
                    <i class="fab fa-whatsapp"></i>
                    <input type="text" id="phone" placeholder="923270321760" value="">
                </div>
            </div>

            <button class="btn-submit" id="submitBtn" onclick="requestPairing()">
                <i class="fas fa-bolt"></i> Generate 8-Digit Pairing Code
            </button>

            <div class="code-box" id="codeBox">
                <div class="code-title">🔑 Your WhatsApp Pairing Code:</div>
                <div class="code-display" id="codeDisplay">----</div>
                <button class="btn-copy" onclick="copyCode()" id="copyBtn">
                    <i class="fas fa-copy"></i> Copy Code
                </button>

                <div class="instructions">
                    <b>📱 WhatsApp Me Link Kaise Karein:</b><br>
                    1. Mobile WhatsApp open karein ➔ <b>Linked Devices</b>.<br>
                    2. <b>"Link a device"</b> par tap karein ➔ <b>"Link with phone number instead"</b>.<br>
                    3. Upar wala <b>8-digit code</b> enter karein.<br>
                    4. Code lagte hi aapko WhatsApp DM me <b>Session ID</b> mil jayegi!
                </div>
            </div>

            <div class="session-box" id="sessionBox">
                <div style="font-size: 1.8rem; margin-bottom: 6px;">🎉</div>
                <div class="code-title" style="color: #4ade80;">✅ WhatsApp Linked Successfully!</div>
                <p style="font-size: 0.8rem; color: #cbd5e1;">Session ID has been sent to your WhatsApp DM and generated below:</p>
                <textarea class="session-textarea" id="sessionVal" readonly></textarea>
                <button class="btn-submit" onclick="copySession()" style="background: #4ade80;">
                    <i class="fas fa-copy"></i> Copy Session ID
                </button>
            </div>

            <div class="footer">
                Powered by <b>Youplix VIP Bot Engine</b> • Created by Shobii (03270321760)
            </div>
        </div>
    </div>

    <script>
        let pollTimer = null;
        let activePhone = '';

        async function requestPairing() {
            const rawPhone = document.getElementById('phone').value.trim();
            if (!rawPhone) return alert('Please enter your phone number with country code!');

            const btn = document.getElementById('submitBtn');
            btn.disabled = true;
            btn.innerHTML = '<div class="spin"></div> Requesting 8-Digit Code...';

            setStep(1);

            try {
                const res = await fetch('/api/session/pair-code?number=' + encodeURIComponent(rawPhone));
                const data = await res.json();

                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-bolt"></i> Generate 8-Digit Pairing Code';

                if (data.success && data.code) {
                    activePhone = data.phone;
                    document.getElementById('codeDisplay').innerText = data.code;
                    document.getElementById('codeBox').style.display = 'block';
                    setStep(2);
                    startPolling(activePhone);
                } else {
                    alert('Error: ' + (data.message || 'Could not generate code'));
                }
            } catch (e) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-bolt"></i> Generate 8-Digit Pairing Code';
                alert('Connection error: ' + e.message);
            }
        }

        function setStep(n) {
            for (let i = 1; i <= 4; i++) {
                const st = document.getElementById('st' + i);
                const sc = document.getElementById('sc' + i);
                if (i < n) {
                    st.className = 'step done';
                    sc.innerHTML = '<i class="fas fa-check"></i>';
                } else if (i === n) {
                    st.className = 'step active';
                    sc.innerText = i;
                } else {
                    st.className = 'step';
                    sc.innerText = i;
                }
            }
        }

        function copyCode() {
            const code = document.getElementById('codeDisplay').innerText;
            navigator.clipboard.writeText(code);
            const btn = document.getElementById('copyBtn');
            btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i> Copy Code'; }, 2000);
        }

        function copySession() {
            const sId = document.getElementById('sessionVal').value;
            navigator.clipboard.writeText(sId);
            alert('✅ Session ID Copied! Ab isko apne config.json ya .env me paste karein.');
        }

        function startPolling(phone) {
            if (pollTimer) clearInterval(pollTimer);
            pollTimer = setInterval(async () => {
                try {
                    const res = await fetch('/api/session/status?number=' + encodeURIComponent(phone));
                    const data = await res.json();

                    if (data.status === 'waiting') {
                        setStep(3);
                    } else if (data.status === 'connected' && data.sessionId) {
                        clearInterval(pollTimer);
                        setStep(4);
                        document.getElementById('codeBox').style.display = 'none';
                        document.getElementById('sessionVal').value = data.sessionId;
                        document.getElementById('sessionBox').style.display = 'block';
                    }
                } catch (e) {}
            }, 2500);
        }
    </script>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = url.pathname;

    if (pathname === '/' || pathname === '/pair' || pathname === '/session') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getWebPageHtml());
        return;
    }

    if (pathname === '/api/session/pair-code' || pathname === '/code') {
        const phone = url.searchParams.get('number') || url.searchParams.get('phone');
        if (!phone) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Phone number is required' }));
            return;
        }

        const result = await startPairingSession(phone);
        res.writeHead(result.success ? 200 : 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
    }

    if (pathname === '/api/session/status') {
        const phone = url.searchParams.get('number') || url.searchParams.get('phone');
        const cleanPhone = formatPhoneNumber(phone);
        const data = activeSockets.get(cleanPhone);

        if (!data) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'not_found' }));
            return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: data.status,
            code: data.code,
            sessionId: data.sessionId || null,
            error: data.error || null
        }));
        return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
});

server.listen(PORT, () => {
    console.log(`👑 Youplix Session Generator active on port ${PORT}`);
});
