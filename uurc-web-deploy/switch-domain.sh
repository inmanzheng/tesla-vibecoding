#!/usr/bin/env bash
# 一键从「IP 自签模式」切换到「域名 + Let's Encrypt 受信证书」模式
#
# 前置条件：
#   1) 已在 DNSPod/腾讯云把域名的 A 记录指向本机公网 IP（43.161.198.131），并已生效（ping 一下确认）。
#   2) 腾讯云轻量控制台「防火墙」已放行 80/443/22（ACME HTTP-01 挑战需要 80 端口可达）。
#
# 用法（在 VPS 上以 root 或 sudo 运行）：
#   UURC_PASSWORD='vibecoding2026' bash switch-domain.sh --domain desktop.example.com --email you@example.com
#
# 不改 uurc-web 容器、不动 basicauth 密码（沿用当前生效的密码）。只重写 Caddy 配置并 reload。
set -euo pipefail

DOMAIN=""; EMAIL=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2;;
    --email)  EMAIL="$2";  shift 2;;
    *) echo "未知参数: $1"; exit 1;;
  esac
done

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "用法: UURC_PASSWORD='xxx' bash switch-domain.sh --domain 你的域名 --email 你的邮箱"
  exit 1
fi

# basicauth 密码：不传则沿用当前默认（与 IP 模式一致），保证车机端已存的密码不变
if [[ -z "${UURC_PASSWORD:-}" ]]; then
  UURC_PASSWORD="88888888"
  echo "⚠️ 未指定 UURC_PASSWORD，沿用当前默认: $UURC_PASSWORD"
fi

echo "==> [1] 生成 basicauth 哈希 (htpasswd bcrypt，兼容 Caddy 2.6.2)"
command -v htpasswd >/dev/null 2>&1 || sudo apt-get install -y apache2-utils
RAW=$(htpasswd -nbB admin "$UURC_PASSWORD" | cut -d: -f2)
HASH=$(echo "$RAW" | sed 's/^\$2y\$/\$2a$/')
echo "    hash 前缀: ${HASH:0:7}... (长度 ${#HASH})"

echo "==> [2] 写入 /etc/caddy/Caddyfile (域名 + Let's Encrypt 模式)"
sudo mkdir -p /etc/caddy
sudo tee /etc/caddy/Caddyfile > /dev/null <<EOF
$DOMAIN {
    tls $EMAIL
    @pair {
        path /pair /pair/* /api/input-bridge /api/input-bridge/* /assets /assets/*
    }
    handle @pair {
        header Permissions-Policy "microphone=(self)"
        header Feature-Policy "microphone 'self'"
        reverse_proxy 127.0.0.1:8787
    }
    handle {
        header Permissions-Policy "microphone=(self)"
        header Feature-Policy "microphone 'self'"
        basicauth {
            1111 $HASH
        }
        reverse_proxy 127.0.0.1:8787
    }
}
:80 {
    redir https://{host}{uri} 301
}
EOF

echo "==> [3] 校验配置语法"
sudo caddy validate --config /etc/caddy/Caddyfile 2>&1 | tail -3

echo "==> [4] 重启 Caddy"
sudo systemctl restart caddy
sleep 3
echo "    caddy 状态: $(sudo systemctl is-active caddy)"

echo "==> [5] 等待 Let's Encrypt 签发并验证 (最多 ~90s)"
OK=0
for i in $(seq 1 18); do
  CODE=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 8 -k -u "admin:$UURC_PASSWORD" "https://$DOMAIN/" 2>/dev/null || echo "000")
  if [[ "$CODE" == "200" ]]; then
    echo "✅ 域名 HTTPS 已生效: https://$DOMAIN/ (HTTP $CODE)"
    OK=1
    break
  fi
  echo "    等待证书签发/传播... ($i) 当前 HTTP=$CODE"
  sleep 5
done

echo ""
if [[ "$OK" == "1" ]]; then
  echo "==================== 切换完成 ===================="
  echo "访问地址: https://$DOMAIN/"
  echo "basicauth 密码(第一层): $UURC_PASSWORD"
  echo "（第二层是 UU 账号登录）"
else
  echo "⚠️ 超时未拿到 200。常见原因："
  echo "   1) DNS A 记录尚未生效（等几分钟重试）。"
  echo "   2) 域名未实名/未备案（香港节点通常无需备案，但部分后缀需实名）。"
  echo "   3) 云防火墙 80 端口未放行。"
  echo "可手动排查：sudo journalctl -u caddy -n 30 | grep -i error"
fi
