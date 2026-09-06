#!/usr/bin/env bash
# 在香港 VPS（Ubuntu 24.04）上一键部署 uurc-web + Caddy
#
# 两种用法：
#   1) 无域名（临时验证，自签证书）：
#        UURC_PASSWORD='你的强密码' sudo bash deploy-vps.sh
#   2) 有域名（正式，Let's Encrypt 受信证书）：
#        UURC_PASSWORD='你的强密码' sudo bash deploy-vps.sh --domain desktop.example.com --email you@example.com
#
# 已根据 VPS 实测修复（Caddy 2.6.2 老版本）：
#   - basicauth 哈希用 htpasswd(bcrypt)，避免 caddy hash-password 在老版本下返回空/含换行。
#   - basicauth 语法为 `admin $HASH`（用户名在前），不是 `/`。
#   - IP 模式改用 openssl 显式自签证书（tls internal 在老版本下会因无法安装内部 CA 而握手失败）。
#   - 域名模式用 `tls $EMAIL` 走 Let's Encrypt（HTTP-01，需 80 端口可达）。
set -euo pipefail

DOMAIN=""; EMAIL=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2;;
    --email)  EMAIL="$2";  shift 2;;
    *) echo "未知参数: $1"; exit 1;;
  esac
done

echo "==> [1/7] 安装依赖 (docker / caddy / ufw / apache2-utils)"
sudo apt-get update -y
sudo apt-get install -y docker.io docker-compose-v2 caddy ufw apache2-utils
sudo systemctl enable --now docker

echo "==> [2/7] 准备 basicauth 密码"
if [[ -z "${UURC_PASSWORD:-}" ]]; then
  UURC_PASSWORD=$(openssl rand -base64 12 | tr -dc 'A-Za-z0-9' | head -c 16)
  echo "⚠️ 未设 UURC_PASSWORD，已随机生成: $UURC_PASSWORD  （请保存！这是车机登录第一层密码）"
fi
RAW=$(htpasswd -nbB admin "$UURC_PASSWORD" | cut -d: -f2)
HASH=$(echo "$RAW" | sed 's/^\$2y\$/\$2a$/')
echo "    basicauth hash 已生成。"

echo "==> [3/7] 生成 /etc/caddy/Caddyfile"
sudo mkdir -p /etc/caddy
if [[ -n "$DOMAIN" ]]; then
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
  ACCESS_URL="https://$DOMAIN"
else
  # IP 自签模式：用 openssl 显式生成证书（避免 tls internal 在老 Caddy 下因装 CA 失败而握手断）
  PUBLIC_IP=$(curl -sS --max-time 8 ifconfig.me || echo "43.161.198.131")
  sudo openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout /etc/caddy/key.pem -out /etc/caddy/cert.pem \
    -days 365 -subj "/CN=$PUBLIC_IP" 2>/dev/null
  sudo chmod 644 /etc/caddy/key.pem /etc/caddy/cert.pem
  sudo tee /etc/caddy/Caddyfile > /dev/null <<EOF
:443 {
    tls /etc/caddy/cert.pem /etc/caddy/key.pem
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
  ACCESS_URL="https://$PUBLIC_IP"
fi

echo "==> [4/7] 拉取 uurc-web 仓库"
if [[ -d /opt/uurc-web/.git ]]; then
  sudo git -C /opt/uurc-web pull --ff-only
else
  sudo git clone --depth 1 https://github.com/andy562560/uurc-web.git /opt/uurc-web
fi

echo "==> [5/7] 启动 uurc-web 容器"
cd /opt/uurc-web
sudo docker compose up -d

echo "==> [6/7] 启动 Caddy"
sudo systemctl restart caddy
sudo systemctl enable caddy

echo "==> [7/7] 防火墙放 80/443/22"
sudo ufw allow 22,80,443/tcp
sudo ufw --force enable || true

echo ""
echo "==================== DONE ===================="
echo "访问地址: $ACCESS_URL"
echo "basicauth 密码(第一层): $UURC_PASSWORD"
echo "（第二层是 UU 账号登录）"
echo "⚠️ 若用 IP 自签模式，车机浏览器会提示证书不安全，需手动'接受风险继续'。"
echo "⚠️ 腾讯云轻量控制台『防火墙』也需放行 80/443/22（与上面 ufw 是两层）。"
echo "拿到域名后重跑: UURC_PASSWORD='同密码' sudo bash switch-domain.sh --domain 你的域名 --email 你的邮箱"
