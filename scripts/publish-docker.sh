#!/usr/bin/env bash
# ==============================================================================
# Secret Delivery - Docker Hub Multi-Platform 发布脚本
# 支持架构: linux/amd64 (Linux x86_64, Intel Mac), linux/arm64 (Apple Silicon, ARM Linux)
# ==============================================================================

set -Eeuo pipefail

# 默认配置
DEFAULT_PLATFORMS="linux/amd64,linux/arm64"
DEFAULT_IMAGE_NAME="secret-delivery"
DEFAULT_BUILDER_NAME="secret-delivery-builder"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
  printf "${BLUE}[INFO]${NC} %s\n" "$1"
}

log_success() {
  printf "${GREEN}[SUCCESS]${NC} %s\n" "$1"
}

log_warn() {
  printf "${YELLOW}[WARN]${NC} %s\n" "$1"
}

log_error() {
  printf "${RED}[ERROR]${NC} %s\n" "$1" >&2
}

# 打印帮助信息
show_help() {
  cat << 'EOF'
用法:
  bash scripts/publish-docker.sh [选项]

选项:
  -u, --username <USER>       Docker Hub 用户名/组织名 (必填，或通过环境变量 DOCKER_USER 提供)
  -n, --name <NAME>           基础镜像名称 (默认: secret-delivery)
  -t, --tag <TAG>             版本标签 (默认: package.json 中的 version)
  -p, --platforms <PLATS>     目标架构列表 (默认: linux/amd64,linux/arm64)
      --builder <NAME>        指定/复用 buildx builder 名称 (默认: secret-delivery-builder)
      --app-only              仅构建并推送主应用镜像 (app / runner)
      --migrate-only          仅构建并推送迁移镜像 (migrate)
      --no-latest             不额外打 latest 标签
      --no-push               仅构建不推送 (用于本地多架构编译验证)
  -h, --help                  显示帮助信息

环境变量支持:
  DOCKER_USER                 Docker Hub 用户名/组织名
  IMAGE_TAG                   版本标签
  PLATFORMS                   目标架构列表

示例:
  # 1. 登录 Docker Hub (若尚未登录)
  docker login

  # 2. 发布默认版本 (linux/amd64, linux/arm64)
  bash scripts/publish-docker.sh -u mydockerhubuser

  # 3. 指定版本标签和平台
  bash scripts/publish-docker.sh -u mydockerhubuser -t v1.0.0 -p linux/amd64,linux/arm64

  # 4. 本地测试构建 (不推送)
  bash scripts/publish-docker.sh -u mydockerhubuser --no-push
EOF
}

# 检查前置依赖
check_prerequisites() {
  if ! command -v docker >/dev/null 2>&1; then
    log_error "未检测到 docker 命令，请先安装 Docker。"
    exit 1
  fi

  if ! docker buildx version >/dev/null 2>&1; then
    log_error "当前 Docker 不支持 buildx，请启用或安装 Docker Buildx 插件。"
    exit 1
  fi
}

# 获取 package.json 中的版本号
get_package_version() {
  if command -v node >/dev/null 2>&1; then
    node -p "try { require('./package.json').version } catch(e) { '' }"
  else
    grep '"version":' package.json | head -n1 | sed -E 's/.*"version": "([^"]+)".*/\1/'
  fi
}

# 初始化或切换到支持多平台的 builder
setup_builder() {
  local builder="$1"
  log_info "检查 Docker buildx builder: ${builder}..."

  if docker buildx inspect "${builder}" >/dev/null 2>&1; then
    docker buildx use "${builder}" >/dev/null
    log_info "已复用现有 builder: ${builder}"
  else
    log_info "正在创建支持多架构的 builder 实例: ${builder} (driver: docker-container)..."
    docker buildx create --name "${builder}" --driver docker-container --bootstrap --use >/dev/null
    log_success "成功创建并启动 builder: ${builder}"
  fi
}

