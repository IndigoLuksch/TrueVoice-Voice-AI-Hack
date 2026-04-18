"""Self-contained browser test harness.

Serves a single HTML page at GET /test that:
- creates a room
- opens the dashboard WebSocket (shows every event as it arrives)
- captures mic, downsamples 48kHz Float32 → 16kHz PCM16 via AudioWorklet
- streams 1280-byte frames to /ws/audio/patient/{room}
- lets you trigger the end-of-consult Claude report

No frontend dependency. Open http://127.0.0.1:8000/test in a browser.
"""
from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter()


_PAGE = r"""<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>TrueVoice — backend test harness</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #0b0f17; color: #e6edf3; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
  header { padding: 14px 20px; border-bottom: 1px solid #21262d; display: flex; gap: 16px; align-items: center; }
  header h1 { margin: 0; font-size: 15px; font-weight: 600; letter-spacing: 0.02em; }
  header .pill { padding: 2px 8px; border-radius: 999px; font-size: 11px; background: #1f2a3d; color: #8b949e; }
  header .pill.live { background: #0d4d1c; color: #a7f3a0; }
  header .pill.warn { background: #5a1d1d; color: #f8bcbc; }
  main { display: grid; grid-template-columns: 1fr 1fr; gap: 0; height: calc(100vh - 50px); }
  section { padding: 14px 18px; overflow: auto; }
  section + section { border-left: 1px solid #21262d; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #8b949e; margin: 0 0 10px 0; }
  button { background: #1f6feb; color: white; border: 0; padding: 8px 14px; border-radius: 6px; font: inherit; cursor: pointer; margin-right: 8px; margin-bottom: 8px; }
  button:disabled { opacity: 0.4; cursor: not-allowed; }
  button.danger { background: #da3633; }
  button.ghost { background: transparent; border: 1px solid #30363d; }
  .row { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
  .kv { color: #8b949e; }
  .kv b { color: #e6edf3; font-weight: 600; }
  #log { background: #0d1117; border: 1px solid #21262d; border-radius: 6px; padding: 8px; height: calc(100% - 180px); overflow: auto; font-size: 12px; }
  .evt { padding: 4px 6px; border-left: 3px solid #30363d; margin-bottom: 3px; background: #161b22; }
  .evt.transcript_partial { border-color: #6e7681; opacity: 0.8; font-style: italic; }
  .evt.transcript_final { border-color: #58a6ff; }
  .evt.biomarker_progress { border-color: #d29922; }
  .evt.biomarker_result { border-color: #f85149; }
  .evt.psyche_update { border-color: #a371f7; }
  .evt.concordance_flag { border-color: #f85149; background: #2d0d0d; padding: 8px; margin: 6px 0; }
  .evt.concordance_flag b { color: #f8bcbc; }
  .evt.call_status { border-color: #3fb950; }
  .evt .t { color: #8b949e; font-size: 11px; margin-right: 8px; }
  .evt .type { color: #8b949e; font-size: 11px; margin-right: 8px; }
  #meter { width: 200px; height: 6px; background: #21262d; border-radius: 3px; overflow: hidden; display: inline-block; vertical-align: middle; margin-left: 8px; }
  #meter > div { height: 100%; background: linear-gradient(90deg, #3fb950, #d29922, #f85149); width: 0%; transition: width 50ms linear; }
  #report { background: #0d1117; border: 1px solid #21262d; border-radius: 6px; padding: 16px; white-space: pre-wrap; height: calc(100% - 80px); overflow: auto; }
  #report h2.md { color: #e6edf3; font-size: 14px; margin-top: 14px; text-transform: none; letter-spacing: 0; }
  code { background: #161b22; padding: 1px 4px; border-radius: 3px; }
</style>
</head>
<body>
<header>
  <h1>TrueVoice test harness</h1>
  <span class="pill" id="backend-pill">backend: checking…</span>
  <span class="pill" id="room-pill">no room</span>
  <span class="pill" id="audio-pill">audio: idle</span>
  <span class="pill" id="dash-pill">dashboard: idle</span>
  <span id="meter"><div></div></span>
</header>
<main>
  <section>
    <h2>Controls</h2>
    <div class="row">
      <button id="btn-new">New room</button>
      <button id="btn-start" disabled>Start mic + stream</button>
      <button id="btn-stop" class="danger" disabled>Stop</button>
      <button id="btn-clear" class="ghost">Clear log</button>
    </div>
    <div class="kv">room_id: <b id="room-id">—</b></div>
    <div class="kv">frames sent: <b id="frame-count">0</b> (<span id="ms-sent">0</span> ms)</div>
    <div class="kv" style="margin-bottom: 10px;">events received: <b id="evt-count">0</b></div>
    <h2>Event log</h2>
    <div id="log"></div>
  </section>

  <section>
    <h2>End-of-consult report</h2>
    <div class="row">
      <button id="btn-report" disabled>Generate report (Claude Sonnet)</button>
      <span class="kv">status: <b id="report-status">—</b></span>
    </div>
    <div id="report">(no report yet — stop the session first, then click "Generate report")</div>
  </section>
</main>

<script>
(async function(){
  const base = location.origin;
  const wsBase = base.replace(/^http/, 'ws');

  const $ = id => document.getElementById(id);
  const log = $('log');

  function setPill(el, text, cls){
    el.className = 'pill' + (cls ? ' ' + cls : '');
    el.textContent = text;
  }

  function appendEvent(e){
    const div = document.createElement('div');
    div.className = 'evt ' + (e.type || 'unknown');
    const ts = e.ts_ms != null ? (e.ts_ms/1000).toFixed(1) + 's' : '';
    const t = e.type || 'unknown';
    let body = '';
    switch (t) {
      case 'transcript_partial': body = `${e.role}: <i>${escapeHtml(e.text)}</i>`; break;
      case 'transcript_final':   body = `<b>${e.role}:</b> ${escapeHtml(e.text)}`; break;
      case 'biomarker_progress': body = `${e.model}.${e.name}: ${e.speech_seconds.toFixed(1)}s / ${e.trigger_seconds.toFixed(1)}s`; break;
      case 'biomarker_result':   body = `${e.model}.${e.name} = <b>${e.value.toFixed(2)}</b>`; break;
      case 'psyche_update':      body = 'affect: ' + Object.entries(e.affect).map(([k,v])=>`${k}=${v.toFixed(2)}`).join(' '); break;
      case 'concordance_flag':   body = `🚩 matched "<b>${escapeHtml(e.matched_phrase)}</b>" in "${escapeHtml(e.utterance_text)}"<br>gloss: <b>${escapeHtml(e.claude_gloss)}</b>`; break;
      case 'call_status':        body = `${e.status} (peers=${e.peers})`; break;
      default: body = escapeHtml(JSON.stringify(e));
    }
    div.innerHTML = `<span class="t">${ts}</span><span class="type">${t}</span>${body}`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    evtCount++;
    $('evt-count').textContent = evtCount;
  }

  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // Backend health
  try {
    const r = await fetch(base + '/health');
    setPill($('backend-pill'), r.ok ? 'backend: up' : 'backend: down', r.ok ? 'live' : 'warn');
  } catch { setPill($('backend-pill'), 'backend: unreachable', 'warn'); }

  let roomId = null;
  let audioWs = null, dashWs = null, ctx = null, mediaStream = null, node = null;
  let frameCount = 0;
  let evtCount = 0;

  $('btn-new').onclick = async () => {
    const r = await fetch(base + '/api/rooms', { method: 'POST' }).then(r => r.json());
    roomId = r.room_id;
    $('room-id').textContent = roomId;
    setPill($('room-pill'), 'room: ' + roomId);
    $('btn-start').disabled = false;
    $('btn-report').disabled = false;

    if (dashWs) try { dashWs.close(); } catch {}
    dashWs = new WebSocket(`${wsBase}/ws/dashboard/${roomId}`);
    dashWs.onopen  = () => setPill($('dash-pill'), 'dashboard: live', 'live');
    dashWs.onclose = () => setPill($('dash-pill'), 'dashboard: closed', 'warn');
    dashWs.onerror = () => setPill($('dash-pill'), 'dashboard: error', 'warn');
    dashWs.onmessage = (m) => { try { appendEvent(JSON.parse(m.data)); } catch(e) {} };
  };

  $('btn-clear').onclick = () => { log.innerHTML=''; evtCount=0; $('evt-count').textContent=0; };

  $('btn-start').onclick = async () => {
    $('btn-start').disabled = true;
    $('btn-stop').disabled = false;
    frameCount = 0; $('frame-count').textContent = 0; $('ms-sent').textContent = 0;

    ctx = new AudioContext({ sampleRate: 48000 });
    if (ctx.sampleRate !== 48000) {
      alert('Browser did not honor 48kHz sample rate; downsampling will be wrong.');
    }
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });

    // AudioWorklet as a Blob so this page stays single-file.
    const workletCode = `
      class PcmWorklet extends AudioWorkletProcessor {
        constructor(){ super(); this.inBuf = new Float32Array(0); this.outBuf = new Int16Array(0); }
        process(inputs){
          const x = inputs[0]?.[0]; if (!x) return true;
          const merged = new Float32Array(this.inBuf.length + x.length);
          merged.set(this.inBuf); merged.set(x, this.inBuf.length);
          const usable = Math.floor(merged.length / 3) * 3;
          const dec = new Int16Array(usable / 3);
          for (let i=0,j=0; i<usable; i+=3, j++) {
            const a = (merged[i] + merged[i+1] + merged[i+2]) / 3;
            dec[j] = Math.max(-1, Math.min(1, a)) * 0x7FFF;
          }
          this.inBuf = merged.slice(usable);
          const m2 = new Int16Array(this.outBuf.length + dec.length);
          m2.set(this.outBuf); m2.set(dec, this.outBuf.length);
          const FRAME = 640; let off = 0;
          while (m2.length - off >= FRAME) {
            const f = m2.slice(off, off + FRAME);
            this.port.postMessage(f.buffer, [f.buffer]);
            off += FRAME;
          }
          this.outBuf = m2.slice(off);
          return true;
        }
      }
      registerProcessor('pcm-worklet', PcmWorklet);
    `;
    const url = URL.createObjectURL(new Blob([workletCode], { type: 'application/javascript' }));
    await ctx.audioWorklet.addModule(url);

    // Mic level meter (independent AnalyserNode).
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    const meterData = new Uint8Array(analyser.frequencyBinCount);
    const src = ctx.createMediaStreamSource(mediaStream);
    src.connect(analyser);

    node = new AudioWorkletNode(ctx, 'pcm-worklet');
    src.connect(node);

    audioWs = new WebSocket(`${wsBase}/ws/audio/patient/${roomId}`);
    audioWs.binaryType = 'arraybuffer';
    audioWs.onopen  = () => setPill($('audio-pill'), 'audio: streaming', 'live');
    audioWs.onclose = (e) => setPill($('audio-pill'), `audio: closed (${e.code})`, e.code === 1000 ? '' : 'warn');
    audioWs.onerror = () => setPill($('audio-pill'), 'audio: error', 'warn');

    node.port.onmessage = (e) => {
      if (audioWs && audioWs.readyState === 1) {
        audioWs.send(e.data);
        frameCount++;
        if (frameCount % 5 === 0) {
          $('frame-count').textContent = frameCount;
          $('ms-sent').textContent = frameCount * 40;
        }
      }
    };

    // Animate meter.
    (function drawMeter(){
      if (!ctx || ctx.state === 'closed') return;
      analyser.getByteTimeDomainData(meterData);
      let peak = 0;
      for (let i=0;i<meterData.length;i++) peak = Math.max(peak, Math.abs(meterData[i] - 128));
      document.querySelector('#meter > div').style.width = Math.min(100, (peak / 128) * 300) + '%';
      requestAnimationFrame(drawMeter);
    })();
  };

  $('btn-stop').onclick = () => {
    $('btn-start').disabled = false;
    $('btn-stop').disabled = true;
    try { audioWs && audioWs.close(); } catch {}
    try { node && node.disconnect(); } catch {}
    try { mediaStream && mediaStream.getTracks().forEach(t => t.stop()); } catch {}
    try { ctx && ctx.close(); } catch {}
    audioWs = null; node = null; mediaStream = null; ctx = null;
    setPill($('audio-pill'), 'audio: stopped');
  };

  $('btn-report').onclick = async () => {
    if (!roomId) return;
    $('report-status').textContent = 'generating…';
    $('report').textContent = '(calling Claude Sonnet, this can take ~3-8s)';
    try {
      const post = await fetch(`${base}/api/report/${roomId}`, { method: 'POST' });
      if (!post.ok) throw new Error(`POST ${post.status}`);
      const r = await fetch(`${base}/api/report/${roomId}`).then(r => r.json());
      $('report-status').textContent = `generated at ${new Date(r.generated_at_ms).toLocaleTimeString()} — ${r.duration_sec}s session, ${r.flags.length} flags`;
      // naive markdown-ish rendering: convert ## headings and line breaks
      const html = r.markdown
        .replace(/</g, '&lt;')
        .replace(/^## (.+)$/gm, '<h2 class="md">$1</h2>')
        .replace(/\n/g, '<br>');
      $('report').innerHTML = html;
    } catch (e) {
      $('report-status').textContent = 'error';
      $('report').textContent = 'error: ' + e.message;
    }
  };
})();
</script>
</body>
</html>
"""


@router.get("/test", response_class=HTMLResponse, include_in_schema=False)
def test_page() -> str:
    return _PAGE
