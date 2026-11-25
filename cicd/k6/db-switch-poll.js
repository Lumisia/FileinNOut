// 임시: DB 이전 중 File in & Out 백엔드가 어느 DB(server_id)에 붙어 있는지 0.1초마다 확인한다.
// 옛 DB = server_id 1, 새 DB = server_id 2. 끝나면 같은 상태를 묶은 시간표를 출력한다.
//
// 실행 (PC):  k6 run -q --log-format=raw -e MINUTES=15 db-switch-poll.js
// Ctrl+C로 중간에 끊으면 마지막 시간표는 안 나오고, 실행 중 출력된 상태 변화 줄만 남는다.
import http from 'k6/http';
import { sleep } from 'k6';

const MINUTES = Number(__ENV.MINUTES || 15);
const URL = 'https://lumisia.fileinnout.com/api/test/db-identity';

export const options = {
  hosts: { 'lumisia.fileinnout.com': '140.245.74.217' }, // Cloudflare를 거치지 않고 원본 서버로 직접
  insecureSkipTLSVerify: true, // 원본 서버 인증서는 Cloudflare 전용이라 PC가 신뢰하지 않음
  scenarios: {
    poll: { executor: 'per-vu-iterations', vus: 1, iterations: 1, maxDuration: `${MINUTES + 1}m` },
  },
};

const pad = (n) => String(n).padStart(2, '0');
const clock = (ms) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${Math.floor(d.getMilliseconds() / 100)}`;
};

function check(res) {
  if (res.status !== 200) return { server: 0, label: `실패(${res.status || res.error_code})` };
  try {
    const body = res.json();
    return { server: Number(body.serverId), label: `serverId=${body.serverId}  readOnly=${body.readOnly}` };
  } catch (e) {
    return { server: 0, label: '실패(응답 형식)' };
  }
}

export default function () {
  const end = Date.now() + MINUTES * 60 * 1000;
  const samples = [];
  let last = '';
  while (Date.now() < end) {
    const t = Date.now();
    const state = check(http.get(URL, { timeout: '2s' }));
    samples.push({ t: t, server: state.server, label: state.label });
    if (state.label !== last) {
      console.log(`${clock(t)}  ${state.label}`); // 상태가 바뀔 때만 실시간 출력
      last = state.label;
    }
    sleep(0.1);
  }
  printTimeline(samples);
}

function runs(s, from, to) {
  const out = [];
  for (let i = from; i < to; i++) {
    const r = out[out.length - 1];
    if (r && r.label === s[i].label) {
      r.end = s[i].t;
      r.n++;
    } else {
      out.push({ label: s[i].label, server: s[i].server, start: s[i].t, end: s[i].t, n: 1 });
    }
  }
  return out;
}

function note(r) {
  if (r.server === 0) return '← 요청 실패';
  if (r.label.indexOf('readOnly=1') >= 0) return '← 쓰기 중지';
  if (r.server === 2) return '← 새 DB';
  return '';
}

function line(start, end, label, n, memo) {
  return `${clock(start)} ~ ${clock(end)}   ${label.padEnd(24)} ${String(n).padStart(5)}건   ${memo}`;
}

function printTimeline(s) {
  if (s.length === 0) return;
  // 롤링 재시작 중에는 옛 파드(1)와 새 파드(2)가 번갈아 응답한다 → 첫 2부터 마지막 1까지를 "섞임"으로 묶는다.
  const first2 = s.findIndex((x) => x.server === 2);
  let last1 = -1;
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i].server === 1) { last1 = i; break; }
  }
  const mixed = first2 >= 0 && last1 > first2;

  const out = ['', '===== DB 전환 시간표 ====='];
  const add = (from, to) => runs(s, from, to).forEach((r) => out.push(line(r.start, r.end, r.label, r.n, note(r))));
  if (mixed) {
    add(0, first2);
    const fails = s.slice(first2, last1 + 1).filter((x) => x.server === 0).length;
    out.push(line(s[first2].t, s[last1].t, '1과 2가 섞임', last1 - first2 + 1, `← 롤링 재시작 중 (실패 ${fails}건)`));
    add(last1 + 1, s.length);
  } else {
    add(0, s.length);
  }
  const totalFail = s.filter((x) => x.server === 0).length;
  out.push(`총 ${s.length}건 / 실패 ${totalFail}건`);
  console.log(out.join('\n'));
}