# 主执行流程
main() {
  local username="${DOCKER_USER:-}"
  local image_name="${DEFAULT_IMAGE_NAME}"
  local tag="${IMAGE_TAG:-}"
  local platforms="${PLATFORMS:-${DEFAULT_PLATFORMS}}"
  local builder_name="${DEFAULT_BUILDER_NAME}"
  local push=true
  local tag_latest=true
  local build_app=true
  local build_migrate=true

  # 解析命令行参数
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -u|--username)
        username="$2"
        shift 2
        ;;
      -n|--name)
        image_name="$2"
        shift 2
        ;;
      -t|--tag)
        tag="$2"
        shift 2
        ;;
      -p|--platforms)
        platforms="$2"
        shift 2
        ;;
      --builder)
        builder_name="$2"
        shift 2
        ;;
      --app-only)
        build_app=true
        build_migrate=false
        shift
        ;;
      --migrate-only)
        build_app=false
        build_migrate=true
        shift
        ;;
      --no-latest)
        tag_latest=false
        shift
        ;;
      --no-push)
        push=false
        shift
        ;;
      -h|--help)
        show_help
        exit 0
        ;;
      *)
        log_error "未知参数: $1"
        show_help
        exit 1
        ;;
    esac
  done

  # 校验必须参数
  if [[ -z "${username}" ]]; then
    log_error "缺少 Docker Hub 用户名/组织名。请通过 -u 参数或 DOCKER_USER 环境变量指定。"
    echo ""
    show_help
    exit 1
  fi

  check_prerequisites

  # 确定 tag
  if [[ -z "${tag}" ]]; then
    tag="$(get_package_version)"
    if [[ -z "${tag}" ]]; then
      tag="latest"
    fi
  fi

  log_info "=== 发布配置 ==="
  printf "  Docker Hub 命名空间: %s\n" "${username}"
  printf "  基础镜像名称:        %s\n" "${image_name}"
  printf "  发布标签 (Tag):      %s\n" "${tag}"
  printf "  目标架构 (Platforms):%s\n" "${platforms}"
  printf "  包含主应用 (app):    %s\n" "${build_app}"
  printf "  包含数据迁移(migrate):%s\n" "${build_migrate}"
  printf "  附加 latest 标签:    %s\n" "${tag_latest}"
  printf "  推送至 Registry:     %s\n" "${push}"
  echo "=================="

  setup_builder "${builder_name}"

  # 记录并在脚本退出时恢复原 buildx builder
  local prev_builder
  prev_builder="$(docker buildx ls 2>/dev/null | grep '\*' | awk '{print $1}' | tr -d '*' || true)"
  if [[ -n "${prev_builder}" && "${prev_builder}" != "${builder_name}" ]]; then
    trap 'docker buildx use "${prev_builder}" >/dev/null 2>&1 || true' EXIT
  fi

  local app_image="${username}/${image_name}"
  local migrate_image="${username}/${image_name}-migrate"

  # 构建参数准备
  local push_arg="--push"
  if [[ "${push}" != "true" ]]; then
    push_arg=""
    log_warn "处于 --no-push 模式，构建产物将不会推送到远程 Docker Hub。"
  fi

  # 1. 构建并推送 Migrate 镜像
  if [[ "${build_migrate}" == "true" ]]; then
    log_info "正在构建 Migrate 镜像 [${platforms}] -> ${migrate_image}:${tag}..."
    local migrate_tags=("-t" "${migrate_image}:${tag}")
    if [[ "${tag_latest}" == "true" && "${tag}" != "latest" ]]; then
      migrate_tags+=("-t" "${migrate_image}:latest")
    fi

    # 执行 buildx build
    if [[ -n "${push_arg}" ]]; then
      docker buildx build \
        --platform "${platforms}" \
        --target migrate \
        "${migrate_tags[@]}" \
        "${push_arg}" \
        .
    else
      docker buildx build \
        --platform "${platforms}" \
        --target migrate \
        "${migrate_tags[@]}" \
        .
    fi
    log_success "Migrate 镜像构建完成: ${migrate_image}:${tag}"
  fi

  # 2. 构建并推送 App (runner) 镜像
  if [[ "${build_app}" == "true" ]]; then
    log_info "正在构建 App 镜像 [${platforms}] -> ${app_image}:${tag}..."
    local app_tags=("-t" "${app_image}:${tag}")
    if [[ "${tag_latest}" == "true" && "${tag}" != "latest" ]]; then
      app_tags+=("-t" "${app_image}:latest")
    fi

    # 执行 buildx build
    if [[ -n "${push_arg}" ]]; then
      docker buildx build \
        --platform "${platforms}" \
        --target runner \
        "${app_tags[@]}" \
        "${push_arg}" \
        .
    else
      docker buildx build \
        --platform "${platforms}" \
        --target runner \
        "${app_tags[@]}" \
        .
    fi
    log_success "App 镜像构建完成: ${app_image}:${tag}"
  fi

  echo ""
  log_success "🎉 镜像发布流程顺利完成！"
  if [[ "${push}" == "true" ]]; then
    echo "公开镜像地址:"
    [[ "${build_app}" == "true" ]] && echo "  - 应用镜像: docker pull ${app_image}:${tag}"
    [[ "${build_migrate}" == "true" ]] && echo "  - 迁移镜像: docker pull ${migrate_image}:${tag}"
  fi
}

main "$@"
