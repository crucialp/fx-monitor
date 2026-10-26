// 봇(자동 접속) 판정 — 금리 모니터(rate-monitor/worker/src/admin.js 의 isBot)와 똑같은 규칙을 복사해 둔 것.
// 두 사이트 방문 수를 같은 기준으로 세려는 것이므로, 금리 모니터 규칙을 바꾸면 여기도 같이 바꾼다.
// 1) UA 에 봇·스캐너 이름 2) 위장된 UA 3) 데이터센터·클라우드 회선(AWS, Google Cloud 등)에서 온 접속.
const BOT_UA = /bot|crawl|spider|slurp|preview|scrap|facebookexternalhit|embedly|discord|slack|telegram|whatsapp|headless|curl|wget|python|go-http|java\/|okhttp|axios|node-fetch|monitor|uptime|measurement|checker|discovery|enricher|research|scanner|httpx|zgrab|masscan|nmap|nuclei/i;
const FAKE_UA = /^Mozilla\/5\.0 \([^)]*\) Chrome\/[\d.]+$/; // AppleWebKit 없이 Chrome 만 붙인 위장 UA
const DATACENTER = /amazon|google|microsoft|azure|ovh|hetzner|digitalocean|scaleway|linode|akamai|vultr|choopa|oracle|alibaba|tencent|huawei cloud|contabo|leaseweb|m247|driftnet|techoff|virtualine|egihosting|interserver|datacamp|cdn77|hostinger|ionos|netcup|colocrossing|psychz|quadranet|tc datacenter|techties|code200|cloudflare|fastly|wgix|ipxo|aeza|stark industries|zenlayer|gcore|g-core|constant company|data ?center|hosting|server|vps|cloud|naukowa|badawczy|research|^us isp$/i;

export function isBot(ua, org) {
  if (!ua || BOT_UA.test(ua) || FAKE_UA.test(ua)) return true;
  if (/\(compatible;/i.test(ua) && !/MSIE|Trident/.test(ua)) return true; // "(compatible; 무슨봇/1.0; +주소)" 형식
  return !!org && DATACENTER.test(org);
}
